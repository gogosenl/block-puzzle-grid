import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  FlatList,
  Image,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  StatusBar as RNStatusBar,
  Text,
  Vibration,
  View,
  useWindowDimensions,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import { useIAP } from 'expo-iap';
import * as StoreReview from 'expo-store-review';
import { StatusBar } from 'expo-status-bar';

let OptionalAudio = null;
try {
  const audioModuleName = 'expo-av';
  OptionalAudio = require(audioModuleName).Audio;
} catch (error) {
  OptionalAudio = null;
}

let AdsModule = null;
try {
  const adsModuleName = 'react-native-google-mobile-ads';
  AdsModule = require(adsModuleName);
} catch (error) {
  AdsModule = null;
}
const mobileAds = AdsModule?.default || AdsModule;
const {
  AdEventType,
  InterstitialAd,
  MaxAdContentRating,
  RewardedAd,
  RewardedAdEventType,
  TestIds,
} = AdsModule || {};

const TOTAL_LEVELS = 640;
const APP_VERSION = '1.0.25';
const APP_STORE_ID = '6800597451';
const ANDROID_PACKAGE_NAME = 'com.gorsengames.puzzlegrid';
const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;
const APP_STORE_REVIEW_URL = `itms-apps://itunes.apple.com/app/id${APP_STORE_ID}?action=write-review`;
const APP_STORE_LOOKUP_URL = 'https://itunes.apple.com/lookup?bundleId=com.gorsengames.puzzlegrid&country=tr';
const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_NAME}`;
const PLAY_STORE_DEEP_LINK = `market://details?id=${ANDROID_PACKAGE_NAME}`;
const LEVELS_PER_THEME = 100;
const REWARD_START_LEVEL = 1;
const HINT_REWARD_PER_LEVEL = 1;
const LAYER_REWARD_PER_LEVEL = 1;
const ONE_TIME_STARTER_GRANT_ID = 'starter-coins-10000-v1';
const ONE_TIME_STARTER_GRANT_AMOUNT = 0;
const HINT_COST = 3;
const MUSIC_SETTINGS_VERSION = 1;
const ADMOB_USE_TEST_REWARDED_ADS = false;
const ADMOB_USE_TEST_INTERSTITIAL_ADS = false;
const ADMOB_ANDROID_REWARDED_UNIT_ID = 'ca-app-pub-2671380652899301/1744198173';
const ADMOB_ANDROID_INTERSTITIAL_UNIT_ID = 'ca-app-pub-2671380652899301/5816405200';
const ADMOB_IOS_REWARDED_UNIT_ID = 'ca-app-pub-2671380652899301/3753831141';
const ADMOB_IOS_INTERSTITIAL_UNIT_ID = 'ca-app-pub-2671380652899301/7852858258';
const STORE_PURCHASES_ENABLED = Platform.OS === 'ios' || Platform.OS === 'android';
const AD_LOAD_TIMEOUT_MS = 12000;
const LAYER_CONFIGS = [
  { layer: 1, grid: 3, start: 1, end: 3, cost: null },
  { layer: 2, grid: 4, start: 4, end: 21, cost: null },
  { layer: 3, grid: 5, start: 22, end: 40, cost: 55 },
  { layer: 4, grid: 6, start: 41, end: 190, cost: 150 },
  { layer: 5, grid: 7, start: 191, end: 340, cost: 150 },
  { layer: 6, grid: 8, start: 341, end: 490, cost: 150 },
  { layer: 7, grid: 9, start: 491, end: 640, cost: 150 },
];
const LAYER_GATE_COSTS = LAYER_CONFIGS.reduce((costs, config) => {
  if (config.cost) costs[config.start - 1] = config.cost;
  return costs;
}, {});
const DEFAULT_SETTINGS = {
  sound: true,
  music: true,
  vibration: true,
  language: 'en',
  languageSelected: false,
  musicVersion: MUSIC_SETTINGS_VERSION,
};
const DAILY_REWARD = { hint: 5, layer: 2 };
const SETTINGS_FILE = 'puzzle-settings.json';
const DAILY_FILE = 'puzzle-daily.json';
const PROGRESS_FILE = 'puzzle-progress.json';
const REVIEW_PROMPT_FILE = 'puzzle-review-prompt.json';
const REVIEW_PROMPT_FIRST_LEVEL = 8;
const REVIEW_PROMPT_LEVEL_INTERVAL = 20;
const STAR_SCORING_VERSION = 2;
const PROGRESS_PERSISTENCE_ENABLED = true;
const SFX = {
  place: require('./assets/sfx/place.wav'),
  wrong: require('./assets/sfx/wrong.wav'),
  complete: require('./assets/sfx/complete.wav'),
  coin: require('./assets/sfx/coin.wav'),
  tap: require('./assets/sfx/tap.wav'),
  unlock: require('./assets/sfx/unlock.wav'),
};
const MUSIC = {
  background: require('./assets/sfx/background_music.wav'),
};

function getTodayKey() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getStorageFile(fileName) {
  return new FileSystem.File(FileSystem.Paths.document, fileName);
}

async function readStorageText(fileName) {
  const file = getStorageFile(fileName);
  if (!file.exists) throw new Error(`${fileName} not found`);
  return file.text();
}

async function writeStorageText(fileName, content) {
  const file = getStorageFile(fileName);
  if (!file.exists) {
    file.create({ intermediates: true });
  }
  file.write(content);
}

function clampNumber(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function sanitizeCompletedLevels(items) {
  if (!Array.isArray(items)) return [];
  return [...new Set(items.map((item) => clampNumber(item, 1, TOTAL_LEVELS, 0)).filter((item) => item >= 1))];
}

function sanitizeLevelStars(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value).reduce((stars, [levelKey, starValue]) => {
    const levelNumber = clampNumber(levelKey, 1, TOTAL_LEVELS, 0);
    if (levelNumber < 1) return stars;
    stars[levelNumber] = clampNumber(starValue, 1, 3, 1);
    return stars;
  }, {});
}

function compareVersions(left, right) {
  const leftParts = String(left || '').split('.').map((part) => parseInt(part, 10) || 0);
  const rightParts = String(right || '').split('.').map((part) => parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function getStoreWebUrl() {
  return Platform.OS === 'android' ? PLAY_STORE_URL : APP_STORE_URL;
}

function getStoreReviewUrl() {
  return Platform.OS === 'android' ? PLAY_STORE_DEEP_LINK : APP_STORE_REVIEW_URL;
}

async function openStoreUrl(url = getStoreWebUrl()) {
  const fallbackUrl = getStoreWebUrl();
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
      return;
    }
  } catch (error) {
    console.warn('Store deep link failed', error);
  }
  Linking.openURL(fallbackUrl).catch((error) => {
    console.warn('Store web link failed', error);
  });
}
const STORE_PACKAGES = {
  premium: [{ id: 'puzzlegrid_remove_ads', title: 'Remove Ads', amount: 0, price: '199,99 TL' }],
  hint: [
    { id: 'hint_small', title: 'Kucuk Ipucu', amount: 30, price: '29,99 TL' },
    { id: 'hint_medium', title: 'Orta Ipucu', amount: 85, price: '69,99 TL', best: true },
    { id: 'hint_large', title: 'Buyuk Ipucu', amount: 200, price: '149,99 TL' },
  ],
  layer: [
    { id: 'layer_small', title: 'Kucuk Katman', amount: 120, price: '39,99 TL' },
    { id: 'layer_medium', title: 'Orta Katman', amount: 420, price: '89,99 TL', best: true },
    { id: 'layer_large', title: 'Buyuk Katman', amount: 1000, price: '199,99 TL' },
  ],
};
const STORE_PRODUCT_IDS = Object.values(STORE_PACKAGES).flat().map((pack) => pack.id);
const STORE_PACKAGE_BY_ID = Object.values(STORE_PACKAGES).flat().reduce((items, pack) => {
  items[pack.id] = pack;
  return items;
}, {});
const STORE_PACKAGE_TYPE_BY_ID = {
  puzzlegrid_remove_ads: 'premium',
  hint_small: 'hint',
  hint_medium: 'hint',
  hint_large: 'hint',
  layer_small: 'layer',
  layer_medium: 'layer',
  layer_large: 'layer',
};

const I18N = {
  tr: {
    ok: 'Tamam', cancel: 'Vazgeç', confirm: 'Onayla', use: 'Kullan', continue: 'Devam',
    play: 'Oyna', levels: 'Bölümler', shop: 'Mağaza', back: 'Geri',
    settings: 'Ayarlar', settingsSubtitle: 'Oyun Deneyimini Düzenle',
    sound: 'Ses', soundDesc: 'Parça, Hata, Bölüm Ve Para Efektleri',
    vibration: 'Titreşim', vibrationDesc: 'Bölüm Geçilince Kısa Titreşim',
    music: 'Müzik', musicDesc: 'Arka Plan Müziği', language: 'Dil',
    languagePromptTitle: 'Dil Seçimi', languagePromptText: 'Oyunun ana dili İngilizce. İstersen Türkçe seçerek devam edebilirsin.',
    languagePromptContinue: 'Devam Et',
    restorePurchases: 'Satın Alımları Geri Yükle', privacy: 'Gizlilik Politikası', terms: 'Kullanım Şartları',
    dailyKicker: 'Günlük Ödül', dailyTitle: 'Bugünkü Hediyen Hazır',
    dailyText: 'Her gün giriş yaptığında yeni bir ödül alabilirsin.', dailyClaim: 'Al Ve Devam Et',
    homeSubtitle: 'Parçaları çerçeveden al, tabloyu tamamla',
    insufficientLayer: 'Katman Parası Yetmiyor', insufficientHint: 'İpucu Parası Yetmiyor',
    insufficientText: (needed, current) => `Bu işlem için ${needed} gerekiyor. Şu anda ${current} var.`,
    storeSubtitle: 'İpucu Ve Katman Parası Paketleri', hintCurrency: 'İpucu Parası', layerCurrency: 'Katman Parası',
    bestValue: 'En Mantıklı', storeLegal: Platform.OS === 'ios' ? 'Ödemeler App Store tarafından güvenli şekilde işlenir.' : 'Ödemeler Google Play tarafından güvenli şekilde işlenir.',
    storeComingSoon: 'Yakında', storeDisabledText: 'Satın almalar yakında eklenecek. Bu sürümde ödeme alınmaz.',
    storeLoading: 'Yükleniyor', storeBuying: 'Satın Alma Açılıyor...', storeUnavailable: 'Ürünler hazır değil. App Store bilgilerini kontrol et.',
    purchaseCancelled: 'Satın alma iptal edildi.', purchaseFailed: (reason) => `Satın alma başarısız${reason ? `: ${reason}` : '.'}`,
    reviewTitle: 'Puzzle Grid\'i Beğendin Mi?',
    reviewText: 'Kısa bir yorum oyunun büyümesine çok yardımcı olur.',
    reviewLater: 'Sonra',
    reviewNow: 'Yorum Yap',
    updateTitle: 'Yeni Güncelleme Var',
    updateText: 'Daha iyi bir oyun deneyimi için son sürümü yükleyebilirsin.',
    updateLater: 'Daha Sonra',
    updateNow: 'Güncelle',
    packageTitles: { hint_small: 'Küçük İpucu', hint_medium: 'Orta İpucu', hint_large: 'Büyük İpucu', layer_small: 'Küçük Katman', layer_medium: 'Orta Katman', layer_large: 'Büyük Katman' },
    tryIt: 'Sen Dene', tutorialSubtitle: 'Parçaları tutup 2x2 alana yerleştir.', pieces: 'Parçalar', hold: 'Tut',
    firstMovesDone: 'İlk Hamleler Tamam', ready: 'Hazırsın!',
    tutorialCongrats: 'Parçaları yerine oturtmayı öğrendin. Şimdi asıl oyun ekranındaki butonları kısa bir turla tanıtalım.',
    introduceButtons: 'Butonları Tanıt',
    newLevel: 'Yeni Bölüm', levelLabel: 'Bölüm', levelReady: 'Hazır Mısın?',
    levelTimeInfo: (seconds) => `Bu bölümü tamamlamak için ${seconds} saniyen var.`, secondsUnit: 'Saniye',
    timerStartsOnPlay: 'Süre, Başla düğmesine dokunduğunda başlar.', startLevelButton: 'Başla',
    remainingTime: 'Kalan Süre',
    realFunTitle: 'Gerçek Eğlence Başlıyor',
    realFunText: 'Güzel ve basit kısımları hallettik. Şimdi 4x4 alanda daha akıllı parçalar seni bekliyor.',
    layerOpenedTitle: (grid) => `${grid}x${grid} Katmanı Açıldı`,
    layerOpenedText: 'Tebrikler! Yeni katmanda daha büyük alanlar ve daha keyifli bulmacalar var.',
    onboarding: {
      home: ['Ana Sayfa', 'Buradan ana ekrana dönersin.'],
      levels: ['Bölümler', 'Bölüm haritasını ve katmanları buradan açarsın.'],
      settings: ['Ayarlar', 'Ses, titreşim, dil ve satın alma ayarlarını buradan değiştirirsin.'],
      store: ['Mağaza', 'İpucu ve katman parasını paketler halinde buradan alırsın.'],
      undo: ['Geri Al', 'Son hamleni geri alır.'],
      hint: ['İpucu', 'Bir parçayı doğru yere yerleştirir.'],
    },
    levelMap: 'Bölüm Haritası', levelRange: (start, end) => `${start}-${end} Bölüm`, layerTitle: (label) => `${label} Katmanı`,
    locked: 'Kilitli', openCount: (open, total) => `${open}/${total} Açık`,
    unlock: (have, cost) => `Aç ${have}/${cost}`, openCost: (cost) => `Aç ${cost}`, openInOrder: 'Sırayla Aç',
    completedBang: 'Geçildi!', completed: 'Geçildi', newlyOpened: 'Yeni Açıldı',
    congrats: 'Tebrikler!', layerCongrats: (grid) => `Tebrikler! ${grid}x${grid} katmanı açıldı. Yeni bulmacalar hazır.`,
    layerUnlockOpening: (label) => `${label} katmanını açtınız`,
    firstLevelOpening: 'İlk bölüm açılıyor...',
    unlockLayerQuestion: 'Yeni Katman Açılsın Mı?', unlockLayerSpend: 'Bu işlem katman parası harcayacak.',
    trayHint: 'Tut ve yukarıya sürükle.', successTitle: 'Bölüm Tamam!', successMoves: (time) => `${time} süre kaldı.`, bestMoves: (time) => `Bölüm süresi: ${time}`,
    timeUpTitle: 'Süre Bitti', timeUpText: 'Bu bölümü süre içinde tamamlayamadın.', tryAgain: 'Baştan Başla',
    continueWithAd: 'Devam Et', extraTime: (seconds) => `+${formatTime(seconds)}`, extraTimeGranted: (seconds) => `${seconds} saniye eklendi. Devam edebilirsin.`,
    extraTimeAdUnavailable: 'Video şu anda hazır değil. Bölümü baştan başlatabilirsin.',
    extraTimeAdSkipped: 'Video tamamlanmadığı için ek süre verilmedi.',
    extraTimeAdFailed: (reason) => `Video açılamadı${reason ? `: ${reason}` : '.'}`,
    completedBefore: 'Bu bölüm daha önce geçildi.', noRewardFirst10: 'İlk 10 bölümde ödül yok, yeni bölüm açılıyor.',
    rewardsAdded: 'Kazandıkların bakiyene eklendi.', hint: 'İpucu', layer: 'Katman',
    doubleCounting: '2x Ödül Sayılıyor', doubleTaken: '2x Ödül Alındı', doubleWin: '2x Kazan Ve Devam Et',
    noDoubleFirst10: 'İlk 10 bölümde 2x yok', rewardNotRepeated: 'Ödül tekrar verilmez',
    adLoading: 'Reklam Yükleniyor...',
    adNotReadyShort: 'Reklam Yok',
    adUnavailable: 'Reklam hazır değil. Normal devam butonunu kullanabilirsin.',
    adFailed: (reason) => `2x reklam açılmadı${reason ? `: ${reason}` : '.'}`,
    adSkipped: 'Reklam tamamlanmadı. 2x ödül verilmedi.',
    hintQuestion: 'İpucu Kullanılsın Mı?', hintSpendText: 'Ücretsiz hakkın bitti. Bu ipucu 3 ipucu parası harcayacak.',
    msgPlacePieces: 'Parçaları kutulara yerleştir.', msgComplete: 'Bölüm tamamlandı.', msgTimeUp: 'Süre bitti. Tekrar deneyebilirsin.', msgPieceReturned: 'Parça aşağıya geri alındı.',
    msgPiecePlaced: 'Parça kutuya oturdu.', msgWrongDrop: 'Bu alana oturmadı, parça eski yerine döndü.', msgReset: 'Bölüm sıfırlandı.',
    msgNewLevelOpened: 'Yeni bölüm açıldı.', msgLevelStarted: (level) => `Bölüm ${level} başladı.`,
    msgAllDone: 'Tebrikler, tüm bölümler bitti.', msgUnlockLayerInLevels: 'Yeni katmanı Bölümler ekranındaki Diğer Katman butonundan aç.',
    msgNewLevelReady: 'Yeni bölüm hazır.', msgNoUndo: 'Geri alınacak hamle yok.', msgUndo: 'Son hamle geri alındı.',
    msgNoHint: 'İpucu verilecek parça kalmadı.', msgPaidHint: (cost) => `${cost} ipucu parası harcandı. Bir parça yerleştirildi.`,
    msgHintPieceLocked: 'İpucu parçasının yeri değiştirilemez.',
    msgFreeHint: 'Ücretsiz ipucu kullanıldı.', msgPurchase: (title, amount) => `${title} alındı: +${amount}`,
    msgRestore: 'Satın alımlar kontrol edildi.',
    msgLayerUnlocked: (cost) => `${cost} katman parası harcandı. Yeni bölümler açıldı.`,
    msgLevelLocked: 'Bu bölüm henüz kilitli.', msgLevelOpened: (level) => `Bölüm ${level} açıldı.`,
  },
  en: {
    ok: 'OK', cancel: 'Cancel', confirm: 'Confirm', use: 'Use', continue: 'Continue',
    play: 'Play', levels: 'Levels', shop: 'Shop', back: 'Back',
    settings: 'Settings', settingsSubtitle: 'Adjust Your Game Experience',
    sound: 'Sound', soundDesc: 'Piece, Error, Level, And Coin Effects',
    vibration: 'Vibration', vibrationDesc: 'Short Vibration After Completing A Level',
    music: 'Music', musicDesc: 'Background Music', language: 'Language',
    languagePromptTitle: 'Choose Language', languagePromptText: 'The main language is English. You can switch to Turkish before continuing.',
    languagePromptContinue: 'Continue',
    restorePurchases: 'Restore Purchases', privacy: 'Privacy Policy', terms: 'Terms Of Use',
    dailyKicker: 'Daily Reward', dailyTitle: "Today's Gift Is Ready",
    dailyText: 'Come back every day to claim a new reward.', dailyClaim: 'Claim And Continue',
    homeSubtitle: 'Pick pieces from the tray and complete the board',
    insufficientLayer: 'Not Enough Layer Coins', insufficientHint: 'Not Enough Hint Coins',
    insufficientText: (needed, current) => `This action needs ${needed}. You currently have ${current}.`,
    storeSubtitle: 'Hint And Layer Coin Packs', hintCurrency: 'Hint Coins', layerCurrency: 'Layer Coins',
    bestValue: 'Best Value', storeLegal: Platform.OS === 'ios' ? 'Payments are securely processed by the App Store.' : 'Payments are securely processed by Google Play.',
    storeComingSoon: 'Coming Soon', storeDisabledText: 'Purchases will be available in a future update. No payment is charged in this version.',
    storeLoading: 'Loading', storeBuying: 'Opening Purchase...', storeUnavailable: 'Products are not ready. Check App Store product setup.',
    purchaseCancelled: 'Purchase cancelled.', purchaseFailed: (reason) => `Purchase failed${reason ? `: ${reason}` : '.'}`,
    reviewTitle: 'Enjoying Puzzle Grid?',
    reviewText: 'A quick review helps the game grow.',
    reviewLater: 'Later',
    reviewNow: 'Review',
    updateTitle: 'Update Available',
    updateText: 'Install the latest version for a better puzzle experience.',
    updateLater: 'Later',
    updateNow: 'Update',
    packageTitles: { hint_small: 'Small Hint Pack', hint_medium: 'Medium Hint Pack', hint_large: 'Large Hint Pack', layer_small: 'Small Layer Pack', layer_medium: 'Medium Layer Pack', layer_large: 'Large Layer Pack' },
    tryIt: 'Your Turn', tutorialSubtitle: 'Drag the pieces into the 2x2 board.', pieces: 'Pieces', hold: 'Hold',
    firstMovesDone: 'First Moves Complete', ready: 'You Are Ready!',
    tutorialCongrats: 'You learned how to place pieces. Now let us quickly show the main game buttons.',
    introduceButtons: 'Show Buttons',
    newLevel: 'New Level', levelLabel: 'Level', levelReady: 'Ready?',
    levelTimeInfo: (seconds) => `You have ${seconds} seconds to complete this level.`, secondsUnit: 'Seconds',
    timerStartsOnPlay: 'The timer starts when you tap Start.', startLevelButton: 'Start',
    remainingTime: 'Time Left',
    realFunTitle: 'The Real Fun Begins',
    realFunText: 'You finished the easy warm-up. Now smarter pieces await on the 4x4 board.',
    layerOpenedTitle: (grid) => `${grid}x${grid} Layer Unlocked`,
    layerOpenedText: 'Congrats! This new layer has bigger boards and more satisfying puzzles.',
    onboarding: {
      home: ['Home', 'Return to the main screen from here.'],
      levels: ['Levels', 'Open the level map and layers from here.'],
      settings: ['Settings', 'Change sound, vibration, language and purchase options here.'],
      store: ['Shop', 'Buy hint and layer coin packs here.'],
      undo: ['Undo', 'Undo your last move.'],
      hint: ['Hint', 'Places one piece in the correct spot.'],
    },
    levelMap: 'Level Map', levelRange: (start, end) => `${start}-${end} Levels`, layerTitle: (label) => `${label} Layer`,
    locked: 'Locked', openCount: (open, total) => `${open}/${total} Open`,
    unlock: (have, cost) => `Open ${have}/${cost}`, openCost: (cost) => `Open ${cost}`, openInOrder: 'Open In Order',
    completedBang: 'Completed!', completed: 'Completed', newlyOpened: 'Newly Opened',
    congrats: 'Congrats!', layerCongrats: (grid) => `Congrats! The ${grid}x${grid} layer is unlocked. New puzzles are ready.`,
    layerUnlockOpening: (label) => `You unlocked the ${label} layer`,
    firstLevelOpening: 'Opening the first level...',
    unlockLayerQuestion: 'Unlock New Layer?', unlockLayerSpend: 'This will spend layer coins.',
    trayHint: 'Hold and drag upward.', successTitle: 'Level Complete!', successMoves: (time) => `${time} left.`, bestMoves: (time) => `Level time: ${time}`,
    timeUpTitle: 'Time Is Up', timeUpText: 'You did not complete this level before the timer ended.', tryAgain: 'Start Over',
    continueWithAd: 'Continue', extraTime: (seconds) => `+${formatTime(seconds)}`, extraTimeGranted: (seconds) => `${seconds} seconds added. Keep going.`,
    extraTimeAdUnavailable: 'The video is not ready. You can restart the level.',
    extraTimeAdSkipped: 'No extra time was added because the video was not completed.',
    extraTimeAdFailed: (reason) => `The video could not open${reason ? `: ${reason}` : '.'}`,
    completedBefore: 'This level was already completed.', noRewardFirst10: 'No rewards in the first 10 levels, opening the next level.',
    rewardsAdded: 'Your rewards were added to your balance.', hint: 'Hint', layer: 'Layer',
    doubleCounting: 'Counting 2x Reward', doubleTaken: '2x Reward Claimed', doubleWin: 'Claim 2x And Continue',
    noDoubleFirst10: 'No 2x in the first 10 levels', rewardNotRepeated: 'Reward cannot be repeated',
    adLoading: 'Loading Ad...',
    adNotReadyShort: 'No Ad',
    adUnavailable: 'Ad is not ready. You can use the normal continue button.',
    adFailed: (reason) => `2x ad did not open${reason ? `: ${reason}` : '.'}`,
    adSkipped: 'Ad was not completed. 2x reward was not given.',
    hintQuestion: 'Use a hint?', hintSpendText: 'Your free hints are gone. This hint will spend 3 hint coins.',
    msgPlacePieces: 'Place the pieces into the board.', msgComplete: 'Level complete.', msgTimeUp: 'Time is up. You can try again.', msgPieceReturned: 'Piece returned to the tray.',
    msgPiecePlaced: 'Piece placed.', msgWrongDrop: 'It does not fit there, the piece returned.', msgReset: 'Level reset.',
    msgNewLevelOpened: 'New level unlocked.', msgLevelStarted: (level) => `Level ${level} started.`,
    msgAllDone: 'Congrats, all levels are complete.', msgUnlockLayerInLevels: 'Open the new layer from the Levels screen.',
    msgNewLevelReady: 'New level ready.', msgNoUndo: 'No move to undo.', msgUndo: 'Last move undone.',
    msgNoHint: 'No piece left for a hint.', msgPaidHint: (cost) => `${cost} hint coins spent. One piece was placed.`,
    msgHintPieceLocked: 'Hint piece cannot be moved.',
    msgFreeHint: 'Free hint used.', msgPurchase: (title, amount) => `${title} purchased: +${amount}`,
    msgRestore: 'Purchases checked.',
    msgLayerUnlocked: (cost) => `${cost} layer coins spent. New levels unlocked.`,
    msgLevelLocked: 'This level is still locked.', msgLevelOpened: (level) => `Level ${level} opened.`,
  },
};

const getText = (language) => I18N[language] || I18N.en;

const BOARD_PADDING = 18;
const TRAY_HEADER_SPACE = 52;
const TRAY_PIECE_GAP = 4;
const MODERN_LEVEL_LIMIT = TOTAL_LEVELS;
const MODERN_TRAY_HEADER_SPACE = 60;
const MAP_COLUMNS = 3;
const MAP_CARD_HEIGHT = 104;
const MAP_CARD_MAX_SIZE = 112;
const MAP_ROW_GAP = 9;
const MAP_ROW_HEIGHT = MAP_CARD_HEIGHT + MAP_ROW_GAP;
const GAME_ART = {
  nodes: {
    normal: require('./assets/game-art/node_normal.png'),
    current: require('./assets/game-art/node_current.png'),
    completed: require('./assets/game-art/node_completed.png'),
    locked: require('./assets/game-art/node_locked.png'),
    gate: require('./assets/game-art/node_gate.png'),
  },
  coins: {
    hint: require('./assets/game-art/coin_hint_premium.png'),
    layer: require('./assets/game-art/coin_layer_premium.png'),
  },
  stars: {
    filled: require('./assets/game-art/star_filled_premium.png'),
    empty: require('./assets/game-art/star_empty_premium.png'),
  },
  brand: {
    gorsen: require('./assets/game-art/gorsen_games_logo.png'),
  },
};

const PRELOAD_ART = [
  ...Object.values(GAME_ART.nodes),
  ...Object.values(GAME_ART.coins),
  ...Object.values(GAME_ART.stars),
  ...Object.values(GAME_ART.brand),
];

const UI_ICONS = {
  home: require('./assets/ui-icons/icon-home-premium.png'),
  levels: require('./assets/ui-icons/icon-levels-premium.png'),
  hint: require('./assets/ui-icons/icon-hint-premium.png'),
  undo: require('./assets/ui-icons/icon-undo-premium.png'),
  restart: require('./assets/ui-icons/icon-restart-premium.png'),
  settings: require('./assets/ui-icons/icon-settings-premium.png'),
};


const THEMES = {
  minimal: {
    name: 'Minimal',
    bg: '#F7F2EA',
    text: '#201D1D',
    muted: '#5F574D',
    soft: '#EEE5D8',
    cell: '#FFFDF8',
    line: '#DED4C4',
    button: '#201D1D',
    buttonText: '#FFFFFF',
    accent: '#E86A58',
    card: '#FFFDF8',
    pieces: ['#E86A58', '#F0A23B', '#E5C84F', '#60B989', '#4EA8DE', '#7C6ED6', '#D866A7'],
  },
  pastel: {
    name: 'Pastel',
    bg: '#FFF5F8',
    text: '#33252B',
    muted: '#7D5F6B',
    soft: '#FFE3EB',
    cell: '#FFFAFB',
    line: '#F0BFCE',
    button: '#C14F73',
    buttonText: '#FFFFFF',
    accent: '#FF84A6',
    card: '#FFFAFB',
    pieces: ['#FF84A6', '#FFB86B', '#FFE08A', '#9DE7C4', '#9BD4FF', '#C7B7FF', '#F6A6D7'],
  },
  dark: {
    name: 'Koyu',
    bg: '#171717',
    text: '#F4EFE7',
    muted: '#C9BFB3',
    soft: '#262626',
    cell: '#333333',
    line: '#454545',
    button: '#F4EFE7',
    buttonText: '#171717',
    accent: '#38BDF8',
    card: '#333333',
    pieces: ['#F87171', '#FB923C', '#FACC15', '#34D399', '#38BDF8', '#A78BFA', '#F472B6'],
  },
  forest: {
    name: 'Orman',
    bg: '#EEF7EF',
    text: '#163023',
    muted: '#547262',
    soft: '#D9ECDC',
    cell: '#FBFFFB',
    line: '#BDD8C4',
    button: '#2F7D4F',
    buttonText: '#FFFFFF',
    accent: '#34D399',
    card: '#FBFFFB',
    pieces: ['#2F7D4F', '#34D399', '#84CC16', '#A3E635', '#14B8A6', '#38BDF8', '#FACC15'],
  },
  sunset: {
    name: 'Gun Batimi',
    bg: '#FFF3E8',
    text: '#3B2418',
    muted: '#89614C',
    soft: '#FFE0CC',
    cell: '#FFFAF5',
    line: '#F2C0A2',
    button: '#BF4F2F',
    buttonText: '#FFFFFF',
    accent: '#FB923C',
    card: '#FFFAF5',
    pieces: ['#BF4F2F', '#FB923C', '#F97316', '#F43F5E', '#FDBA74', '#FDE68A', '#A855F7'],
  },
};

const THEME_ORDER = ['minimal', 'pastel', 'dark', 'forest', 'sunset'];


function getMapBackground(level) {
  return null;
}

function getMapWorldName(level) {
  return ['Orman', 'Col', 'Buz', 'Lav', 'Gokyuzu'][Math.min(4, getLayerNumber(level) - 1)];
}

function getMapNodeImage({ gate, locked, completed, active }) {
  if (gate) return GAME_ART.nodes.gate;
  if (locked) return GAME_ART.nodes.locked;
  if (completed) return GAME_ART.nodes.completed;
  if (active) return GAME_ART.nodes.current;
  return GAME_ART.nodes.normal;
}

function createRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function keyOf(row, col) {
  return `${row}:${col}`;
}

function getThemeKey(level) {
  return THEME_ORDER[Math.floor((level - 1) / LEVELS_PER_THEME) % THEME_ORDER.length];
}

function getLayerConfig(layer) {
  return LAYER_CONFIGS.find((config) => config.layer === layer) || LAYER_CONFIGS[LAYER_CONFIGS.length - 1];
}

function getLayerConfigForLevel(level) {
  return LAYER_CONFIGS.find((config) => level >= config.start && level <= config.end) || LAYER_CONFIGS[LAYER_CONFIGS.length - 1];
}

function getLayerCount() {
  return LAYER_CONFIGS.length;
}

function getLayerNumber(level) {
  return getLayerConfigForLevel(level).layer;
}

function getLayerStart(layer) {
  return getLayerConfig(layer).start;
}

function getLayerEnd(layer) {
  return getLayerConfig(layer).end;
}

function getLayerGridLabel(layer) {
  const grid = getLayerConfig(layer).grid;
  return `${grid}x${grid}`;
}

function getLayerCost(layer) {
  return getLayerConfig(layer).cost || null;
}

function getLayerGateCost(level) {
  return LAYER_GATE_COSTS[level] || null;
}

function isLayerGate(level) {
  return getLayerGateCost(level) !== null;
}

function getLevelRewards(level) {
  if (level < REWARD_START_LEVEL) {
    return { hint: 0, layer: 0 };
  }

  return {
    hint: HINT_REWARD_PER_LEVEL,
    layer: LAYER_REWARD_PER_LEVEL,
  };
}

function getLevelTimeLimit(level, generatedLevel = null) {
  const grid = getGridSize(level);
  const fallbackByGrid = {
    3: 12,
    4: 22,
    5: 40,
    6: 58,
    7: 82,
    8: 110,
    9: 142,
  };
  if (!generatedLevel?.pieces?.length) return fallbackByGrid[grid] || 60;

  const movablePieces = generatedLevel.pieces.filter((piece) => !piece.autoLocked).length;
  const boardPlanningTime = { 3: 4, 4: 9, 5: 28, 6: 48, 7: 72, 8: 100, 9: 132 };
  const secondsPerPiece = { 3: 2.6, 4: 2.7, 5: 2.8, 6: 2.9, 7: 3, 8: 3.1, 9: 3.2 };
  const calculated = (boardPlanningTime[grid] || 29) + movablePieces * (secondsPerPiece[grid] || 3.2);
  return Math.max(12, Math.round(calculated));
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function shouldShowCompletionInterstitial(level) {
  return level > 10 && (level - 10) % 3 === 0;
}

function getLevelStarResult(timeLeft, timeLimit) {
  const remainingRatio = timeLimit > 0 ? Math.max(0, Math.min(1, timeLeft / timeLimit)) : 0;
  const stars = remainingRatio >= 0.35 ? 3 : remainingRatio >= 0.12 ? 2 : 1;
  return { stars, timeLimit };
}

function shouldOfferTimedDoubleReward(level) {
  return shouldShowCompletionInterstitial(level);
}

function getResumeLevel(savedLevel, completedLevels) {
  const completed = new Set(completedLevels || []);
  let target = clampNumber(savedLevel, 1, TOTAL_LEVELS, 1);

  while (target < TOTAL_LEVELS && completed.has(target)) {
    target += 1;
  }

  return clampNumber(target, 1, TOTAL_LEVELS, 1);
}

function getAdMobRewardedUnitId() {
  if (Platform.OS === 'ios') return ADMOB_IOS_REWARDED_UNIT_ID;
  return ADMOB_ANDROID_REWARDED_UNIT_ID;
}

function getAdMobInterstitialUnitId() {
  if (Platform.OS === 'ios') return ADMOB_IOS_INTERSTITIAL_UNIT_ID;
  return ADMOB_ANDROID_INTERSTITIAL_UNIT_ID;
}

function hasRewardedAdSupport() {
  return !!(RewardedAd && RewardedAdEventType && AdEventType && (ADMOB_USE_TEST_REWARDED_ADS ? TestIds?.REWARDED : getAdMobRewardedUnitId()));
}

function hasInterstitialAdSupport() {
  return !!(InterstitialAd && AdEventType && (ADMOB_USE_TEST_INTERSTITIAL_ADS ? TestIds?.INTERSTITIAL : getAdMobInterstitialUnitId()));
}

function getAdErrorText(error) {
  if (!error) return '';
  const code = error.code || error.name || '';
  const message = error.message || String(error);
  return [code, message].filter(Boolean).join(': ');
}


function getPuzzleLevel(level) {
  return level;
}

function getGridSize(level) {
  return getLayerConfigForLevel(level).grid;
}

function getAutoLockedPieceCount(level) {
  const layer = getLayerConfigForLevel(level);
  const indexInLayer = level - layer.start + 1;
  if (layer.grid === 4) return indexInLayer <= 30 ? 1 : 0;
  if (layer.grid >= 5) {
    if (indexInLayer <= 25) return 2;
    if (indexInLayer <= 50) return 1;
  }
  return 0;
}

function normalizeCells(cells) {
  const minRow = Math.min(...cells.map((cell) => cell.row));
  const minCol = Math.min(...cells.map((cell) => cell.col));
  return cells.map((cell) => ({ row: cell.row - minRow, col: cell.col - minCol }));
}

function getPieceBounds(piece) {
  return {
    width: Math.max(...piece.cells.map((cell) => cell.col)) + 1,
    height: Math.max(...piece.cells.map((cell) => cell.row)) + 1,
  };
}

function getPieceCells(piece, origin) {
  return piece.cells.map((cell) => keyOf(origin.row + cell.row, origin.col + cell.col));
}

const THREE_BY_THREE_LEVEL_PATTERNS = [
  ['AAA', 'BBB', 'CCC'],
  ['AAB', 'ACB', 'CCB'],
  ['ABB', 'ACB', 'ACC'],
  ['AAB', 'ABB', 'CCC'],
  ['AAA', 'BCC', 'BBC'],
];

function createPatternLevel(level, pattern) {
  const theme = THEMES[getThemeKey(level)];
  const groups = new Map();
  pattern.forEach((line, row) => {
    [...line].forEach((label, col) => {
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push({ row, col });
    });
  });

  const pieces = Array.from(groups.values()).map((cells, index) => {
    const minRow = Math.min(...cells.map((cell) => cell.row));
    const minCol = Math.min(...cells.map((cell) => cell.col));
    return {
      id: `piece-${level}-${index}`,
      color: theme.pieces[index % theme.pieces.length],
      cells: normalizeCells(cells),
      answer: { row: minRow, col: minCol },
      placed: false,
      row: null,
      col: null,
      active: false,
    };
  });

  return { pieces, random: createRandom(level * 991 + 17), size: pattern.length };
}

function getWantedPieceSizeForLevel(size, level, random) {
  if (size === 4) {
    const layer = getLayerConfigForLevel(level);
    const indexInLayer = level - layer.start + 1;
    if (indexInLayer <= 14) return 2 + Math.floor(random() * 2);
    if (indexInLayer <= 34) return 2 + Math.floor(random() * 3);
    return 3 + Math.floor(random() * 3);
  }
  const maxPieceSize = Math.min(5, size);
  return 2 + Math.floor(random() * Math.max(1, maxPieceSize - 1));
}

function getPieceShapeStats(pieces) {
  let singleCount = 0;
  let cornerCount = 0;
  let largestPiece = 0;
  const shapeCounts = new Map();

  pieces.forEach((piece) => {
    const bounds = getPieceBounds(piece);
    largestPiece = Math.max(largestPiece, piece.cells.length);
    if (piece.cells.length === 1) singleCount += 1;
    if (bounds.width > 1 && bounds.height > 1) cornerCount += 1;
    const shapeKey = piece.cells
      .map((cell) => `${cell.row}:${cell.col}`)
      .sort()
      .join('|');
    shapeCounts.set(shapeKey, (shapeCounts.get(shapeKey) || 0) + 1);
  });

  const repeatCount = Array.from(shapeCounts.values()).reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  return { cornerCount, largestPiece, repeatCount, singleCount };
}

function scoreLevelCandidate(candidate, level) {
  const size = getGridSize(level);
  const stats = getPieceShapeStats(candidate.pieces);
  if (size === 4) {
    const layer = getLayerConfigForLevel(level);
    const indexInLayer = level - layer.start + 1;
    const targetPieces = indexInLayer <= 14 ? 6 : indexInLayer <= 34 ? 5 : 4;
    const targetCorners = indexInLayer <= 14 ? 2 : 3;
    return (
      stats.singleCount * 80 +
      Math.abs(candidate.pieces.length - targetPieces) * 12 +
      Math.max(0, targetCorners - stats.cornerCount) * 9 +
      stats.repeatCount * 8 +
      Math.max(0, stats.largestPiece - 5) * 6
    );
  }
  return stats.singleCount * 100 + stats.repeatCount * 10;
}

function createTrayPages(pieces, cellSize, width, height) {
  if (pieces.length === 0) return [[]];
  const pages = [];
  let page = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;

  for (const piece of pieces) {
    const bounds = getPieceBounds(piece);
    const pieceWidth = bounds.width * cellSize;
    const pieceHeight = bounds.height * cellSize;
    let nextX = x;
    let nextY = y;
    let nextRowHeight = rowHeight;

    if (nextX > 0 && nextX + pieceWidth > width) {
      nextX = 0;
      nextY += nextRowHeight + TRAY_PIECE_GAP;
      nextRowHeight = 0;
    }

    if (page.length > 0 && nextY + pieceHeight > height) {
      pages.push(page);
      page = [];
      nextX = 0;
      nextY = 0;
      nextRowHeight = 0;
    }

    page.push(piece);
    x = nextX + pieceWidth + TRAY_PIECE_GAP;
    y = nextY;
    rowHeight = Math.max(nextRowHeight, pieceHeight);
  }

  if (page.length > 0) pages.push(page);
  return pages.length > 0 ? pages : [[]];
}

function buildLevelPieces(level, seedOffset = 0) {
  const puzzleLevel = getPuzzleLevel(level);
  const size = getGridSize(level);
  if (size === 3) {
    const layer = getLayerConfigForLevel(level);
    const indexInLayer = level - layer.start;
    return createPatternLevel(level, THREE_BY_THREE_LEVEL_PATTERNS[indexInLayer % THREE_BY_THREE_LEVEL_PATTERNS.length]);
  }
  const theme = THEMES[getThemeKey(puzzleLevel)];
  const random = createRandom(puzzleLevel * 991 + 17 + seedOffset * 104729);
  const unused = new Set();
  const directions = [
    { row: 1, col: 0 },
    { row: -1, col: 0 },
    { row: 0, col: 1 },
    { row: 0, col: -1 },
  ];

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      unused.add(keyOf(row, col));
    }
  }

  const pieces = [];
  while (unused.size > 0) {
    const unusedKeys = Array.from(unused);
    const firstKey = unusedKeys[Math.floor(random() * unusedKeys.length)];
    const [startRow, startCol] = firstKey.split(':').map(Number);
    const wantedSize = getWantedPieceSizeForLevel(size, level, random);
    const cells = [{ row: startRow, col: startCol }];
    unused.delete(firstKey);

    while (cells.length < wantedSize) {
      const candidates = [];
      cells.forEach((cell) => {
        directions.forEach((direction) => {
          const row = cell.row + direction.row;
          const col = cell.col + direction.col;
          const key = keyOf(row, col);
          if (row >= 0 && row < size && col >= 0 && col < size && unused.has(key)) {
            candidates.push({ row, col, key });
          }
        });
      });

      if (candidates.length === 0) break;
      const picked = candidates[Math.floor(random() * candidates.length)];
      cells.push({ row: picked.row, col: picked.col });
      unused.delete(picked.key);
    }

    const minRow = Math.min(...cells.map((cell) => cell.row));
    const minCol = Math.min(...cells.map((cell) => cell.col));
    const colorIndex = pieces.length % theme.pieces.length;
    pieces.push({
      id: `piece-${level}-${pieces.length}`,
      color: theme.pieces[colorIndex],
      cells: normalizeCells(cells),
      answer: { row: minRow, col: minCol },
      placed: false,
      row: null,
      col: null,
      active: false,
    });
  }

  return { pieces, random, size };
}

function makeLevel(level) {
  let generated = null;
  let bestGenerated = null;
  let bestScore = Infinity;
  const levelSize = getGridSize(level);

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const candidate = buildLevelPieces(level, attempt);
    const singleCount = candidate.pieces.filter((piece) => piece.cells.length === 1).length;
    const score = levelSize <= 4 ? scoreLevelCandidate(candidate, level) : singleCount;
    if (score < bestScore) {
      bestGenerated = candidate;
      bestScore = score;
    }
    if (levelSize > 4 && singleCount <= 3) {
      generated = candidate;
      break;
    }
  }

  const { pieces, random, size } = generated || bestGenerated || buildLevelPieces(level, 0);

  const autoLockedCount = Math.min(getAutoLockedPieceCount(level), Math.max(0, pieces.length - 1));
  const guidedPieces = pieces.map((piece, index) =>
    index < autoLockedCount
      ? {
          ...piece,
          placed: true,
          row: piece.answer.row,
          col: piece.answer.col,
          lockedHint: true,
          autoLocked: true,
        }
      : piece,
  );

  return {
    size,
    pieces: guidedPieces.sort(() => random() - 0.5),
  };
}

function createSnapshot(levelData, positions, movedPieceId = null) {
  return {
    movedPieceId,
    pieces: levelData.pieces.map((piece) => ({
      id: piece.id,
      placed: piece.placed,
      row: piece.row,
      col: piece.col,
      lockedHint: piece.lockedHint,
      autoLocked: piece.autoLocked,
    })),
    positions,
  };
}

function restoreSnapshot(levelData, snapshot) {
  return {
    ...levelData,
    pieces: levelData.pieces.map((piece) => {
      const saved = snapshot.pieces.find((item) => item.id === piece.id);
      return saved
        ? { ...piece, placed: saved.placed, row: saved.row, col: saved.col, lockedHint: saved.lockedHint, autoLocked: saved.autoLocked, active: false }
        : { ...piece, active: false };
    }),
  };
}

const Piece = React.memo(function Piece({ piece, position, cellSize, onDragStart, onDragMove, onDragEnd }) {
  const start = useRef({ x: 0, y: 0 });
  const latestPosition = useRef(position);
  const dragStartHandler = useRef(onDragStart);
  const dragEndHandler = useRef(onDragEnd);
  const drag = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const completeLift = useRef(new Animated.Value(0)).current;
  const currentCellSize = useRef(cellSize);
  const dragStartCellSize = useRef(cellSize);
  const grabOffset = useRef({ x: 0, y: 0 });
  const snapAnimationActive = useRef(false);

  useEffect(() => {
    latestPosition.current = position;
    if (!piece.active) {
      if (snapAnimationActive.current) {
        return;
      }
      drag.setValue({ x: 0, y: 0 });
    }
  }, [drag, piece.active, position]);

  useEffect(() => {
    currentCellSize.current = cellSize;
  }, [cellSize]);

  useEffect(() => {
    dragStartHandler.current = onDragStart;
    dragEndHandler.current = onDragEnd;
  }, [onDragEnd, onDragMove, onDragStart]);

  useEffect(() => {
    if (!piece.pulseKey) return;
    pulse.setValue(1.18);
    Animated.spring(pulse, {
      toValue: 1,
      friction: 5,
      tension: 130,
      useNativeDriver: true,
    }).start();
  }, [piece.pulseKey, pulse]);

  useEffect(() => {
    if (!piece.completeKey) return;
    completeLift.setValue(0);
    Animated.sequence([
      Animated.timing(completeLift, {
        toValue: -14,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.spring(completeLift, {
        toValue: 0,
        friction: 7,
        tension: 90,
        useNativeDriver: true,
      }),
    ]).start();
  }, [completeLift, piece.completeKey]);

  const getGrabCorrection = useCallback(() => {
    const startSize = dragStartCellSize.current || currentCellSize.current || 1;
    const ratio = currentCellSize.current / startSize;
    return {
      x: grabOffset.current.x - grabOffset.current.x * ratio,
      y: grabOffset.current.y - grabOffset.current.y * ratio,
    };
  }, []);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event) => {
          start.current = latestPosition.current;
          dragStartCellSize.current = currentCellSize.current;
          grabOffset.current = {
            x: event.nativeEvent.locationX,
            y: event.nativeEvent.locationY,
          };
          drag.setValue({ x: 0, y: 0 });
          dragStartHandler.current(piece.id);
        },
        onPanResponderMove: (_, gesture) => {
          const correction = getGrabCorrection();
          drag.setValue({ x: gesture.dx + correction.x, y: gesture.dy + correction.y });
        },
        onPanResponderRelease: (_, gesture) => {
          const correction = getGrabCorrection();
          const visualPosition = {
            x: start.current.x + gesture.dx + correction.x,
            y: start.current.y + gesture.dy + correction.y,
          };
          const dragResult = dragEndHandler.current(piece.id, visualPosition);
          if (dragResult?.snapTo) {
            snapAnimationActive.current = true;
            drag.setValue({
              x: visualPosition.x - dragResult.snapTo.x,
              y: visualPosition.y - dragResult.snapTo.y,
            });
            Animated.spring(drag, {
              toValue: { x: 0, y: 0 },
              friction: 7,
              tension: 120,
              useNativeDriver: true,
            }).start(() => {
              snapAnimationActive.current = false;
              drag.setValue({ x: 0, y: 0 });
            });
            return;
          }
          if (dragResult !== false) {
            drag.setValue({ x: 0, y: 0 });
          }
        },
        onPanResponderTerminate: (_, gesture) => {
          const correction = getGrabCorrection();
          const visualPosition = {
            x: start.current.x + gesture.dx + correction.x,
            y: start.current.y + gesture.dy + correction.y,
          };
          const dragResult = dragEndHandler.current(piece.id, visualPosition);
          if (dragResult?.snapTo) {
            snapAnimationActive.current = true;
            drag.setValue({
              x: visualPosition.x - dragResult.snapTo.x,
              y: visualPosition.y - dragResult.snapTo.y,
            });
            Animated.spring(drag, {
              toValue: { x: 0, y: 0 },
              friction: 7,
              tension: 120,
              useNativeDriver: true,
            }).start(() => {
              snapAnimationActive.current = false;
              drag.setValue({ x: 0, y: 0 });
            });
            return;
          }
          if (dragResult !== false) {
            drag.setValue({ x: 0, y: 0 });
          }
        },
        onShouldBlockNativeResponder: () => true,
      }),
    [getGrabCorrection, piece.id],
  );

  const bounds = getPieceBounds(piece);
  const cellBorderColor = 'rgba(32,29,29,0.28)';
  return (
    <Animated.View
      {...responder.panHandlers}
      style={[
        styles.piece,
        {
          left: position.x,
          top: position.y,
          width: bounds.width * cellSize,
          height: bounds.height * cellSize,
          transform: [{ translateX: drag.x }, { translateY: Animated.add(drag.y, completeLift) }, { scale: pulse }],
          zIndex: piece.active ? 30 : piece.placed ? 8 : 16,
        },
      ]}
    >
      {piece.cells.map((cell) => (
        <View
          key={`${piece.id}-${cell.row}-${cell.col}`}
          style={[
            styles.pieceCell,
            {
              width: cellSize,
              height: cellSize,
              left: cell.col * cellSize,
              top: cell.row * cellSize,
              backgroundColor: piece.color,
              borderColor: cellBorderColor,
              borderRadius: 6,
            },
          ]}
        />
      ))}
    </Animated.View>
  );
});

function PuzzleHero({ theme, compact = false }) {
  const cells = Array.from({ length: 25 });

  return (
    <View style={[styles.heroBoard, compact && styles.heroBoardCompact, { backgroundColor: theme.soft, borderColor: theme.line }]}>
      {cells.map((_, index) => (
        <View
          key={index}
          style={[
            styles.heroBoardCell,
            compact && styles.heroBoardCellCompact,
            { backgroundColor: theme.cell, borderColor: theme.line },
          ]}
        />
      ))}
      <View style={[styles.heroPiece, styles.heroPieceOne, compact && styles.heroPieceOneCompact, { backgroundColor: theme.pieces[0] }]} />
      <View style={[styles.heroPiece, styles.heroPieceTwo, compact && styles.heroPieceTwoCompact, { backgroundColor: theme.pieces[3] }]} />
      <View style={[styles.heroPiece, styles.heroPieceThree, compact && styles.heroPieceThreeCompact, { backgroundColor: theme.pieces[4] }]} />
      <View style={[styles.heroPiece, styles.heroPieceFour, compact && styles.heroPieceFourCompact, { backgroundColor: theme.pieces[1] }]} />
    </View>
  );
}

function InsufficientFundsContent({ visible, theme, info, onClose, onStore, t = I18N.en }) {
  if (!visible || !info) return null;
  const coin = info.type === 'layer' ? GAME_ART.coins.layer : GAME_ART.coins.hint;
  const title = info.type === 'layer' ? t.insufficientLayer : t.insufficientHint;
  return (
    <View style={styles.insufficientOverlay}>
      <View style={[styles.insufficientCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
        <View style={[styles.insufficientIconWrap, { backgroundColor: theme.soft, borderColor: theme.line }]}>
          <Image source={coin} style={styles.insufficientIcon} resizeMode="contain" />
        </View>
        <Text style={[styles.insufficientTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.insufficientText, { color: theme.muted }]}>{t.insufficientText(info.needed, info.current)}</Text>
        <View style={styles.insufficientActions}>
          <Pressable style={[styles.insufficientButton, { backgroundColor: theme.soft, borderColor: theme.line }]} onPress={onClose}>
            <Text style={[styles.insufficientButtonText, { color: theme.text }]}>{t.ok}</Text>
          </Pressable>
          <Pressable style={[styles.insufficientButton, { backgroundColor: theme.button, borderColor: theme.button }]} onPress={onStore}>
            <Text style={[styles.insufficientButtonText, { color: theme.buttonText }]}>{t.shop}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function InsufficientFundsModal({ visible, theme, info, onClose, onStore, t = I18N.en }) {
  if (!visible || !info) return null;
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <InsufficientFundsContent visible={visible} theme={theme} info={info} onClose={onClose} onStore={onStore} t={t} />
    </Modal>
  );
}
function LanguageChoiceModal({ visible, theme, language, onSelect, onContinue, t = I18N.en }) {
  if (!visible) return null;
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onContinue}>
      <View style={styles.languagePromptOverlay}>
        <View style={[styles.languagePromptCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <Text style={[styles.languagePromptTitle, { color: theme.text }]}>{t.languagePromptTitle}</Text>
          <Text style={[styles.languagePromptText, { color: theme.muted }]}>{t.languagePromptText}</Text>
          <View style={styles.languagePromptOptions}>
            {['en', 'tr'].map((item) => {
              const active = language === item;
              return (
                <Pressable
                  key={item}
                  style={[
                    styles.languagePromptOption,
                    {
                      backgroundColor: active ? theme.button : theme.soft,
                      borderColor: active ? theme.button : theme.line,
                    },
                  ]}
                  onPress={() => onSelect(item)}
                >
                  <Text style={[styles.languagePromptOptionText, { color: active ? theme.buttonText : theme.text }]}>
                    {item === 'tr' ? 'Türkçe' : 'English'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable style={({ pressed }) => [styles.languagePromptContinue, { backgroundColor: theme.button, opacity: pressed ? 0.78 : 1 }]} onPress={onContinue}>
            <Text style={[styles.languagePromptContinueText, { color: theme.buttonText }]}>{t.languagePromptContinue}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
function SettingsModal({ visible, theme, settings, onChange, onClose, onRestore, t = I18N.en }) {
  const Toggle = ({ label, description, value, onPress }) => (
    <Pressable style={[styles.settingsRow, { borderColor: theme.line }]} onPress={onPress}>
      <View style={styles.settingsRowText}>
        <Text style={[styles.settingsLabel, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.settingsDescription, { color: theme.muted }]}>{description}</Text>
      </View>
      <View style={[styles.settingsToggle, { backgroundColor: value ? theme.button : theme.soft, borderColor: value ? theme.button : theme.line }]}> 
        <View style={[styles.settingsToggleDot, value ? styles.settingsToggleDotOn : null, { backgroundColor: value ? theme.buttonText : theme.muted }]} />
      </View>
    </Pressable>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.settingsOverlay}>
        <View style={[styles.settingsCard, { backgroundColor: theme.card, borderColor: theme.line }]}> 
          <View style={styles.settingsHeader}>
            <View>
              <Text style={[styles.settingsTitle, { color: theme.text }]}>{t.settings}</Text>
              <Text style={[styles.settingsSubtitle, { color: theme.muted }]}>{t.settingsSubtitle}</Text>
            </View>
            <Pressable style={[styles.settingsCloseButton, { backgroundColor: theme.soft, borderColor: theme.line }]} onPress={onClose}>
              <Text style={[styles.settingsCloseText, { color: theme.text }]}>X</Text>
            </Pressable>
          </View>

          <Toggle label={t.sound} description={t.soundDesc} value={settings.sound} onPress={() => onChange({ sound: !settings.sound })} />
          <Toggle label={t.vibration} description={t.vibrationDesc} value={settings.vibration} onPress={() => onChange({ vibration: !settings.vibration })} />
          <Toggle label={t.music} description={t.musicDesc} value={settings.music} onPress={() => onChange({ music: !settings.music })} />

          <Text style={[styles.settingsSectionTitle, { color: theme.text }]}>{t.language}</Text>
          <View style={styles.languageRow}>
            {['en', 'tr'].map((language) => {
              const active = settings.language === language;
              return (
                <Pressable key={language} style={[styles.languageButton, { backgroundColor: active ? theme.button : theme.soft, borderColor: active ? theme.button : theme.line }]} onPress={() => onChange({ language })}>
                  <Text style={[styles.languageButtonText, { color: active ? theme.buttonText : theme.text }]}>{language === 'tr' ? 'Türkçe' : 'English'}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable style={[styles.restoreButton, { backgroundColor: theme.soft, borderColor: theme.line }]} onPress={onRestore}>
            <Text style={[styles.restoreButtonText, { color: theme.text }]}>{t.restorePurchases}</Text>
          </Pressable>
          <View style={styles.legalRow}>
            <Text style={[styles.legalLink, { color: theme.muted }]}>{t.privacy}</Text>
            <Text style={[styles.legalDivider, { color: theme.muted }]}>•</Text>
            <Text style={[styles.legalLink, { color: theme.muted }]}>{t.terms}</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DailyRewardModal({ visible, theme, onClaim, t = I18N.en }) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClaim}>
      <View style={styles.dailyOverlay}>
        <View style={[styles.dailyCard, { backgroundColor: theme.card, borderColor: theme.line }]}> 
          <Text style={[styles.dailyKicker, { color: theme.muted }]}>{t.dailyKicker}</Text>
          <Text style={[styles.dailyTitle, { color: theme.text }]}>{t.dailyTitle}</Text>
          <View style={styles.dailyRewardsRow}>
            <View style={[styles.dailyRewardPill, { backgroundColor: theme.soft, borderColor: theme.line }]}> 
              <Image source={GAME_ART.coins.hint} style={styles.dailyRewardIcon} resizeMode="contain" />
              <Text style={[styles.dailyRewardText, { color: theme.text }]}>+{DAILY_REWARD.hint}</Text>
            </View>
            <View style={[styles.dailyRewardPill, { backgroundColor: theme.soft, borderColor: theme.line }]}> 
              <Image source={GAME_ART.coins.layer} style={styles.dailyRewardIcon} resizeMode="contain" />
              <Text style={[styles.dailyRewardText, { color: theme.text }]}>+{DAILY_REWARD.layer}</Text>
            </View>
          </View>
          <Text style={[styles.dailyText, { color: theme.muted }]}>{t.dailyText}</Text>
          <Pressable style={({ pressed }) => [styles.dailyClaimButton, { backgroundColor: theme.button, opacity: pressed ? 0.78 : 1 }]} onPress={onClaim}>
            <Text style={[styles.dailyClaimText, { color: theme.buttonText }]}>{t.dailyClaim}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
function StoreModal({ visible, theme, productsById = {}, purchasingId = null, onClose, onBuy, t = I18N.en }) {
  const renderPackage = (type, pack) => {
    const icon = type === 'premium' ? require('./assets/ui-icons/icon-remove-ads.png') : type === 'hint' ? GAME_ART.coins.hint : GAME_ART.coins.layer;
    const label = type === 'hint' ? t.hintCurrency : t.layerCurrency;
    const purchasesDisabled = !STORE_PURCHASES_ENABLED;
    const product = productsById[pack.id];
    const buying = purchasingId === pack.id;
    const priceText = product?.displayPrice || pack.price;
    return (
      <Pressable
        key={pack.id}
        disabled={purchasesDisabled || !!purchasingId}
        style={({ pressed }) => [
          styles.storePackage,
          {
            backgroundColor: pack.best ? `${theme.button}18` : theme.soft,
            borderColor: pack.best ? theme.button : theme.line,
            opacity: purchasesDisabled || (purchasingId && !buying) ? 0.62 : pressed ? 0.78 : 1,
          },
        ]}
        onPress={() => onBuy(type, pack)}
      >
        {pack.best ? <Text style={[styles.storeBestBadge, { backgroundColor: theme.button, color: theme.buttonText }]}>{t.bestValue}</Text> : null}
        <View style={styles.storePackageTop}>
          <Image source={icon} style={styles.storePackageIcon} resizeMode="contain" />
          <View style={styles.storePackageTextWrap}>
            <Text style={[styles.storePackageTitle, { color: theme.text }]}>{type === 'premium' ? (t === I18N.tr ? 'Reklamları Kaldır' : 'Remove Ads') : t.packageTitles[pack.id] || pack.title}</Text>
            <Text style={[styles.storePackageSubtitle, { color: theme.muted }]}>{type === 'premium' ? (t === I18N.tr ? 'Tüm reklamları kalıcı olarak kaldırır.' : 'Permanently removes all ads.') : `${pack.amount} ${label}`}</Text>
          </View>
        </View>
        <Text style={[styles.storePackagePrice, { color: purchasesDisabled ? theme.muted : theme.text }]}>
          {purchasesDisabled ? t.storeComingSoon : buying ? t.storeBuying : priceText}
        </Text>
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.storeOverlay}>
        <View style={[styles.storeCard, { backgroundColor: theme.card, borderColor: theme.line }]}> 
          <View style={styles.storeHeader}>
            <View>
              <Text style={[styles.storeTitle, { color: theme.text }]}>{t.shop}</Text>
              <Text style={[styles.storeSubtitle, { color: theme.muted }]}>{t.storeSubtitle}</Text>
            </View>
            <Pressable style={[styles.storeCloseButton, { backgroundColor: theme.soft, borderColor: theme.line }]} onPress={onClose}>
              <Text style={[styles.storeCloseText, { color: theme.text }]}>X</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.storeScrollContent}>
            {!STORE_PURCHASES_ENABLED ? (
              <Text style={[styles.storeDisabledText, { color: theme.muted, backgroundColor: theme.soft, borderColor: theme.line }]}>
                {t.storeDisabledText}
              </Text>
            ) : null}
            <View style={styles.storeSection}>
              {STORE_PACKAGES.premium.map((pack) => renderPackage('premium', pack))}
              <Text style={[styles.storeSectionTitle, { color: theme.text }]}>{t.hintCurrency}</Text>
              {STORE_PACKAGES.hint.map((pack) => renderPackage('hint', pack))}
            </View>
            <View style={styles.storeSection}>
              <Text style={[styles.storeSectionTitle, { color: theme.text }]}>{t.layerCurrency}</Text>
              {STORE_PACKAGES.layer.map((pack) => renderPackage('layer', pack))}
            </View>
            <Text style={[styles.storeLegalText, { color: theme.muted }]}>{t.storeLegal}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
function SplashScreen({ theme, animateIntro, onIntroComplete, onDone, onLevels, onStore, onRemoveAds, onSettings, t = I18N.en }) {
  const [isLeaving, setIsLeaving] = useState(false);
  const boardScale = useRef(new Animated.Value(animateIntro ? 0.92 : 1)).current;
  const boardOpacity = useRef(new Animated.Value(1)).current;
  const logoLift = useRef(new Animated.Value(animateIntro ? 0 : 1)).current;
  const pieceOne = useRef(new Animated.Value(animateIntro ? 0 : 1)).current;
  const pieceTwo = useRef(new Animated.Value(animateIntro ? 0 : 1)).current;
  const pieceThree = useRef(new Animated.Value(animateIntro ? 0 : 1)).current;
  const pieceFour = useRef(new Animated.Value(animateIntro ? 0 : 1)).current;
  const menuOpacity = useRef(new Animated.Value(animateIntro ? 0 : 1)).current;

  useEffect(() => {
    if (!animateIntro) {
      boardScale.setValue(1);
      boardOpacity.setValue(1);
      logoLift.setValue(1);
      pieceOne.setValue(1);
      pieceTwo.setValue(1);
      pieceThree.setValue(1);
      pieceFour.setValue(1);
      menuOpacity.setValue(1);
      return undefined;
    }

    const animation = Animated.sequence([
      Animated.parallel([
        Animated.timing(boardOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.spring(boardScale, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true }),
      ]),
      Animated.stagger(170, [
        Animated.spring(pieceOne, { toValue: 1, friction: 7, tension: 90, useNativeDriver: true }),
        Animated.spring(pieceTwo, { toValue: 1, friction: 7, tension: 90, useNativeDriver: true }),
        Animated.spring(pieceThree, { toValue: 1, friction: 7, tension: 90, useNativeDriver: true }),
        Animated.spring(pieceFour, { toValue: 1, friction: 7, tension: 90, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(logoLift, { toValue: 1, friction: 8, tension: 70, useNativeDriver: true }),
        Animated.timing(menuOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
      ]),
    ]);

    animation.start(({ finished }) => {
      if (finished) onIntroComplete?.();
    });

    return () => animation.stop();
  }, [animateIntro, boardOpacity, boardScale, logoLift, menuOpacity, onIntroComplete, pieceFour, pieceOne, pieceThree, pieceTwo]);

  const playExitAnimation = useCallback(() => {
    if (isLeaving) return;
    setIsLeaving(true);
    const animation = Animated.sequence([
      Animated.parallel([
        Animated.timing(menuOpacity, { toValue: 0, duration: 240, useNativeDriver: true }),
        Animated.spring(logoLift, { toValue: 0, friction: 8, tension: 85, useNativeDriver: true }),
      ]),
      Animated.stagger(90, [
        Animated.timing(pieceFour, { toValue: 0, duration: 210, useNativeDriver: true }),
        Animated.timing(pieceThree, { toValue: 0, duration: 210, useNativeDriver: true }),
        Animated.timing(pieceTwo, { toValue: 0, duration: 210, useNativeDriver: true }),
        Animated.timing(pieceOne, { toValue: 0, duration: 210, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(boardScale, { toValue: 0.92, duration: 220, useNativeDriver: true }),
        Animated.timing(boardOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]),
    ]);
    animation.start(({ finished }) => {
      if (finished) onDone?.();
      else setIsLeaving(false);
    });
  }, [boardOpacity, boardScale, isLeaving, logoLift, menuOpacity, onDone, pieceFour, pieceOne, pieceThree, pieceTwo]);

  const animatedPieceStyle = (anim, fromX, fromY, rotate = '0deg') => ({
    opacity: anim,
    transform: [
      { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [fromX, 0] }) },
      { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [fromY, 0] }) },
      { rotate },
      { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) },
    ],
  });

  return (
    <View style={[styles.splash, { backgroundColor: theme.bg }]}>
      <StatusBar style={theme.bg === THEMES.dark.bg ? 'light' : 'dark'} />
      <Animated.View
        style={[
          styles.splashAnimatedLogo,
          {
            opacity: boardOpacity,
            transform: [
              { translateY: logoLift.interpolate({ inputRange: [0, 1], outputRange: [42, -38] }) },
              { scale: boardScale },
            ],
          },
        ]}
      >
        <View style={[styles.appIntroBoard, { backgroundColor: theme.soft, borderColor: theme.line }]}>
          {Array.from({ length: 25 }).map((_, index) => (
            <View
              key={`splash-cell-${index}`}
              style={[
                styles.appIntroCell,
                {
                  left: 14 + (index % 5) * 25,
                  top: 14 + Math.floor(index / 5) * 25,
                  backgroundColor: theme.cell,
                  borderColor: theme.line,
                },
              ]}
            />
          ))}
          <Animated.View style={[styles.appIntroPiece, styles.appIntroPieceOne, { backgroundColor: theme.pieces[0] }, animatedPieceStyle(pieceOne, -72, 42, '-4deg')]} />
          <Animated.View style={[styles.appIntroPiece, styles.appIntroPieceTwo, { backgroundColor: theme.pieces[3] }, animatedPieceStyle(pieceTwo, 74, 48, '4deg')]} />
          <Animated.View style={[styles.appIntroPiece, styles.appIntroPieceThree, { backgroundColor: theme.pieces[4] }, animatedPieceStyle(pieceThree, -58, -60, '3deg')]} />
          <Animated.View style={[styles.appIntroPiece, styles.appIntroPieceFour, { backgroundColor: theme.pieces[1] }, animatedPieceStyle(pieceFour, 68, -54, '-3deg')]} />
        </View>
      </Animated.View>
      <Animated.View
        style={[
          styles.splashMenu,
          {
            opacity: menuOpacity,
            transform: [{ translateY: menuOpacity.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }],
          },
        ]}
      >
        <Text style={[styles.splashTitle, { color: theme.text }]}>Puzzle Grid</Text>
        <Text style={[styles.splashText, { color: theme.muted }]}>{t.homeSubtitle}</Text>
        <Pressable disabled={isLeaving} style={[styles.playButton, { backgroundColor: theme.button, opacity: isLeaving ? 0.72 : 1 }]} onPress={playExitAnimation}>
          <Text style={[styles.playButtonText, { color: theme.buttonText }]}>{t.play}</Text>
        </Pressable>
        <Pressable disabled={isLeaving} style={[styles.splashLevelsButton, { backgroundColor: theme.card, borderColor: theme.line, opacity: isLeaving ? 0.55 : 1 }]} onPress={onLevels}>
          <Text style={[styles.splashLevelsText, { color: theme.text }]}>{t.levels}</Text>
        </Pressable>
        <Pressable disabled={isLeaving} style={[styles.splashLevelsButton, { backgroundColor: theme.card, borderColor: theme.line, opacity: isLeaving ? 0.55 : 1 }]} onPress={onStore}>
          <Text style={[styles.splashLevelsText, { color: theme.text }]}>{t.shop}</Text>
        </Pressable>
      </Animated.View>
      <SafeAreaView pointerEvents="box-none" style={[StyleSheet.absoluteFillObject, { zIndex: 10 }]}>
      <Animated.View pointerEvents="box-none" style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight || 24) + 24 : 24, marginHorizontal: 18, opacity: menuOpacity }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t === I18N.tr ? 'Ayarlar' : 'Settings'} disabled={isLeaving} hitSlop={6} style={({ pressed }) => ({ width: 50, height: 50, marginTop: 7, borderRadius: 14, borderWidth: 1.5, borderColor: theme.line, backgroundColor: theme.card, alignItems: 'center', justifyContent: 'center', opacity: pressed || isLeaving ? 0.6 : 1 })} onPress={onSettings}>
          <Image source={UI_ICONS.settings} style={{ width: 34, height: 34 }} resizeMode="contain" />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t === I18N.tr ? 'Reklamları Kaldır' : 'Remove Ads'} disabled={isLeaving} style={({ pressed }) => ({ width: 64, height: 64, borderRadius: 18, borderWidth: 1.5, borderColor: theme.line, backgroundColor: theme.card, alignItems: 'center', justifyContent: 'center', opacity: pressed || isLeaving ? 0.6 : 1 })} onPress={onRemoveAds}>
          <Image source={require('./assets/ui-icons/icon-remove-ads.png')} style={{ width: 54, height: 54 }} resizeMode="contain" />
        </Pressable>
      </Animated.View>
      </SafeAreaView>
      <Animated.View style={[styles.splashBrandFooter, { opacity: menuOpacity, backgroundColor: theme.card, borderColor: theme.line }]}>
        <Image source={GAME_ART.brand.gorsen} style={styles.splashBrandLogo} resizeMode="cover" />
        <Text style={[styles.splashBrandText, { color: theme.text }]}>Görsen Games</Text>
      </Animated.View>
    </View>
  );
}

function AppIntroSplash({ theme, onDone }) {
  const boardScale = useRef(new Animated.Value(0.92)).current;
  const boardOpacity = useRef(new Animated.Value(0)).current;
  const pieceOne = useRef(new Animated.Value(0)).current;
  const pieceTwo = useRef(new Animated.Value(0)).current;
  const pieceThree = useRef(new Animated.Value(0)).current;
  const pieceFour = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onDone();
    };
    const animation = Animated.sequence([
      Animated.parallel([
        Animated.timing(boardOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.spring(boardScale, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true }),
      ]),
      Animated.stagger(180, [
        Animated.spring(pieceOne, { toValue: 1, friction: 7, tension: 90, useNativeDriver: true }),
        Animated.spring(pieceTwo, { toValue: 1, friction: 7, tension: 90, useNativeDriver: true }),
        Animated.spring(pieceThree, { toValue: 1, friction: 7, tension: 90, useNativeDriver: true }),
        Animated.spring(pieceFour, { toValue: 1, friction: 7, tension: 90, useNativeDriver: true }),
      ]),
      Animated.timing(titleOpacity, { toValue: 1, duration: 320, useNativeDriver: true }),
      Animated.delay(420),
    ]);
    const minimumTimer = setTimeout(finish, 2300);
    animation.start(({ finished }) => {
      if (finished) finish();
    });
    return () => {
      clearTimeout(minimumTimer);
      animation.stop();
    };
  }, [boardOpacity, boardScale, onDone, pieceFour, pieceOne, pieceThree, pieceTwo, titleOpacity]);

  const animatedPieceStyle = (anim, fromX, fromY, rotate = '0deg') => ({
    opacity: anim,
    transform: [
      { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [fromX, 0] }) },
      { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [fromY, 0] }) },
      { rotate },
      { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) },
    ],
  });

  return (
    <View style={[styles.appIntro, { backgroundColor: theme.bg }]}>
      <StatusBar style="dark" />
      <Animated.View style={[styles.appIntroLogoWrap, { opacity: boardOpacity, transform: [{ scale: boardScale }] }]}>
        <View style={[styles.appIntroBoard, { backgroundColor: theme.soft, borderColor: theme.line }]}>
          {Array.from({ length: 25 }).map((_, index) => (
            <View
              key={`intro-cell-${index}`}
              style={[
                styles.appIntroCell,
                {
                  left: 14 + (index % 5) * 25,
                  top: 14 + Math.floor(index / 5) * 25,
                  backgroundColor: theme.cell,
                  borderColor: theme.line,
                },
              ]}
            />
          ))}
          <Animated.View style={[styles.appIntroPiece, styles.appIntroPieceOne, { backgroundColor: theme.pieces[0] }, animatedPieceStyle(pieceOne, -72, 42, '-4deg')]} />
          <Animated.View style={[styles.appIntroPiece, styles.appIntroPieceTwo, { backgroundColor: theme.pieces[3] }, animatedPieceStyle(pieceTwo, 74, 48, '4deg')]} />
          <Animated.View style={[styles.appIntroPiece, styles.appIntroPieceThree, { backgroundColor: theme.pieces[4] }, animatedPieceStyle(pieceThree, -58, -60, '3deg')]} />
          <Animated.View style={[styles.appIntroPiece, styles.appIntroPieceFour, { backgroundColor: theme.pieces[1] }, animatedPieceStyle(pieceFour, 68, -54, '-3deg')]} />
        </View>
      </Animated.View>
      <Animated.View style={[styles.appIntroTitleWrap, { opacity: titleOpacity, transform: [{ translateY: titleOpacity.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
        <Text style={[styles.appIntroTitle, { color: theme.text }]}>Puzzle Grid</Text>
        <View style={[styles.appIntroProgress, { backgroundColor: theme.line }]}>
          <View style={[styles.appIntroProgressFill, { backgroundColor: theme.button }]} />
        </View>
      </Animated.View>
    </View>
  );
}

function TutorialPlayScreen({ theme, onDone, t = I18N.en }) {
  const firstAnim = useRef(new Animated.Value(0)).current;
  const secondAnim = useRef(new Animated.Value(0)).current;
  const firstDrag = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const secondDrag = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const firstOffsetRef = useRef({ x: 0, y: 0 });
  const secondOffsetRef = useRef({ x: 0, y: 0 });
  const [firstPlaced, setFirstPlaced] = useState(false);
  const [secondPlaced, setSecondPlaced] = useState(false);
  const [firstUserStarted, setFirstUserStarted] = useState(false);
  const [secondUserStarted, setSecondUserStarted] = useState(false);
  const [showCongrats, setShowCongrats] = useState(false);
  const cell = 52;
  const boardBorder = 0;
  const pieceWidth = cell * 2;
  const boardLeft = 98;
  const boardTop = 96;
  const trayTop = 372;
  const firstStart = { x: 34, y: trayTop };
  const secondStart = { x: 164, y: trayTop };
  const firstTarget = { x: boardLeft + boardBorder, y: boardTop + boardBorder };
  const secondTarget = { x: boardLeft + boardBorder, y: boardTop + boardBorder + cell };

  useEffect(() => {
    if (firstUserStarted || firstPlaced) return undefined;
    firstAnim.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(firstAnim, { toValue: 1, duration: 1150, useNativeDriver: false }),
        Animated.delay(360),
        Animated.timing(firstAnim, { toValue: 0, duration: 1, useNativeDriver: false }),
        Animated.delay(420),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [firstAnim, firstPlaced, firstUserStarted]);

  useEffect(() => {
    if (!firstPlaced || secondUserStarted || secondPlaced) return undefined;
    secondAnim.setValue(0);
    const timer = setTimeout(() => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(secondAnim, { toValue: 1, duration: 980, useNativeDriver: false }),
          Animated.delay(360),
          Animated.timing(secondAnim, { toValue: 0, duration: 1, useNativeDriver: false }),
          Animated.delay(380),
        ]),
      );
      loop.start();
      secondOffsetRef.current.loop = loop;
    }, 360);
    return () => {
      clearTimeout(timer);
      secondOffsetRef.current.loop?.stop?.();
    };
  }, [firstPlaced, secondAnim, secondPlaced, secondUserStarted]);

  const makeResponder = useCallback(
    ({ placed, setPlaced, userStarted, setUserStarted, anim, drag, offsetRef, start, target, enabled, onPlaced }) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => enabled && !placed,
        onMoveShouldSetPanResponder: () => enabled && !placed,
        onPanResponderGrant: () => {
          offsetRef.current.loop?.stop?.();
          if (userStarted) {
            offsetRef.current = { ...offsetRef.current, x: 0, y: 0 };
            drag.setOffset({ x: 0, y: 0 });
            drag.setValue({ x: 0, y: 0 });
            return;
          }
          anim.stopAnimation((value) => {
            const offset = {
              x: (target.x - start.x) * value,
              y: (target.y - start.y) * value,
            };
            offsetRef.current = { ...offsetRef.current, ...offset };
            drag.setOffset(offset);
            drag.setValue({ x: 0, y: 0 });
            setUserStarted(true);
          });
        },
        onPanResponderMove: Animated.event([null, { dx: drag.x, dy: drag.y }], { useNativeDriver: false }),
        onPanResponderRelease: (_, gesture) => {
          const offset = offsetRef.current;
          const dropX = start.x + offset.x + gesture.dx;
          const dropY = start.y + offset.y + gesture.dy;
          const inTarget = Math.abs(dropX - target.x) < 58 && Math.abs(dropY - target.y) < 70 && offset.y + gesture.dy < -90;
          drag.flattenOffset();
          offsetRef.current = { x: 0, y: 0 };
          if (inTarget) {
            Animated.spring(drag, {
              toValue: { x: target.x - start.x, y: target.y - start.y },
              friction: 7,
              tension: 120,
              useNativeDriver: false,
            }).start(() => {
              setPlaced(true);
              onPlaced?.();
            });
            return;
          }
          Animated.spring(drag, { toValue: { x: 0, y: 0 }, friction: 7, tension: 120, useNativeDriver: false }).start();
        },
      }),
    [],
  );

  const firstResponder = useMemo(
    () =>
      makeResponder({
        placed: firstPlaced,
        setPlaced: setFirstPlaced,
        userStarted: firstUserStarted,
        setUserStarted: setFirstUserStarted,
        anim: firstAnim,
        drag: firstDrag,
        offsetRef: firstOffsetRef,
        start: firstStart,
        target: firstTarget,
        enabled: true,
      }),
    [firstAnim, firstDrag, firstPlaced, firstUserStarted, makeResponder],
  );

  const secondResponder = useMemo(
    () =>
      makeResponder({
        placed: secondPlaced,
        setPlaced: setSecondPlaced,
        userStarted: secondUserStarted,
        setUserStarted: setSecondUserStarted,
        anim: secondAnim,
        drag: secondDrag,
        offsetRef: secondOffsetRef,
        start: secondStart,
        target: secondTarget,
        enabled: firstPlaced,
        onPlaced: () => setTimeout(() => setShowCongrats(true), 420),
      }),
    [firstPlaced, makeResponder, onDone, secondAnim, secondDrag, secondPlaced, secondUserStarted],
  );

  const firstAutoDX = firstAnim.interpolate({ inputRange: [0, 1], outputRange: [0, firstTarget.x - firstStart.x] });
  const firstAutoDY = firstAnim.interpolate({ inputRange: [0, 1], outputRange: [0, firstTarget.y - firstStart.y] });
  const firstHandX = firstAnim.interpolate({ inputRange: [0, 1], outputRange: [firstStart.x + 38, firstTarget.x + 38] });
  const firstHandY = firstAnim.interpolate({ inputRange: [0, 1], outputRange: [firstStart.y + 58, firstTarget.y + 58] });
  const secondAutoDX = secondAnim.interpolate({ inputRange: [0, 1], outputRange: [0, secondTarget.x - secondStart.x] });
  const secondAutoDY = secondAnim.interpolate({ inputRange: [0, 1], outputRange: [0, secondTarget.y - secondStart.y] });
  const secondHandX = secondAnim.interpolate({ inputRange: [0, 1], outputRange: [secondStart.x + 38, secondTarget.x + 38] });
  const secondHandY = secondAnim.interpolate({ inputRange: [0, 1], outputRange: [secondStart.y + 58, secondTarget.y + 58] });

  function TutorialDomino({ color }) {
    return (
      <View style={[styles.tutorialDomino, { width: pieceWidth, height: cell }]}> 
        {[0, 1].map((index) => (
          <View
            key={index}
            style={[
              styles.pieceCell,
              styles.tutorialDominoCell,
              {
                backgroundColor: color,
                left: index * cell,
                width: cell,
                height: cell,
                borderRadius: 6,
              },
            ]}
          />
        ))}
      </View>
    );
  }

  if (showCongrats) {
    return (
      <SafeAreaView style={[styles.tutorialScreen, styles.tutorialCongratsScreen, { backgroundColor: theme.bg }]}> 
        <View style={[styles.tutorialCongratsCard, { backgroundColor: theme.card, borderColor: theme.line }]}> 
          <View style={styles.tutorialCongratsVisual}>
            <View style={[styles.tutorialCongratsGlow, { backgroundColor: theme.button }]} />
            <View style={[styles.tutorialCongratsMiniBoard, { backgroundColor: theme.soft, borderColor: theme.line }]}>
              {['#F6C85F', '#F6C85F', '#6CB6FF', '#6CB6FF'].map((color, index) => (
                <View
                  key={`ready-cell-${index}`}
                  style={[
                    styles.tutorialCongratsMiniCell,
                    {
                      backgroundColor: color,
                      left: 8 + (index % 2) * 43,
                      top: 8 + Math.floor(index / 2) * 43,
                    },
                  ]}
                />
              ))}
            </View>
            <View style={[styles.tutorialCongratsCheck, { backgroundColor: theme.button, borderColor: theme.card }]}>
              <Text style={[styles.tutorialCongratsCheckText, { color: theme.buttonText }]}>?</Text>
            </View>
          </View>
          <Text style={[styles.tutorialCongratsEyebrow, { color: theme.button }]}>{t.firstMovesDone}</Text>
          <Text style={[styles.tutorialCongratsTitle, { color: theme.text }]}>{t.ready}</Text>
          <Text style={[styles.tutorialCongratsText, { color: theme.muted }]}>{t.tutorialCongrats}</Text>
          <View style={styles.tutorialCongratsDots}>
            {[0, 1, 2].map((index) => (
              <View key={`ready-dot-${index}`} style={[styles.tutorialCongratsDot, { backgroundColor: index === 1 ? theme.button : theme.line }]} />
            ))}
          </View>
          <Pressable style={({ pressed }) => [styles.tutorialContinueButton, { backgroundColor: theme.button, opacity: pressed ? 0.78 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]} onPress={onDone}>
            <Text style={[styles.tutorialContinueText, { color: theme.buttonText }]}>{t.introduceButtons}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.tutorialScreen, { backgroundColor: theme.bg }]}> 
      <Text style={[styles.tutorialTitle, { color: theme.text }]}>{t.tryIt}</Text>
      <Text style={[styles.tutorialSubtitle, { color: theme.muted }]}>{t.tutorialSubtitle}</Text>
      <View style={styles.tutorialStage}>
        <View
          style={[
            styles.tutorialBoard,
            {
              left: boardLeft,
              top: boardTop,
              width: cell * 2 + boardBorder * 2,
              height: cell * 2 + boardBorder * 2,
              backgroundColor: theme.soft,
              borderColor: theme.line,
            },
          ]}
        >
          {Array.from({ length: 4 }).map((_, index) => (
            <View
              key={index}
              style={[
                styles.tutorialCell,
                {
                  left: boardBorder + (index % 2) * cell,
                  top: boardBorder + Math.floor(index / 2) * cell,
                  backgroundColor: theme.cell,
                  borderColor: theme.line,
                },
              ]}
            />
          ))}
        </View>
        {firstPlaced ? (
          <View style={[styles.tutorialPieceWide, { left: firstTarget.x, top: firstTarget.y }]}>
            <TutorialDomino color={theme.pieces[0]} />
          </View>
        ) : (
          <>
            <Animated.View
              {...firstResponder.panHandlers}
              style={[
                styles.tutorialPieceWide,
                styles.tutorialDraggablePiece,
                {
                  left: firstStart.x,
                  top: firstStart.y,
                  transform: firstUserStarted ? firstDrag.getTranslateTransform() : [{ translateX: firstAutoDX }, { translateY: firstAutoDY }],
                },
              ]}
            >
              <TutorialDomino color={theme.pieces[0]} />
            </Animated.View>
            {!firstUserStarted ? (
              <Animated.View style={[styles.tutorialHand, { transform: [{ translateX: firstHandX }, { translateY: firstHandY }] }]}>
                <Text style={styles.tutorialHandText}>{t.hold}</Text>
              </Animated.View>
            ) : null}
          </>
        )}
        {secondPlaced ? (
          <View style={[styles.tutorialPieceWide, { left: secondTarget.x, top: secondTarget.y }]}>
            <TutorialDomino color={theme.pieces[3]} />
          </View>
        ) : (
          <>
            <Animated.View
              {...secondResponder.panHandlers}
              style={[
                styles.tutorialPieceWide,
                styles.tutorialDraggablePiece,
                {
                  left: secondStart.x,
                  top: secondStart.y,
                  opacity: firstPlaced ? 1 : 0.72,
                  transform: secondUserStarted ? secondDrag.getTranslateTransform() : [{ translateX: secondAutoDX }, { translateY: secondAutoDY }],
                },
              ]}
            >
              <TutorialDomino color={theme.pieces[3]} />
            </Animated.View>
            {firstPlaced && !secondUserStarted ? (
              <Animated.View style={[styles.tutorialHand, { transform: [{ translateX: secondHandX }, { translateY: secondHandY }] }]}>
                <Text style={styles.tutorialHandText}>{t.hold}</Text>
              </Animated.View>
            ) : null}
          </>
        )}
        <View style={[styles.tutorialTray, { borderColor: theme.line, backgroundColor: theme.card }]}>
          <Text style={[styles.tutorialTrayText, { color: theme.muted }]}>{t.pieces}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function UpdatePromptModal({ visible, theme, version, onLater, onUpdate, t = I18N.en }) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onLater}>
      <View style={styles.promptOverlay}>
        <View style={[styles.promptCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <View style={[styles.promptIconBubble, { backgroundColor: theme.soft, borderColor: theme.line }]}>
            <Text style={[styles.promptIconText, { color: theme.button }]}>↑</Text>
          </View>
          <Text style={[styles.promptTitle, { color: theme.text }]}>{t.updateTitle}</Text>
          <Text style={[styles.promptText, { color: theme.muted }]}>
            {version ? `${t.updateText} (${version})` : t.updateText}
          </Text>
          <View style={styles.promptActions}>
            <Pressable style={({ pressed }) => [styles.promptButton, { backgroundColor: theme.soft, borderColor: theme.line, opacity: pressed ? 0.76 : 1 }]} onPress={onLater}>
              <Text style={[styles.promptButtonText, { color: theme.text }]}>{t.updateLater}</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.promptButton, styles.promptButtonPrimary, { backgroundColor: theme.button, borderColor: theme.button, opacity: pressed ? 0.78 : 1 }]} onPress={onUpdate}>
              <Text style={[styles.promptButtonText, { color: theme.buttonText }]}>{t.updateNow}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
function ClockGlyph({ color = '#F4BD42', size = 22 }) {
  return (
    <View style={[styles.clockGlyph, { borderColor: color, borderRadius: size / 2, height: size, width: size }]}>
      <View style={[styles.clockHandHour, { backgroundColor: color }]} />
      <View style={[styles.clockHandMinute, { backgroundColor: color }]} />
      <View style={[styles.clockCenter, { backgroundColor: color }]} />
    </View>
  );
}

function PlayGlyph({ color = '#FFFFFF' }) {
  return <View style={[styles.playGlyph, { borderLeftColor: color }]} />;
}

function VideoGlyph({ color = '#FFFFFF' }) {
  return (
    <View style={[styles.videoGlyph, { borderColor: color }]}>
      <View style={[styles.videoPlayGlyph, { borderLeftColor: color }]} />
    </View>
  );
}

function MiniPuzzleGlyph() {
  return (
    <View style={styles.miniPuzzleGlyph}>
      <View style={[styles.miniPuzzleCell, { backgroundColor: '#F2655A' }]} />
      <View style={[styles.miniPuzzleCell, { backgroundColor: '#F5B53F' }]} />
      <View style={[styles.miniPuzzleCell, { backgroundColor: '#4AA8D8' }]} />
      <View style={[styles.miniPuzzleCell, { backgroundColor: '#62BD92' }]} />
    </View>
  );
}

function SegmentedTimerBar({ progress = 1, activeColor = '#35C7A5', preview = false }) {
  const segmentCount = 10;
  const activeCount = Math.max(0, Math.ceil(Math.max(0, Math.min(1, progress)) * segmentCount));
  return (
    <View style={styles.segmentedTimerBar}>
      {Array.from({ length: segmentCount }).map((_, index) => {
        const previewColor = index < 6 ? '#35C7A5' : index < 8 ? '#F4BD42' : '#F2655A';
        return (
          <View
            key={`timer-segment-${index}`}
            style={[
              styles.segmentedTimerCell,
              { backgroundColor: index < activeCount ? (preview ? previewColor : activeColor) : 'rgba(255,255,255,0.14)' },
            ]}
          />
        );
      })}
    </View>
  );
}

function TimeUpOverlay({ theme, extensionSeconds, loading, onContinue, onRestart, t = I18N.en }) {
  const fade = useRef(new Animated.Value(0)).current;
  const cardEntrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.spring(cardEntrance, {
        toValue: 1,
        friction: 9,
        tension: 72,
        useNativeDriver: true,
      }),
    ]).start();
  }, [cardEntrance, fade]);

  const cardScale = cardEntrance.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] });
  const cardTranslateY = cardEntrance.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });

  return (
    <Animated.View style={[styles.timeUpOverlay, { opacity: fade }]}>
      <Animated.View
        style={[
          styles.timeUpCard,
          {
            backgroundColor: theme.card,
            borderColor: theme.line,
            transform: [{ translateY: cardTranslateY }, { scale: cardScale }],
          },
        ]}
      >
        <View style={[styles.timeUpBadge, { backgroundColor: theme.soft, borderColor: theme.line }]}>
          <Text style={[styles.timeUpBadgeText, { color: theme.accent }]}>00:00</Text>
        </View>
        <Text style={[styles.timeUpTitle, { color: theme.text }]}>{t.timeUpTitle}</Text>
        <Text style={[styles.timeUpText, { color: theme.muted }]}>{t.timeUpText}</Text>
        <View style={styles.timeUpActions}>
          <Pressable
            style={({ pressed }) => [styles.timeUpButton, { backgroundColor: theme.soft, borderColor: theme.line, opacity: pressed ? 0.76 : 1 }]}
            onPress={onRestart}
          >
            <Text style={[styles.timeUpButtonText, { color: theme.text }]}>{t.tryAgain}</Text>
          </Pressable>
          <Pressable
            disabled={loading}
            style={({ pressed }) => [
              styles.timeUpButton,
              styles.timeUpButtonPrimary,
              {
                backgroundColor: theme.button,
                borderColor: theme.button,
                opacity: loading ? 0.56 : pressed ? 0.78 : 1,
              },
            ]}
            onPress={onContinue}
          >
            <View style={styles.timeUpAdButtonRow}>
              <VideoGlyph color={theme.buttonText} />
              <Text style={[styles.timeUpButtonText, { color: theme.buttonText }]}>
                {loading ? t.adLoading : t.continueWithAd}
              </Text>
            </View>
            {!loading ? <Text style={[styles.timeUpExtraTime, { color: theme.buttonText }]}>{t.extraTime(extensionSeconds)}</Text> : null}
          </Pressable>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

function ChapterIntro({ theme, level, timeLimit, onDone, onBack, t = I18N.en }) {
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 8, tension: 120, useNativeDriver: true }),
    ]).start();
  }, [fade, scale]);

  const beginLevel = useCallback(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 0, duration: 240, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 0.97, duration: 240, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) onDone();
    });
  }, [fade, onDone, scale]);

  return (
    <Animated.View style={[styles.chapterOverlay, { opacity: fade }]}>
      <Animated.View style={[styles.chapterCard, { backgroundColor: theme.card, borderColor: theme.line, transform: [{ scale }] }]}>
        <View style={styles.chapterTopRow}>
          <MiniPuzzleGlyph />
          <Text style={[styles.chapterLevelLabel, { color: theme.text }]}>{t.levelLabel} {level}</Text>
          <View style={styles.chapterGridBadge}>
            <Text style={styles.chapterGridBadgeText}>{getGridSize(level)}x{getGridSize(level)}</Text>
          </View>
        </View>
        <View style={[styles.chapterDivider, { backgroundColor: theme.line }]} />
        <Text style={[styles.chapterTitle, { color: theme.text }]}>{t.levelReady}</Text>
        <View style={styles.chapterTimerPanel}>
          <View style={styles.chapterTimerTopRow}>
            <ClockGlyph color="#F4BD42" size={24} />
            <View style={styles.chapterTimerCopy}>
              <Text style={styles.chapterTimerLabel}>{t.remainingTime}</Text>
              <Text style={styles.chapterTimerValue}>{formatTime(timeLimit)}</Text>
            </View>
          </View>
          <SegmentedTimerBar progress={1} preview />
        </View>
        <Text style={[styles.chapterSubText, { color: theme.muted }]}>{t.timerStartsOnPlay}</Text>
        <Pressable
          style={({ pressed }) => [
            styles.chapterStartButton,
            { backgroundColor: '#F2655A', opacity: pressed ? 0.82 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
          ]}
          onPress={beginLevel}
        >
          <PlayGlyph />
          <Text style={styles.chapterStartButtonText}>{t.startLevelButton}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.chapterStartButton, { marginTop: 10, backgroundColor: theme.soft, borderWidth: 1, borderColor: theme.line, opacity: pressed ? 0.8 : 1 }]}
          onPress={onBack}
        >
          <Text style={[styles.chapterStartButtonText, { color: theme.text }]}>{t.levels}</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

function getProgressIntro(completedLevel, nextLevel, t = I18N.en) {
  const nextLayer = getLayerNumber(nextLevel);
  const nextLayerStart = getLayerStart(nextLayer);
  if (nextLayer <= 1 || nextLevel !== nextLayerStart) {
    return null;
  }

  if (nextLayer === 2) {
    const grid = getGridSize(nextLevel);
    return {
      level: nextLevel,
      title: t.realFunTitle,
      text: t.realFunText,
      badge: `${grid}x${grid}`,
    };
  }

  const grid = getGridSize(nextLevel);
  return {
    level: nextLevel,
    title: t.layerOpenedTitle(grid),
    text: t.layerOpenedText,
    badge: `${grid}x${grid}`,
  };
}

function ProgressIntroOverlay({ theme, intro, onContinue, t = I18N.en }) {
  if (!intro) return null;
  return (
    <View style={styles.progressIntroOverlay}>
      <View style={[styles.progressIntroCard, { backgroundColor: theme.card, borderColor: theme.line }]}> 
        <View style={[styles.progressIntroBadge, { backgroundColor: theme.soft, borderColor: theme.line }]}> 
          <Text style={[styles.progressIntroBadgeText, { color: theme.button }]}>{intro.badge}</Text>
        </View>
        <Text style={[styles.progressIntroTitle, { color: theme.text }]}>{intro.title}</Text>
        <Text style={[styles.progressIntroText, { color: theme.muted }]}>{intro.text}</Text>
        <Pressable style={({ pressed }) => [styles.progressIntroButton, { backgroundColor: theme.button, opacity: pressed ? 0.78 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]} onPress={onContinue}>
          <Text style={[styles.progressIntroButtonText, { color: theme.buttonText }]}>{t.continue}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function OnboardingOverlay({ theme, step, targets, onNext, onDone, t = I18N.en }) {
  const { width, height } = useWindowDimensions();
  const footerButtonWidth = Math.max(120, (width - BOARD_PADDING * 2 - 34) / 2);
  const footerTop = Math.max(430, height - 144);
  const steps = [
    { key: 'home', title: t.onboarding.home[0], text: t.onboarding.home[1], target: { top: 55, left: 18, width: 54, height: 54 }, card: { top: 128, left: 18 }, arrow: 'up' },
    { key: 'levels', title: t.onboarding.levels[0], text: t.onboarding.levels[1], target: { top: 55, left: width - 72, width: 54, height: 54 }, card: { top: 128, right: 18 }, arrow: 'up' },
    { key: 'settings', title: t.onboarding.settings[0], text: t.onboarding.settings[1], target: { top: 55, left: width - 132, width: 66, height: 54 }, card: { top: 128, right: 18 }, arrow: 'up' },
    { key: 'store', title: t.onboarding.store[0], text: t.onboarding.store[1], target: { top: 15, left: 174, width: 62, height: 42 }, card: { top: 104, left: 18 }, arrow: 'up' },
    { key: 'undo', title: t.onboarding.undo[0], text: t.onboarding.undo[1], target: { top: footerTop, left: 30, width: footerButtonWidth, height: 54 }, card: { top: Math.max(250, footerTop - 128), left: 18 }, arrow: 'down' },
    { key: 'hint', title: t.onboarding.hint[0], text: t.onboarding.hint[1], target: { top: footerTop, left: 40 + footerButtonWidth, width: footerButtonWidth, height: 54 }, card: { top: Math.max(250, footerTop - 128), right: 18 }, arrow: 'down' },
  ];
  const item = steps[Math.min(step, steps.length - 1)];
  const measuredTarget = targets?.[item.key];
  const target = measuredTarget || item.target;
  const isLast = step >= steps.length - 1;

  return (
      <View style={styles.onboardingOverlay}>
        <View style={[styles.onboardingTarget, target, { borderColor: theme.button }]} pointerEvents="none" />
      <View style={[styles.onboardingMarker, item.arrow === 'up' ? styles.onboardingMarkerBelow : styles.onboardingMarkerAbove, target]}>
        <View style={[styles.onboardingMarkerGlow, { backgroundColor: theme.button }]} />
        <View style={[styles.onboardingMarkerDot, { backgroundColor: theme.button, borderColor: theme.card }]} />
        <View style={[styles.onboardingMarkerLine, { backgroundColor: theme.button }]} />
      </View>
      <View style={[styles.onboardingCoachCard, styles.onboardingCoachCardCenter, { backgroundColor: theme.card, borderColor: theme.line }]}>
        <Text style={[styles.onboardingTitle, { color: theme.text }]}>{item.title}</Text>
        <Text style={[styles.onboardingText, { color: theme.muted }]}>{item.text}</Text>
        <View style={styles.onboardingDots}>
          {steps.map((_, index) => (
            <View key={index} style={[styles.onboardingDot, { backgroundColor: index === step ? theme.button : theme.line }]} />
          ))}
        </View>
        <View style={styles.onboardingActions}>
          <Pressable style={[styles.onboardingNext, styles.onboardingNextFull, { backgroundColor: theme.button }]} onPress={isLast ? onDone : onNext}>
            <Text style={[styles.onboardingNextText, { color: theme.buttonText }]}>{isLast ? t.ok : t.continue}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
function LevelsMapModal({ visible, theme, level, completedLevels, levelStars = {}, latestStarResult = null, unlockedLevel, unlockedLayer, layerTokens, recentCompletedLevel, recentUnlockedLevel, interactionLocked, insufficientFunds, storeVisible, storeProductsById = {}, storePurchasePendingId = null, onCloseInsufficientFunds, onStoreFromInsufficient, onCloseStore, onBuyStore, onClose, onSelectLevel, onUnlockLayer, onOpenLayerFirstLevel, t = I18N.en }) {
  const { width } = useWindowDimensions();
  const mapScrollRef = useRef(null);
  const mapLayerTabsRef = useRef(null);
  const mapScrollAnchorRef = useRef(null);
  const layerTourTimers = useRef([]);
  const layerCongratsAnim = useRef(new Animated.Value(0)).current;
  const initialLayer = getLayerNumber(level);
  const [mapLayer, setMapLayer] = useState(initialLayer);
  const [layerCongrats, setLayerCongrats] = useState(null);
  const [layerOpeningLevel, setLayerOpeningLevel] = useState(null);
  const [pendingLayerUnlock, setPendingLayerUnlock] = useState(null);
  const layerStart = getLayerStart(mapLayer);
  const layerEnd = getLayerEnd(mapLayer);
  const levelItems = useMemo(
    () => Array.from({ length: layerEnd - layerStart + 1 }, (_, index) => layerStart + index),
    [layerEnd, layerStart],
  );
  const [measuredMapWidth, setMeasuredMapWidth] = useState(0);
  const [measuredTabsWidth, setMeasuredTabsWidth] = useState(0);
  const mapListWidth = Math.max(1, measuredMapWidth || width - 36);
  const mapCardSize = Math.min(MAP_CARD_MAX_SIZE, Math.floor((mapListWidth - MAP_ROW_GAP * (MAP_COLUMNS - 1)) / MAP_COLUMNS));
  const mapRowHeight = mapCardSize + MAP_ROW_GAP;
  const mapTabsViewportWidth = Math.max(1, measuredTabsWidth || width - 36);
  const mapTabStep = 104;

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      const centeredOffset = (mapLayer - 1) * mapTabStep;
      mapLayerTabsRef.current?.scrollTo({ x: Math.max(0, centeredOffset), animated: true });
    }, 60);
    return () => clearTimeout(timer);
  }, [mapLayer, mapTabsViewportWidth, visible]);

  useEffect(() => {
    if (!visible) {
      mapScrollAnchorRef.current = null;
      setPendingLayerUnlock(null);
      setLayerOpeningLevel(null);
      return;
    }
    const anchorLevel = recentUnlockedLevel || level;
    mapScrollAnchorRef.current = anchorLevel;
    setMapLayer(getLayerNumber(anchorLevel));
  }, [level, recentUnlockedLevel, visible]);

  useEffect(() => {
    if (!visible) return;
    PRELOAD_ART.forEach((asset) => {
      const uri = Image.resolveAssetSource(asset)?.uri;
      if (uri) Image.prefetch(uri);
    });
  }, [visible]);

  useEffect(() => {
    if (!visible) return undefined;
    const timer = setTimeout(() => {
      const anchorLevel = mapScrollAnchorRef.current;
      if (!anchorLevel || getLayerNumber(anchorLevel) !== mapLayer) return;
      const targetIndex = Math.max(0, Math.min(levelItems.length - 1, anchorLevel - layerStart));
      const targetRow = Math.floor(targetIndex / MAP_COLUMNS);
      const rowOffset = Math.max(0, targetRow * mapRowHeight);
      mapScrollAnchorRef.current = null;
      mapScrollRef.current?.scrollToOffset({
        offset: rowOffset,
        animated: false,
      });
    }, 80);
    return () => clearTimeout(timer);
  }, [layerStart, levelItems.length, mapLayer, mapRowHeight, visible, level, recentUnlockedLevel]);


  useEffect(
    () => () => {
      layerTourTimers.current.forEach((timer) => clearTimeout(timer));
      layerTourTimers.current = [];
      layerCongratsAnim.stopAnimation();
    },
    [layerCongratsAnim],
  );

  const runLayerUnlockTour = useCallback((targetLayer) => {
    layerTourTimers.current.forEach((timer) => clearTimeout(timer));
    layerTourTimers.current = [];
    layerCongratsAnim.stopAnimation();
    layerCongratsAnim.setValue(0);
    setLayerOpeningLevel(null);
    setLayerCongrats(targetLayer);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(layerCongratsAnim, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]),
      Animated.delay(1120),
      Animated.timing(layerCongratsAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) {
        const firstLevel = getLayerStart(targetLayer);
        setLayerCongrats(null);
        setLayerOpeningLevel(firstLevel);
        setMapLayer(targetLayer);
        requestAnimationFrame(() => mapScrollRef.current?.scrollToOffset({ offset: 0, animated: false }));
        const openTimer = setTimeout(() => {
          setLayerOpeningLevel(null);
          onOpenLayerFirstLevel?.(firstLevel);
        }, 920);
        layerTourTimers.current.push(openTimer);
      }
    });
  }, [layerCongratsAnim, onOpenLayerFirstLevel]);

  const unlockLayerWithTour = useCallback(
    (targetLayer, confirmed = false) => {
      if (layerCongrats) return false;
      if (targetLayer <= unlockedLayer) return true;
      const gateCost = getLayerCost(targetLayer);
      if (gateCost && layerTokens < gateCost) {
        return onUnlockLayer(targetLayer);
      }
      if (gateCost && layerTokens >= gateCost && !confirmed) {
        setPendingLayerUnlock({ layer: targetLayer, cost: gateCost });
        return false;
      }
      const shouldCelebrate = targetLayer > unlockedLayer;
      const unlocked = onUnlockLayer(targetLayer);
      if (unlocked && shouldCelebrate) {
        setPendingLayerUnlock(null);
        runLayerUnlockTour(targetLayer);
        return false;
      }
      return unlocked;
    },
    [layerCongrats, layerTokens, onUnlockLayer, runLayerUnlockTour, unlockedLayer],
  );
  const goPreviousLayer = useCallback(() => {
    setMapLayer((current) => Math.max(1, current - 1));
    requestAnimationFrame(() => mapScrollRef.current?.scrollToOffset({ offset: 0, animated: false }));
  }, []);

  const goNextLayer = useCallback(() => {
    setMapLayer((current) => {
      const nextLayer = Math.min(getLayerCount(), current + 1);
      if (nextLayer > unlockedLayer && !unlockLayerWithTour(nextLayer)) {
        return current;
      }
      return nextLayer;
    });
    requestAnimationFrame(() => mapScrollRef.current?.scrollToOffset({ offset: 0, animated: false }));
  }, [unlockLayerWithTour, unlockedLayer]);

  const layerCount = getLayerCount();
  const layerLocked = mapLayer > unlockedLayer;
  const currentLayerGateCost = layerLocked ? getLayerCost(mapLayer) : null;
  const availableLevels = levelItems.filter((levelNumber) => levelNumber <= unlockedLevel).length;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.levelsBackground, { backgroundColor: theme.bg }]}>
        <View style={styles.levelsSafe}>
          <View style={styles.levelsMapHeader}>
            <View>
              <Text style={[styles.levelsTitle, { color: theme.text }]}>{t.levelMap}</Text>
            </View>
            <View style={styles.mapHeaderCoins}>
              <View style={[styles.mapCoinPill, { backgroundColor: theme.soft, borderColor: theme.line }]}>
                <Image source={GAME_ART.coins.layer} style={styles.mapCoinIcon} resizeMode="contain" />
                <Text style={[styles.mapCoinText, { color: theme.text }]}>{layerTokens}</Text>
              </View>
              <Pressable style={[styles.mapCloseButton, { backgroundColor: theme.soft, borderColor: theme.line }]} onPress={onClose}>
                <Text style={[styles.closeText, { color: theme.text }]}>{t.back}</Text>
              </Pressable>
            </View>
          </View>

          <View style={[styles.mapEconomyPanel, { backgroundColor: theme.soft, borderColor: theme.line }]}>
            <View>
              <Text style={[styles.mapEconomyText, { color: theme.text }]}>
                {t.layerTitle(getLayerGridLabel(mapLayer))}
              </Text>
              <Text style={[styles.mapEconomySub, { color: theme.muted }]}>
                {layerLocked ? t.locked : t.openCount(availableLevels, levelItems.length)}
              </Text>
            </View>
            {layerLocked && currentLayerGateCost ? (
              <Pressable
                style={({ pressed }) => [
                  styles.mapUnlockButton,
                  { backgroundColor: theme.button, opacity: pressed ? 0.86 : 1 },
                ]}
                onPress={() => unlockLayerWithTour(mapLayer)}
              >
                <Text style={[styles.mapUnlockText, { color: theme.buttonText }]}>
                  {t.unlock(Math.min(layerTokens, currentLayerGateCost), currentLayerGateCost)}
                </Text>
              </Pressable>
            ) : null}
          </View>

          <ScrollView
            ref={mapLayerTabsRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.mapLayerTabsScroller}
            onLayout={(event) => setMeasuredTabsWidth(Math.round(event.nativeEvent.layout.width))}
            snapToInterval={mapTabStep}
            snapToAlignment="start"
            decelerationRate="fast"
            disableIntervalMomentum
            contentContainerStyle={[styles.mapLayerTabs, { paddingHorizontal: Math.max(0, (mapTabsViewportWidth - 96) / 2) }]}
          >
            {Array.from({ length: layerCount }, (_, index) => index + 1).map((item) => {
              const active = item === mapLayer;
              const locked = item > unlockedLayer;
              const gateCost = locked ? getLayerCost(item) : null;
              const canOpenNow = item === unlockedLayer + 1 && gateCost;
              return (
                <Pressable
                  key={item}
                  onPress={() => {
                    if (layerCongrats) return;
                    if (locked) {
                      if (!canOpenNow) return;
                      const targetLayer = unlockedLayer + 1;
                      unlockLayerWithTour(targetLayer);
                      return;
                    }
                    setMapLayer(item);
                    mapScrollAnchorRef.current = getLayerNumber(level) === item ? level : getLayerStart(item);
                  }}
                  style={[
                    styles.mapLayerTab,
                    {
                      backgroundColor: active ? theme.button : theme.soft,
                      borderColor: active ? theme.button : theme.line,
                      opacity: locked ? 0.46 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.mapLayerTabText, { color: active ? theme.buttonText : theme.text }]}>
                    {getLayerGridLabel(item)}
                  </Text>
                  {locked ? (
                    <View style={[styles.mapLayerCostBadge, { backgroundColor: active ? theme.buttonText : theme.card, borderColor: theme.line }]}>
                      {canOpenNow ? <Image source={GAME_ART.coins.layer} style={styles.mapLayerCostIcon} resizeMode="contain" /> : null}
                      <Text style={[styles.mapLayerCostText, { color: active ? theme.button : theme.muted }]}>
                        {canOpenNow ? t.openCost(gateCost) : t.openInOrder}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>

          {layerCongrats ? (
            <Animated.View
              style={[
                styles.layerCongratsOverlay,
                {
                  opacity: layerCongratsAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
                },
              ]}
              pointerEvents="none"
            >
              <Animated.View
                style={[
                  styles.layerCongratsPanel,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.line,
                    transform: [
                      { scale: layerCongratsAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) },
                      { translateY: layerCongratsAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
                    ],
                  },
                ]}
              >
                <View style={[styles.layerCongratsIconWrap, { backgroundColor: theme.soft, borderColor: theme.line }]}>
                  <Animated.Text
                    style={[
                      styles.layerCongratsCheck,
                      {
                        color: theme.button,
                        transform: [
                          { scale: layerCongratsAnim.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0.35, 1.18, 1] }) },
                          { rotate: layerCongratsAnim.interpolate({ inputRange: [0, 1], outputRange: ['-24deg', '0deg'] }) },
                        ],
                      },
                    ]}
                  >
                    {'?'}
                  </Animated.Text>
                </View>
                <View style={styles.layerCongratsTextWrap}>
                  <Text style={[styles.layerCongratsBadge, { color: theme.button }]}>{getLayerGridLabel(layerCongrats)}</Text>
                  <Text style={[styles.layerCongratsTitle, { color: theme.text }]}>{t.congrats}</Text>
                  <Text style={[styles.layerCongratsText, { color: theme.muted }]}>{t.layerUnlockOpening(getLayerGridLabel(layerCongrats))}</Text>
                  <Text style={[styles.layerCongratsSubText, { color: theme.button }]}>{t.firstLevelOpening}</Text>
                </View>
              </Animated.View>
            </Animated.View>
          ) : null}

          {pendingLayerUnlock ? (
            <View style={styles.layerConfirmOverlay}>
              <View style={[styles.layerConfirmCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
                <View style={[styles.layerConfirmIconWrap, { backgroundColor: theme.soft, borderColor: theme.line }]}>
                  <Image source={GAME_ART.coins.layer} style={styles.layerConfirmIcon} resizeMode="contain" />
                </View>
                <Text style={[styles.layerConfirmTitle, { color: theme.text }]}>{t.unlockLayerQuestion}</Text>
                <Text style={[styles.layerConfirmText, { color: theme.muted }]}>{t.unlockLayerSpend}</Text>
                <View style={[styles.layerConfirmCost, { backgroundColor: theme.soft, borderColor: theme.line }]}>
                  <Text style={[styles.layerConfirmCostText, { color: theme.text }]}>{pendingLayerUnlock.cost}</Text>
                  <Image source={GAME_ART.coins.layer} style={styles.layerConfirmCostIcon} resizeMode="contain" />
                </View>
                <View style={styles.layerConfirmActions}>
                  <Pressable
                    style={({ pressed }) => [styles.layerConfirmButton, { backgroundColor: theme.soft, borderColor: theme.line, opacity: pressed ? 0.76 : 1 }]}
                    onPress={() => setPendingLayerUnlock(null)}
                  >
                    <Text style={[styles.layerConfirmButtonText, { color: theme.text }]}>{t.cancel}</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.layerConfirmButton, { backgroundColor: theme.button, borderColor: theme.button, opacity: pressed ? 0.78 : 1 }]}
                    onPress={() => unlockLayerWithTour(pendingLayerUnlock.layer, true)}
                  >
                    <Text style={[styles.layerConfirmButtonText, { color: theme.buttonText }]}>{t.confirm}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}

          <FlatList
            key={`layer-${mapLayer}-${mapCardSize}`}
            style={styles.levelMapList}
            onLayout={(event) => setMeasuredMapWidth(Math.round(event.nativeEvent.layout.width))}
            ref={mapScrollRef}
            data={levelItems}
            keyExtractor={(levelNumber) => String(levelNumber)}
            contentContainerStyle={styles.levelMapContent}
            numColumns={3}
            getItemLayout={(_, index) => ({
              length: mapRowHeight,
              offset: Math.floor(index / MAP_COLUMNS) * mapRowHeight,
              index,
            })}
            onContentSizeChange={() => {
              const anchor = mapScrollAnchorRef.current;
              if (anchor && getLayerNumber(anchor) === mapLayer) {
                mapScrollAnchorRef.current = null;
                mapScrollRef.current?.scrollToOffset({ offset: Math.floor((anchor - layerStart) / MAP_COLUMNS) * mapRowHeight, animated: false });
              }
            }}
            columnWrapperStyle={styles.levelMapRow}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            directionalLockEnabled
            alwaysBounceVertical
            onScrollBeginDrag={() => {
              mapScrollAnchorRef.current = null;
            }}
            initialNumToRender={18}
            maxToRenderPerBatch={12}
            windowSize={5}
            removeClippedSubviews={false}
            onScrollToIndexFailed={(info) => {
              requestAnimationFrame(() => {
                mapScrollRef.current?.scrollToOffset({
                  offset: Math.max(0, Math.floor(info.index / MAP_COLUMNS) * mapRowHeight - mapRowHeight),
                  animated: false,
                });
              });
            }}
            renderItem={({ item: levelNumber, index }) => {
              const active = levelNumber === level;
              const completed = completedLevels.has(levelNumber);
              const savedStars = clampNumber(levelStars[levelNumber], 0, 3, 0);
              const latestStars = latestStarResult?.level === levelNumber
                ? clampNumber(latestStarResult.stars, 0, 3, 0)
                : 0;
              const stars = completed ? Math.max(savedStars, latestStars) : 0;
              const justCompleted = levelNumber === recentCompletedLevel;
              const justUnlocked = levelNumber === recentUnlockedLevel || levelNumber === layerOpeningLevel;
              const locked = levelNumber > unlockedLevel;
              const miniTheme = THEMES[getThemeKey(levelNumber)];
              const cardBg = active ? theme.button : justUnlocked ? `${theme.button}22` : completed ? `${theme.accent}18` : theme.soft;
              const borderColor = active ? theme.button : justUnlocked ? theme.button : justCompleted ? theme.accent : completed ? theme.accent : theme.line;

              return (
                <Pressable
                  disabled={locked || interactionLocked}
                  style={({ pressed }) => [
                    styles.mapCard,
                    {
                      backgroundColor: cardBg,
                      borderColor,
                      borderWidth: (completed || justCompleted || justUnlocked) && !active ? 2 : 1,
                      height: mapCardSize,
                      opacity: locked ? 0.38 : pressed ? 0.82 : 1,
                      width: mapCardSize,
                    },
                  ]}
                  onPress={() => onSelectLevel(levelNumber)}
                >
                  <View style={styles.mapCardTop}>
                    <Text style={[styles.mapCardNumber, { color: active ? theme.buttonText : theme.text }]}>
                      {levelNumber}
                    </Text>
                    <View style={styles.mapMiniBoard}>
                      {miniTheme.pieces.slice(0, 4).map((color) => (
                        <View key={color} style={[styles.mapMiniTile, { backgroundColor: color }]} />
                      ))}
                    </View>
                  </View>
                  {completed ? (
                    <View
                      style={[
                        styles.mapCardStars,
                        {
                          backgroundColor: active ? 'rgba(255,253,248,0.18)' : 'rgba(255,253,248,0.78)',
                          borderColor: active ? 'rgba(255,255,255,0.22)' : 'rgba(139,105,66,0.16)',
                        },
                      ]}
                    >
                      {[1, 2, 3].map((star) => (
                        <Image
                          key={star}
                          source={star <= stars ? GAME_ART.stars.filled : GAME_ART.stars.empty}
                          style={[
                            styles.mapCardStarIcon,
                            { opacity: star <= stars ? 1 : active ? 0.58 : 0.48 },
                          ]}
                          resizeMode="contain"
                        />
                      ))}
                    </View>
                  ) : (
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.76}
                      style={[styles.mapCardMeta, { color: active ? theme.buttonText : justUnlocked ? theme.accent : theme.muted }]}
                    >
                      {justUnlocked ? t.newlyOpened : locked ? t.locked : `${getGridSize(levelNumber)}x${getGridSize(levelNumber)}`}
                    </Text>
                  )}
                </Pressable>
              );
            }}
          />
          <InsufficientFundsContent
            visible={!!insufficientFunds}
            theme={theme}
            info={insufficientFunds}
            onClose={onCloseInsufficientFunds}
            onStore={onStoreFromInsufficient}
            t={t}
          />
          <StoreModal visible={storeVisible} theme={theme} productsById={storeProductsById} purchasingId={storePurchasePendingId} onClose={onCloseStore} onBuy={onBuyStore} t={t} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export default function App() {
  const { width, height } = useWindowDimensions();
  const [showSplash, setShowSplash] = useState(true);
  const [homeIntroPlayed, setHomeIntroPlayed] = useState(false);
  const [level, setLevel] = useState(1);
  const [levelData, setLevelData] = useState(() => makeLevel(1));
  const [positions, setPositions] = useState({});
  const [history, setHistory] = useState([]);
  const [boardLayout, setBoardLayout] = useState(null);
  const [trayLayout, setTrayLayout] = useState(null);
  const [gameViewportHeight, setGameViewportHeight] = useState(0);
  const [isDraggingPiece, setIsDraggingPiece] = useState(false);
  const [piecePage, setPiecePage] = useState(0);
  const [message, setMessage] = useState('Parcalari kutulara yerlestir.');
  const [transientNotice, setTransientNotice] = useState('');
  const [levelsOpen, setLevelsOpen] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dailyRewardOpen, setDailyRewardOpen] = useState(false);
  const [updatePrompt, setUpdatePrompt] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsReady, setSettingsReady] = useState(false);
  const [progressReady, setProgressReady] = useState(false);
  const [musicReady, setMusicReady] = useState(false);
  const [success, setSuccess] = useState(false);
  const [completionPending, setCompletionPending] = useState(false);
  const [completedLevels, setCompletedLevels] = useState(() => new Set());
  const [levelStars, setLevelStars] = useState({});
  const [latestStarResult, setLatestStarResult] = useState(null);
  const [levelMoves, setLevelMoves] = useState(0);
  const [completedMoveCount, setCompletedMoveCount] = useState(0);
  const [completedStars, setCompletedStars] = useState(0);
  const [completedOptimalMoves, setCompletedOptimalMoves] = useState(0);
  const [levelTimeLimit, setLevelTimeLimit] = useState(() => getLevelTimeLimit(1));
  const [timeLeft, setTimeLeft] = useState(() => getLevelTimeLimit(1));
  const [timeExpired, setTimeExpired] = useState(false);
  const [timeExtensionAdLoading, setTimeExtensionAdLoading] = useState(false);
  const [rewardDoubled, setRewardDoubled] = useState(false);
  const [rewardDoubling, setRewardDoubling] = useState(false);
  const [rewardAdLoading, setRewardAdLoading] = useState(false);
  const [successContinueReady, setSuccessContinueReady] = useState(true);
  const [earnedRewards, setEarnedRewards] = useState({ hint: 0, layer: 0 });
  const [displayRewards, setDisplayRewards] = useState({ hint: 0, layer: 0 });
  const [rewardBaseBalances, setRewardBaseBalances] = useState({ hint: 0, layer: 0 });
  const [displayRewardBalances, setDisplayRewardBalances] = useState({ hint: 0, layer: 0 });
  const [successWasCompleted, setSuccessWasCompleted] = useState(false);
  const [progressIntro, setProgressIntro] = useState(null);
  const [recentCompletedLevel, setRecentCompletedLevel] = useState(null);
  const [recentUnlockedLevel, setRecentUnlockedLevel] = useState(null);
  const [mapInteractionLocked, setMapInteractionLocked] = useState(false);

  const [hintTokens, setHintTokens] = useState(0);
  const [freeHintsLeft, setFreeHintsLeft] = useState(3);
  const [paidHintConfirmed, setPaidHintConfirmed] = useState(false);
  const [hintConfirmOpen, setHintConfirmOpen] = useState(false);
  const [insufficientFunds, setInsufficientFunds] = useState(null);
  const [placementFlight, setPlacementFlight] = useState(null);
  const [hintFlight, setHintFlight] = useState(null);
  const [undoFlight, setUndoFlight] = useState(null);
  const [undoLocked, setUndoLocked] = useState(false);
  const [layerTokens, setLayerTokens] = useState(0);
  const [oneTimeStarterGrantId, setOneTimeStarterGrantId] = useState(null);
  const [unlockedLayer, setUnlockedLayer] = useState(1);
  const [unlockedLevel, setUnlockedLevel] = useState(1);
  const [chapterIntroLevel, setChapterIntroLevel] = useState(null);
  const [onboardingReady, setOnboardingReady] = useState(false);
  const [onboardingSeen, setOnboardingSeen] = useState(false);
  const [tutorialPlayOpen, setTutorialPlayOpen] = useState(false);
  const t = useMemo(() => getText(settings.language), [settings.language]);
  const rewardedAdsAvailable = settings.adsRemoved || level <= 10 || hasRewardedAdSupport();
  const languagePromptVisible = showSplash && homeIntroPlayed && settingsReady && !settings.languageSelected && !levelsOpen && !storeOpen;
  const dragStartPositions = useRef({});
  const transientNoticeTimer = useRef(null);
  const rootRef = useRef(null);
  const boardRef = useRef(null);
  const trayRef = useRef(null);
  const successOpacity = useRef(new Animated.Value(0)).current;
  const successScale = useRef(new Animated.Value(0.88)).current;
  const successContinueOpacity = useRef(new Animated.Value(1)).current;
  const successStarAnims = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  const levelEnterOpacity = useRef(new Animated.Value(1)).current;
  const timerPulseAnim = useRef(new Animated.Value(0)).current;
  const successTimer = useRef(null);
  const successContinueTimer = useRef(null);
  const countdownTickRef = useRef(null);
  const timeLeftRef = useRef(getLevelTimeLimit(1));
  const rewardCountAnim = useRef(new Animated.Value(0)).current;
  const placementFlightAnim = useRef(new Animated.Value(0)).current;
  const hintFlightAnim = useRef(new Animated.Value(0)).current;
  const undoFlightAnim = useRef(new Animated.Value(0)).current;
  const mapRevealTimer = useRef(null);
  const mapAutoStartTimer = useRef(null);
  const soundsRef = useRef({});
  const musicRef = useRef(null);
  const [storeProductsById, setStoreProductsById] = useState({});
  const [storePurchasePendingId, setStorePurchasePendingId] = useState(null);
  const grantStorePurchase = useCallback((productId) => {
    const pack = STORE_PACKAGE_BY_ID[productId];
    const type = STORE_PACKAGE_TYPE_BY_ID[productId];
    if (!pack || !type) return false;
    if (type === 'premium') {
      const nextSettings = { ...settings, adsRemoved: true };
      setSettings(nextSettings);
      writeStorageText(SETTINGS_FILE, JSON.stringify(nextSettings)).catch(console.warn);
      setStoreOpen(false);
      setMessage(t === I18N.tr ? 'Reklamlar kaldırıldı.' : 'Ads removed.');
      return true;
    }
    if (type === 'hint') {
      setHintTokens((tokens) => tokens + pack.amount);
    } else {
      setLayerTokens((tokens) => tokens + pack.amount);
    }
    playEffect('coin');
    setStoreOpen(false);
    setMessage(t.msgPurchase(t.packageTitles[pack.id] || pack.title, pack.amount));
    return true;
  }, [playEffect, settings, t]);
  const {
    connected: storeConnected,
    availablePurchases = [],
    getAvailablePurchases,
    products: storeProducts,
    fetchProducts: fetchStoreProducts,
    requestPurchase: requestStorePurchase,
    finishTransaction: finishStoreTransaction,
    restorePurchases: restoreStorePurchases,
  } = useIAP({
    onPurchaseSuccess: async (purchase) => {
      const productId = purchase.productId || purchase.id;
      try {
        if (grantStorePurchase(productId)) {
          await finishStoreTransaction({ purchase, isConsumable: productId !== 'puzzlegrid_remove_ads' });
        }
      } catch (error) {
        console.warn('Purchase finish failed', error);
      } finally {
        setStorePurchasePendingId(null);
      }
    },
    onPurchaseError: (error) => {
      const cancelled = /cancel/i.test(error?.code || '') || /cancel/i.test(error?.message || '');
      setStorePurchasePendingId(null);
      setMessage(cancelled ? t.purchaseCancelled : t.purchaseFailed(error?.message || error?.code || ''));
    },
    onError: (error) => {
      console.warn('Store error', error);
    },
  });

  useEffect(() => {
    if (storeConnected) getAvailablePurchases().catch(console.warn);
  }, [storeConnected, getAvailablePurchases]);

  useEffect(() => {
    if (availablePurchases.some((purchase) => (purchase.productId || purchase.id) === 'puzzlegrid_remove_ads')) {
      setSettings((current) => ({ ...current, adsRemoved: true }));
    }
  }, [availablePurchases]);

  useEffect(() => {
    PRELOAD_ART.forEach((asset) => {
      const uri = Image.resolveAssetSource(asset)?.uri;
      if (uri) Image.prefetch(uri);
    });
  }, []);

  useEffect(() => {
    if (!STORE_PURCHASES_ENABLED || !storeConnected) return;
    fetchStoreProducts({ skus: STORE_PRODUCT_IDS, type: 'in-app' }).catch((error) => {
      console.warn('Store products fetch failed', error);
    });
  }, [fetchStoreProducts, storeConnected]);

  useEffect(() => {
    const nextProducts = {};
    storeProducts.forEach((product) => {
      const productId = product.id || product.productId;
      if (productId) nextProducts[productId] = product;
    });
    setStoreProductsById(nextProducts);
  }, [storeProducts]);

  useEffect(() => {
    let cancelled = false;
    const loadSettings = async () => {
      try {
        const saved = await readStorageText(SETTINGS_FILE);
        const parsed = JSON.parse(saved);
        const nextSettings = { ...DEFAULT_SETTINGS, ...parsed };
        if (!parsed.languageSelected) {
          nextSettings.language = DEFAULT_SETTINGS.language;
          nextSettings.languageSelected = false;
        }
        if (parsed.musicVersion !== MUSIC_SETTINGS_VERSION) {
          nextSettings.music = true;
          nextSettings.musicVersion = MUSIC_SETTINGS_VERSION;
        }
        if (!cancelled) setSettings((current) => ({ ...nextSettings, adsRemoved: !!(nextSettings.adsRemoved || current.adsRemoved) }));
      } catch (error) {
        if (!cancelled) setSettings((current) => ({ ...DEFAULT_SETTINGS, adsRemoved: !!current.adsRemoved }));
      } finally {
        if (!cancelled) setSettingsReady(true);
      }
    };
    loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!settingsReady) return;
    writeStorageText(SETTINGS_FILE, JSON.stringify(settings)).catch((error) => {
      console.warn('Settings save failed', error);
    });
  }, [settings, settingsReady]);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !settingsReady) return;
    let cancelled = false;
    const checkStoreVersion = async () => {
      try {
        const response = await fetch(`${APP_STORE_LOOKUP_URL}&_=${Date.now()}`);
        const data = await response.json();
        const storeVersion = data?.results?.[0]?.version;
        if (!cancelled && storeVersion && compareVersions(storeVersion, APP_VERSION) > 0) {
          setUpdatePrompt({ version: storeVersion });
        }
      } catch (error) {
        console.warn('App Store version check failed', error);
      }
    };
    checkStoreVersion();
    return () => {
      cancelled = true;
    };
  }, [settingsReady]);

  useEffect(() => {
    let cancelled = false;
    const loadProgress = async () => {
      if (!PROGRESS_PERSISTENCE_ENABLED) {
        if (!cancelled) {
          const firstLevelData = makeLevel(1);
          const firstTimeLimit = getLevelTimeLimit(1, firstLevelData);
          setLevelData(firstLevelData);
          setLevelTimeLimit(firstTimeLimit);
          timeLeftRef.current = firstTimeLimit;
          setTimeLeft(firstTimeLimit);
          setTimeExpired(false);
          setCompletedLevels(new Set());
          setLevelStars({});
          setUnlockedLevel(1);
          setUnlockedLayer(1);
          setHintTokens(0);
          setLayerTokens(0);
          setFreeHintsLeft(3);
          setPaidHintConfirmed(false);
          setOnboardingSeen(false);
          setProgressReady(true);
        }
        return;
      }

      try {
        const saved = await readStorageText(PROGRESS_FILE);
        const parsed = JSON.parse(saved);
        const savedLevel = clampNumber(parsed.level, 1, TOTAL_LEVELS, 1);
        const completed = sanitizeCompletedLevels(parsed.completedLevels);
        const storedUnlockedLevel = clampNumber(parsed.unlockedLevel, 1, TOTAL_LEVELS, 1);
        const safeLevel = getResumeLevel(savedLevel, completed);
        const safeUnlockedLevel = Math.max(safeLevel, savedLevel, storedUnlockedLevel);
        const safeUnlockedLayer = Math.max(getLayerNumber(safeUnlockedLevel), clampNumber(parsed.unlockedLayer, 1, getLayerCount(), 1));
        if (cancelled) return;
        const safeLevelData = makeLevel(safeLevel);
        const safeTimeLimit = getLevelTimeLimit(safeLevel, safeLevelData);
        setLevel(safeLevel);
        setLevelData(safeLevelData);
        setLevelTimeLimit(safeTimeLimit);
        timeLeftRef.current = safeTimeLimit;
        setTimeLeft(safeTimeLimit);
        setTimeExpired(false);
        setPositions({});
        setHistory([]);
        setPiecePage(0);
        setCompletedLevels(new Set(completed));
        const savedStars = parsed.starScoringVersion === STAR_SCORING_VERSION
          ? sanitizeLevelStars(parsed.levelStars)
          : {};
        setLevelStars(savedStars);
        setUnlockedLevel(safeUnlockedLevel);
        setUnlockedLayer(safeUnlockedLayer);
        const starterGrantApplied = parsed.oneTimeStarterGrantId === ONE_TIME_STARTER_GRANT_ID;
        const starterGrantAmount = starterGrantApplied ? 0 : ONE_TIME_STARTER_GRANT_AMOUNT;
        setHintTokens(clampNumber(parsed.hintTokens, 0, 999999, 0) + starterGrantAmount);
        setLayerTokens(clampNumber(parsed.layerTokens, 0, 999999, 0) + starterGrantAmount);
        setOneTimeStarterGrantId(ONE_TIME_STARTER_GRANT_ID);
        setFreeHintsLeft(clampNumber(parsed.freeHintsLeft, 0, 3, 3));
        setPaidHintConfirmed(!!parsed.paidHintConfirmed);
        setOnboardingSeen(!!parsed.onboardingSeen);
      } catch (error) {
        if (!cancelled) {
          setCompletedLevels(new Set());
          setLevelStars({});
          setUnlockedLevel(1);
          setUnlockedLayer(1);
          setHintTokens(ONE_TIME_STARTER_GRANT_AMOUNT);
          setLayerTokens(ONE_TIME_STARTER_GRANT_AMOUNT);
          setOneTimeStarterGrantId(ONE_TIME_STARTER_GRANT_ID);
          setFreeHintsLeft(3);
        }
      } finally {
        if (!cancelled) setProgressReady(true);
      }
    };
    loadProgress();
    return () => {
      cancelled = true;
    };
  }, []);

  const createProgressSnapshot = useCallback(
    () => ({
      level,
      completedLevels: Array.from(completedLevels).sort((a, b) => a - b),
      levelStars,
      starScoringVersion: STAR_SCORING_VERSION,
      unlockedLevel,
      unlockedLayer,
      hintTokens,
      layerTokens,
      oneTimeStarterGrantId,
      freeHintsLeft,
      paidHintConfirmed,
      onboardingSeen,
      savedAt: new Date().toISOString(),
    }),
    [completedLevels, freeHintsLeft, hintTokens, layerTokens, level, levelStars, onboardingSeen, oneTimeStarterGrantId, paidHintConfirmed, unlockedLayer, unlockedLevel],
  );

  const saveProgressNow = useCallback(() => {
    if (!PROGRESS_PERSISTENCE_ENABLED) return;
    if (!progressReady) return;
    writeStorageText(PROGRESS_FILE, JSON.stringify(createProgressSnapshot())).catch((error) => {
      console.warn('Progress save failed', error);
    });
  }, [createProgressSnapshot, progressReady]);

  const maybePromptForReview = useCallback(async (completedLevel) => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    if (completedLevel < REVIEW_PROMPT_FIRST_LEVEL) return;
    try {
      let lastPromptLevel = 0;
      try {
        const saved = await readStorageText(REVIEW_PROMPT_FILE);
        const parsed = JSON.parse(saved);
        lastPromptLevel = clampNumber(parsed.lastPromptLevel, 0, TOTAL_LEVELS, 0);
      } catch (error) {
        lastPromptLevel = 0;
      }
      if (lastPromptLevel && completedLevel - lastPromptLevel < REVIEW_PROMPT_LEVEL_INTERVAL) return;
      await writeStorageText(REVIEW_PROMPT_FILE, JSON.stringify({ lastPromptLevel: completedLevel, updatedAt: new Date().toISOString() }));
      const available = await StoreReview.isAvailableAsync();
      if (available) {
        await StoreReview.requestReview();
      } else {
        await openStoreUrl(getStoreReviewUrl());
      }
    } catch (error) {
      console.warn('Review prompt failed', error);
    }
  }, []);

  const closeUpdatePrompt = useCallback(() => {
    playEffect('tap');
    setUpdatePrompt(null);
  }, [playEffect]);

  const openUpdatePrompt = useCallback(() => {
    playEffect('tap');
    setUpdatePrompt(null);
    openStoreUrl();
  }, [playEffect]);

  useEffect(() => {
    if (!progressReady) return undefined;
    const timer = setTimeout(() => {
      saveProgressNow();
    }, 220);
    return () => clearTimeout(timer);
  }, [progressReady, saveProgressNow]);

  useEffect(() => {
    if (!progressReady) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') saveProgressNow();
    });
    return () => subscription.remove();
  }, [progressReady, saveProgressNow]);

  useEffect(() => {
    if (!mobileAds) return;
    const ads = mobileAds();
    Promise.resolve(
      MaxAdContentRating && ads.setRequestConfiguration
        ? ads.setRequestConfiguration({
          maxAdContentRating: MaxAdContentRating.PG,
          tagForChildDirectedTreatment: false,
          tagForUnderAgeOfConsent: false,
        })
        : undefined,
    )
      .then(() => ads.initialize?.())
      .catch((error) => {
        console.warn('Ads initialization failed', error);
      });
  }, []);

  useEffect(() => {
    if (!settingsReady) return;
    setMessage(t.msgPlacePieces);
  }, [settings.language, settingsReady, t]);


  useEffect(() => {
    let mounted = true;
    const loadSounds = async () => {
      try {
        if (!OptionalAudio) return;
        await OptionalAudio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const entries = await Promise.all(
          Object.entries(SFX).map(async ([key, source]) => {
            const { sound } = await OptionalAudio.Sound.createAsync(source, { volume: 0.65 });
            return [key, sound];
          }),
        );
        const { sound: music } = await OptionalAudio.Sound.createAsync(MUSIC.background, {
          isLooping: true,
          volume: 0.22,
        });
        if (mounted) {
          soundsRef.current = Object.fromEntries(entries);
          musicRef.current = music;
          setMusicReady(true);
        } else {
          music.unloadAsync().catch(() => {});
        }
      } catch (error) {
        soundsRef.current = {};
        musicRef.current = null;
        setMusicReady(false);
      }
    };
    loadSounds();
    return () => {
      mounted = false;
      Object.values(soundsRef.current).forEach((sound) => sound?.unloadAsync?.());
      soundsRef.current = {};
      musicRef.current?.unloadAsync?.().catch(() => {});
      musicRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!settingsReady) return;
    const music = musicRef.current;
    if (!music) return;
    if (settings.music) {
      music.playAsync().catch(() => {});
    } else {
      music.pauseAsync().catch(() => {});
    }
  }, [musicReady, settings.music, settingsReady]);

  const playEffect = useCallback(
    (name) => {
      if (!settings.sound) return;
      const sound = soundsRef.current[name];
      if (!sound) return;
      sound.replayAsync().catch(() => {});
    },
    [settings.sound],
  );

  const vibrateEffect = useCallback(
    (pattern) => {
      if (settings.vibration) Vibration.vibrate(pattern);
    },
    [settings.vibration],
  );

  const showInsufficientFunds = useCallback((type, needed, current) => {
    setInsufficientFunds({ type, needed, current });
  }, []);

  const closeInsufficientFunds = useCallback(() => {
    setInsufficientFunds(null);
  }, []);

  const openStoreFromInsufficient = useCallback(() => {
    playEffect('tap');
    setInsufficientFunds(null);
    setStoreOpen(true);
  }, [playEffect]);

  const showInterstitialAdThen = useCallback(
    (onDone) => {
      if (settings.adsRemoved || level <= 10) {
        onDone?.();
        return;
      }
      if (!hasInterstitialAdSupport()) {
        onDone?.();
        return;
      }
      const unitId = ADMOB_USE_TEST_INTERSTITIAL_ADS ? TestIds?.INTERSTITIAL : getAdMobInterstitialUnitId();
      if (!unitId) {
        onDone?.();
        return;
      }
      const interstitial = InterstitialAd.createForAdRequest(unitId, { requestNonPersonalizedAdsOnly: true });
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        unsubscribeLoaded?.();
        unsubscribeClosed?.();
        unsubscribeError?.();
        onDone?.();
      };
      const unsubscribeLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => {
        interstitial.show().catch(finish);
      });
      const unsubscribeClosed = interstitial.addAdEventListener(AdEventType.CLOSED, finish);
      const unsubscribeError = interstitial.addAdEventListener(AdEventType.ERROR, (error) => {
        console.warn('Interstitial ad failed', error);
        finish();
      });
      setMessage(t.adLoading);
      interstitial.load();
    },
    [t, settings.adsRemoved, level],
  );

  const showRewardedAdThen = useCallback(
    (onEarned, onNotEarned, messages = null) => {
      if (settings.adsRemoved || level <= 10) {
        onEarned?.();
        return;
      }
      const unavailableMessage = messages?.unavailable || t.adUnavailable;
      const skippedMessage = messages?.skipped || t.adSkipped;
      const failedMessage = messages?.failed || t.adFailed;
      if (!hasRewardedAdSupport()) {
        setMessage(unavailableMessage);
        onNotEarned?.();
        return;
      }
      const unitId = ADMOB_USE_TEST_REWARDED_ADS ? TestIds?.REWARDED : getAdMobRewardedUnitId();
      if (!unitId) {
        setMessage(unavailableMessage);
        onNotEarned?.();
        return;
      }
      const rewarded = RewardedAd.createForAdRequest(unitId, { requestNonPersonalizedAdsOnly: true });
      let earned = false;
      let finished = false;
      const finish = (failureReason = '') => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        unsubscribeLoaded?.();
        unsubscribeEarned?.();
        unsubscribeClosed?.();
        unsubscribeError?.();
        if (earned) {
          onEarned?.();
          return;
        }
        setMessage(failureReason ? failedMessage(failureReason) : skippedMessage);
        onNotEarned?.();
      };
      const unsubscribeLoaded = rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
        clearTimeout(timeout);
        rewarded.show().catch((error) => {
          const reason = getAdErrorText(error);
          console.warn('Rewarded ad show failed', error);
          finish(reason);
        });
      });
      const unsubscribeEarned = rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
        earned = true;
      });
      const unsubscribeClosed = rewarded.addAdEventListener(AdEventType.CLOSED, finish);
      const unsubscribeError = rewarded.addAdEventListener(AdEventType.ERROR, (error) => {
        const reason = getAdErrorText(error);
        console.warn('Rewarded ad failed', error);
        finish(reason);
      });
      const timeout = setTimeout(() => {
        console.warn('Rewarded ad timed out');
        finish('timeout');
      }, AD_LOAD_TIMEOUT_MS);
      setMessage(t.adLoading);
      rewarded.load();
    },
    [t, settings.adsRemoved, level],
  );

  useEffect(() => {
    setOnboardingReady(true);
  }, []);

  useEffect(() => {
    if (!success) {
      successStarAnims.forEach((anim) => anim.setValue(0));
      return;
    }
    successStarAnims.forEach((anim) => anim.setValue(0));
    const revealAnimation = Animated.sequence([
      Animated.delay(420),
      Animated.stagger(
        360,
        successStarAnims.map((anim) =>
          Animated.spring(anim, {
            toValue: 1,
            friction: 6,
            tension: 105,
            useNativeDriver: true,
          }),
        ),
      ),
    ]);
    revealAnimation.start();
    return () => revealAnimation.stop();
  }, [success, completedStars, successStarAnims]);

  useEffect(() => {
    if (!success) return undefined;
    rewardCountAnim.setValue(0);
    setDisplayRewards({ hint: 0, layer: 0 });
    setDisplayRewardBalances(rewardBaseBalances);
    const id = rewardCountAnim.addListener(({ value }) => {
      setDisplayRewards({
        hint: Math.round(earnedRewards.hint * value),
        layer: Math.round(earnedRewards.layer * value),
      });
      setDisplayRewardBalances({
        hint: rewardBaseBalances.hint + Math.round(earnedRewards.hint * value),
        layer: rewardBaseBalances.layer + Math.round(earnedRewards.layer * value),
      });
    });
    if (earnedRewards.hint > 0 || earnedRewards.layer > 0) playEffect('coin');
    Animated.timing(rewardCountAnim, { toValue: 1, duration: 760, useNativeDriver: false }).start();
    return () => rewardCountAnim.removeListener(id);
  }, [earnedRewards, playEffect, rewardBaseBalances, rewardCountAnim, success]);


  useEffect(
    () => () => {
      if (successTimer.current) clearTimeout(successTimer.current);
      if (successContinueTimer.current) clearTimeout(successContinueTimer.current);
      if (mapRevealTimer.current) clearTimeout(mapRevealTimer.current);
      if (mapAutoStartTimer.current) clearTimeout(mapAutoStartTimer.current);
    },
    [],
  );

  const themeKey = getThemeKey(level);
  const theme = THEMES[themeKey];
  const isModernLevel = level <= MODERN_LEVEL_LIMIT;
  const successDoubleOfferActive =
    success &&
    !successWasCompleted &&
    (earnedRewards.hint > 0 || earnedRewards.layer > 0);
  const countdownActive =
    progressReady &&
    !showSplash &&
    !tutorialPlayOpen &&
    !levelsOpen &&
    !storeOpen &&
    !settingsOpen &&
    !success &&
    !completionPending &&
    !progressIntro &&
    !chapterIntroLevel &&
    !timeExpired;
  const timeProgress = levelTimeLimit > 0 ? Math.max(0, Math.min(1, timeLeft / levelTimeLimit)) : 0;
  const timeUrgent = timeLeft <= Math.max(8, levelTimeLimit * 0.18);
  const timeCritical = timeLeft > 0 && timeLeft <= 5;
  const timeText = formatTime(timeLeft);
  const timeExtensionSeconds = levelTimeLimit < 60 ? 30 : 60;
  const timerActiveColor = timeProgress <= 0.18 ? '#F2655A' : timeProgress <= 0.42 ? '#F4BD42' : '#35C7A5';
  const timerPulseScale = timerPulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.018] });

  useEffect(() => {
    if (!countdownActive || !timeCritical) {
      timerPulseAnim.stopAnimation();
      timerPulseAnim.setValue(0);
      return undefined;
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(timerPulseAnim, { toValue: 1, duration: 360, useNativeDriver: true }),
        Animated.timing(timerPulseAnim, { toValue: 0, duration: 360, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [countdownActive, timeCritical, timerPulseAnim]);

  useEffect(() => {
    if (!countdownActive) {
      countdownTickRef.current = null;
      return undefined;
    }

    countdownTickRef.current = Date.now();
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = countdownTickRef.current ? (now - countdownTickRef.current) / 1000 : 0;
      countdownTickRef.current = now;
      const previousExact = timeLeftRef.current;
      if (previousExact <= 0) {
        timeLeftRef.current = 0;
        return;
      }

      const next = Math.max(0, previousExact - elapsed);
      timeLeftRef.current = next;
      const previousDisplay = Math.ceil(previousExact);
      const nextDisplay = Math.ceil(next);

      if (nextDisplay !== previousDisplay || next <= 0) {
        setTimeLeft(nextDisplay);
      }

      if (next <= 0) {
        setTimeExpired(true);
        setMessage(t.msgTimeUp);
        playEffect('wrong');
      }
    }, 250);

    return () => {
      clearInterval(interval);
      countdownTickRef.current = null;
    };
  }, [countdownActive, playEffect, t]);
  const layoutHeight = Math.max(480, gameViewportHeight || height);
  const compactLayout = layoutHeight < 720;
  const androidStatusOffset = Platform.OS === 'android' ? RNStatusBar.currentHeight || 0 : 0;
  const topComfortPadding = Math.min(28, Math.max(10, layoutHeight * 0.022));
  const gameTopPadding = Math.round(
    Platform.OS === 'android'
      ? androidStatusOffset + topComfortPadding
      : Math.min(24, Math.max(10, layoutHeight * 0.024)),
  );
  const bottomSystemReserve = Platform.OS === 'android'
    ? Math.min(72, Math.max(42, layoutHeight * 0.068))
    : Math.min(34, Math.max(16, layoutHeight * 0.026));
  const trayBottomOffset = isModernLevel ? bottomSystemReserve : Math.min(34, Math.max(16, bottomSystemReserve * 0.6));
  const trayPanelHeight = isModernLevel
    ? Math.max(218, Math.min(compactLayout ? 274 : 316, layoutHeight * (compactLayout ? 0.34 : 0.36)))
    : Math.max(160, Math.min(224, layoutHeight * 0.28));
  const trayTop = Math.max(0, layoutHeight - trayPanelHeight - trayBottomOffset);
  const trayFrame = useMemo(
    () =>
      trayLayout || {
        x: BOARD_PADDING,
        y: trayTop,
        width: width - BOARD_PADDING * 2,
        height: trayPanelHeight,
      },
    [trayLayout, trayPanelHeight, trayTop, width],
  );
  const boardTopReserve = (isModernLevel ? 128 : 146) + gameTopPadding;
  const mediumGridNeedsAir = levelData.size >= 5 && levelData.size <= 7;
  const boardTrayGap = isModernLevel
    ? mediumGridNeedsAir
      ? Math.round(Math.min(30, Math.max(18, layoutHeight * 0.03)))
      : 14
    : 12;
  const minimumBoardHeight = levelData.size * (levelData.size >= 5 ? 10 : 12);
  const boardMaxHeight = Math.max(minimumBoardHeight, trayTop - boardTopReserve - boardTrayGap);
  const boardWidthLimit = Math.min(width - BOARD_PADDING * 2, width >= 600 ? 430 : 400);
  const boardSize = Math.min(boardWidthLimit, boardMaxHeight);
  const unplacedPieces = useMemo(() => levelData.pieces.filter((piece) => !piece.placed), [levelData.pieces]);
  const activeTrayHeaderSpace = isModernLevel ? MODERN_TRAY_HEADER_SPACE : TRAY_HEADER_SPACE;
  const trayInnerHeight = Math.max(86, trayFrame.height - activeTrayHeaderSpace - (isModernLevel ? 78 : 10));
  const trayInnerWidth = Math.max(1, trayFrame.width - 24);
  const modernPreferredBoardSize = levelData.size <= 3
    ? 162
    : levelData.size === 4
      ? 216
      : levelData.size === 5
        ? 280
        : levelData.size === 6
          ? 318
          : levelData.size === 7
            ? 350
            : levelData.size === 8
              ? 376
              : 396;
  const modernFittedCellSize = Math.floor(Math.min(boardSize, modernPreferredBoardSize) / levelData.size);
  const cellSize = isModernLevel ? Math.max(levelData.size >= 5 ? 10 : 12, modernFittedCellSize) : Math.max(12, Math.min(40, Math.floor(boardSize / levelData.size)));
  const maxTrayPieceBounds = useMemo(
    () =>
      unplacedPieces.reduce(
        (max, piece) => {
          const bounds = getPieceBounds(piece);
          return {
            width: Math.max(max.width, bounds.width),
            height: Math.max(max.height, bounds.height),
          };
        },
        { width: 1, height: 1 },
      ),
    [unplacedPieces],
  );
  const modernTrayMaxCellSize = levelData.size <= 5 ? 34 : levelData.size <= 6 ? 32 : levelData.size <= 8 ? 30 : 28;
  const trayCellFitByWidth = Math.floor(trayInnerWidth / Math.max(1, maxTrayPieceBounds.width));
  const trayCellFitByHeight = Math.floor(trayInnerHeight / Math.max(1, maxTrayPieceBounds.height));
  const trayCellSize = isModernLevel
    ? Math.max(12, Math.min(cellSize, modernTrayMaxCellSize, trayCellFitByWidth, trayCellFitByHeight, Math.floor((width - BOARD_PADDING * 2 - 30) / 9)))
    : Math.max(12, Math.min(cellSize, 30, trayCellFitByWidth, trayCellFitByHeight, Math.floor((width - BOARD_PADDING * 2 - 24) / 10)));
  const trayPages = useMemo(
    () => createTrayPages(unplacedPieces, trayCellSize, trayInnerWidth, trayInnerHeight),
    [trayCellSize, trayInnerHeight, trayInnerWidth, unplacedPieces],
  );
  const trayPageCount = Math.max(1, trayPages.length);
  const visibleTrayPieces = trayPages[Math.min(piecePage, trayPageCount - 1)] || [];
  const trayPageKey = visibleTrayPieces.map((piece) => piece.id).join('|');
  const trayReadyKey = `${Math.round(trayFrame.x)}:${Math.round(trayFrame.y)}:${Math.round(trayFrame.width)}:${Math.round(trayFrame.height)}:${trayCellSize}:${trayInnerWidth}:${trayInnerHeight}`;
  const boardReadyKey = boardLayout ? `${Math.round(boardLayout.x)}:${Math.round(boardLayout.y)}:${cellSize}` : 'no-board';

  const arrangeTray = useCallback(
    (pieces, currentPositions = positions, pageOverride = piecePage) => {
      const currentUnplacedPieces = pieces.filter((piece) => !piece.placed);
      const currentTrayPages = createTrayPages(currentUnplacedPieces, trayCellSize, trayInnerWidth, trayInnerHeight);
      const activePage = Math.max(0, Math.min(pageOverride, currentTrayPages.length - 1));
      const currentTrayPage = currentTrayPages[activePage] || [];
      const next = {
        ...currentPositions,
        __readyLevel: level,
        __readyPiecePage: activePage,
        __readyTrayKey: currentTrayPage.map((piece) => piece.id).join('|'),
        __readyTrayFrameKey: trayReadyKey,
        __readyBoardKey: boardReadyKey,
      };
      if (boardLayout) {
        pieces.forEach((piece) => {
          if (!piece.placed || piece.row === null || piece.col === null) return;
          next[piece.id] = {
            x: boardLayout.x + piece.col * cellSize,
            y: boardLayout.y + piece.row * cellSize,
          };
        });
      }
      const trayLeft = trayFrame.x + 12;
      const trayRight = trayFrame.x + trayFrame.width - 12;
      const trayBottom = trayFrame.y + trayFrame.height - (isModernLevel ? 72 : 10);
      let x = trayLeft;
      let y = trayFrame.y + activeTrayHeaderSpace;
      let rowHeight = 0;

      currentTrayPage.forEach((piece) => {
        const bounds = getPieceBounds(piece);
        const pieceWidth = bounds.width * trayCellSize;
        const pieceHeight = bounds.height * trayCellSize;

        if (x + pieceWidth > trayRight) {
          x = trayLeft;
          y += rowHeight + TRAY_PIECE_GAP;
          rowHeight = 0;
        }

        next[piece.id] = {
          x: Math.max(trayLeft, Math.min(x, trayRight - pieceWidth)),
          y: Math.max(trayFrame.y + activeTrayHeaderSpace, Math.min(y, trayBottom - pieceHeight)),
        };
        x += pieceWidth + TRAY_PIECE_GAP;
        rowHeight = Math.max(rowHeight, pieceHeight);
      });

      return next;
    },
    [activeTrayHeaderSpace, boardLayout, boardReadyKey, cellSize, isModernLevel, level, piecePage, positions, trayCellSize, trayFrame, trayInnerHeight, trayInnerWidth, trayReadyKey],
  );

  const occupiedCells = useMemo(() => {
    const occupied = new Map();
    levelData.pieces.forEach((piece) => {
      if (!piece.placed) return;
      getPieceCells(piece, { row: piece.row, col: piece.col }).forEach((cell) => occupied.set(cell, piece.id));
    });
    return occupied;
  }, [levelData.pieces]);

  const visibleTrayIds = useMemo(
    () => new Set(visibleTrayPieces.map((piece) => piece.id)),
    [visibleTrayPieces],
  );

  const startLevel = useCallback(
    (nextLevel, text = null, showIntro = true) => {
      const safeLevel = Math.max(1, Math.min(TOTAL_LEVELS, nextLevel));
      if (successTimer.current) {
        clearTimeout(successTimer.current);
        successTimer.current = null;
      }
      setPlacementFlight(null);
      setUndoFlight(null);
      setUndoLocked(false);
      const nextLevelData = makeLevel(safeLevel);
      setLevel(safeLevel);
      setLevelData(nextLevelData);
      const nextTimeLimit = getLevelTimeLimit(safeLevel, nextLevelData);
      setLevelTimeLimit(nextTimeLimit);
      timeLeftRef.current = nextTimeLimit;
      setTimeLeft(nextTimeLimit);
      setTimeExpired(false);
      setPositions({});
      setHistory([]);
      setPiecePage(0);
      setSuccess(false);
      setCompletionPending(false);
      setLevelMoves(0);
      setCompletedMoveCount(0);
      setCompletedStars(0);
      setCompletedOptimalMoves(0);
      setRewardDoubled(false);
      setRewardDoubling(false);
      setEarnedRewards({ hint: 0, layer: 0 });
      setDisplayRewards({ hint: 0, layer: 0 });
      setRewardBaseBalances({ hint: 0, layer: 0 });
      setDisplayRewardBalances({ hint: 0, layer: 0 });
      setSuccessWasCompleted(false);
      setChapterIntroLevel(safeLevel <= MODERN_LEVEL_LIMIT ? safeLevel : null);
      setMessage(text || t.msgPlacePieces);
    },
    [t],
  );

  useEffect(() => {
    levelEnterOpacity.setValue(0);
    Animated.timing(levelEnterOpacity, { toValue: 1, duration: 240, useNativeDriver: true }).start();
  }, [level, levelEnterOpacity]);

  useEffect(() => {
    if (
      positions.__readyLevel === level &&
      positions.__readyPiecePage === piecePage &&
      positions.__readyTrayKey === trayPageKey &&
      positions.__readyTrayFrameKey === trayReadyKey &&
      positions.__readyBoardKey === boardReadyKey
    ) {
      return;
    }
    setPositions((current) => arrangeTray(levelData.pieces, current));
  }, [
    arrangeTray,
    level,
    levelData.pieces,
    piecePage,
    boardReadyKey,
    trayReadyKey,
    trayPageKey,
    positions.__readyBoardKey,
    positions.__readyLevel,
    positions.__readyPiecePage,
    positions.__readyTrayFrameKey,
    positions.__readyTrayKey,
  ]);

  useEffect(() => {
    if (piecePage < trayPageCount) return;
    setPiecePage(trayPageCount - 1);
  }, [piecePage, trayPageCount]);

  const showTransientNotice = useCallback((text) => {
    setTransientNotice(text);
    if (transientNoticeTimer.current) clearTimeout(transientNoticeTimer.current);
    transientNoticeTimer.current = setTimeout(() => {
      setTransientNotice('');
      transientNoticeTimer.current = null;
    }, 1400);
  }, []);

  useEffect(
    () => () => {
      if (transientNoticeTimer.current) clearTimeout(transientNoticeTimer.current);
    },
    [],
  );

  const measureBoard = useCallback(() => {
    if (!rootRef.current || !boardRef.current) return;
    if (boardRef.current.measureLayout) {
      boardRef.current.measureLayout(
        rootRef.current,
        (x, y, boardWidth, boardHeight) => {
          setBoardLayout({
            x,
            y,
            width: boardWidth,
            height: boardHeight,
          });
        },
        () => {},
      );
      return;
    }
    if (!rootRef.current.measureInWindow || !boardRef.current.measureInWindow) return;
    rootRef.current.measureInWindow((rootX, rootY) => {
      if (!boardRef.current || !boardRef.current.measureInWindow) return;
      boardRef.current.measureInWindow((boardX, boardY, boardWidth, boardHeight) => {
        setBoardLayout({
          x: boardX - rootX,
          y: boardY - rootY,
          width: boardWidth,
          height: boardHeight,
        });
      });
    });
  }, []);

  const measureTray = useCallback(() => {
    if (!rootRef.current || !trayRef.current) return;
    if (trayRef.current.measureLayout) {
      trayRef.current.measureLayout(
        rootRef.current,
        (x, y, trayWidth, trayHeight) => {
          setTrayLayout({
            x,
            y,
            width: trayWidth,
            height: trayHeight,
          });
        },
        () => {},
      );
      return;
    }
    if (!rootRef.current.measureInWindow || !trayRef.current.measureInWindow) return;
    rootRef.current.measureInWindow((rootX, rootY) => {
      if (!trayRef.current || !trayRef.current.measureInWindow) return;
      trayRef.current.measureInWindow((trayX, trayY, trayWidth, trayHeight) => {
        setTrayLayout({
          x: trayX - rootX,
          y: trayY - rootY,
          width: trayWidth,
          height: trayHeight,
        });
      });
    });
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      measureBoard();
      measureTray();
    });
    return () => cancelAnimationFrame(frame);
  }, [cellSize, layoutHeight, measureBoard, measureTray, trayBottomOffset, trayPanelHeight, width]);

  const pushHistory = useCallback((movedPieceId = null) => {
    setHistory((items) => [...items.slice(-19), createSnapshot(levelData, positions, movedPieceId)]);
  }, [levelData, positions]);

  const isPlacementValid = useCallback(
    (piece, row, col) => {
      const inside = piece.cells.every(
        (cell) =>
          row + cell.row >= 0 &&
          row + cell.row < levelData.size &&
          col + cell.col >= 0 &&
          col + cell.col < levelData.size,
      );
      if (!inside) return false;

      return getPieceCells(piece, { row, col }).every((cell) => {
        const occupant = occupiedCells.get(cell);
        return !occupant || occupant === piece.id;
      });
    },
    [levelData.size, occupiedCells],
  );

  const checkComplete = useCallback(
    (pieces, moveCount = levelMoves) => {
      if (timeExpired) return;
      const filled = new Set();
      pieces.forEach((piece) => {
        if (!piece.placed) return;
        getPieceCells(piece, { row: piece.row, col: piece.col }).forEach((cell) => filled.add(cell));
      });

      if (filled.size !== levelData.size * levelData.size) return;
      setCompletionPending(true);
      const rewards = getLevelRewards(level);
      const wasCompleted = completedLevels.has(level);
      const earned = wasCompleted ? { hint: 0, layer: 0 } : rewards;
      const delayContinue = !wasCompleted && shouldOfferTimedDoubleReward(level);
      const finishTimeLeft = Math.max(0, timeLeftRef.current);
      const starResult = getLevelStarResult(finishTimeLeft, levelTimeLimit);
      setCompletedMoveCount(Math.ceil(finishTimeLeft));
      setCompletedStars(starResult.stars);
      setCompletedOptimalMoves(starResult.timeLimit);
      setLatestStarResult({ level, stars: starResult.stars });
      setLevelStars((current) => ({
        ...current,
        [level]: Math.max(current[level] || 0, starResult.stars),
      }));
      setRewardDoubled(false);
      setRewardDoubling(false);
      setEarnedRewards(earned);
      setRewardBaseBalances({ hint: hintTokens, layer: layerTokens });
      setDisplayRewardBalances({ hint: hintTokens, layer: layerTokens });
      setSuccessWasCompleted(wasCompleted);
      setCompletedLevels((current) => {
        if (current.has(level)) return current;
        const next = new Set(current);
        next.add(level);
        setHintTokens((tokens) => tokens + earned.hint);
        setLayerTokens((tokens) => tokens + earned.layer);
        return next;
      });
      if (!wasCompleted && level < TOTAL_LEVELS) {
        const nextLevel = level + 1;
        const completedLayer = getLayerNumber(level);
        const nextLayer = getLayerNumber(nextLevel);
        const nextLayerCost = nextLayer > completedLayer ? getLayerCost(nextLayer) : null;
        if (!nextLayerCost || nextLayer <= unlockedLayer) {
          setUnlockedLevel((current) => Math.max(current, nextLevel));
          setUnlockedLayer((current) => Math.max(current, nextLayer));
        }
      }
      if (!wasCompleted) {
        maybePromptForReview(level);
      }
      const pulseKey = Date.now();
      setLevelData((current) => ({
        ...current,
        pieces: current.pieces.map((piece) => (piece.placed ? { ...piece, pulseKey, completeKey: pulseKey } : piece)),
      }));
      setMessage(t.msgComplete);
      vibrateEffect([25, 35, 25]);
      playEffect('complete');

      const revealSuccess = () => {
        successOpacity.setValue(0);
        successScale.setValue(0.88);
        setCompletionPending(false);
        if (successContinueTimer.current) clearTimeout(successContinueTimer.current);
        if (delayContinue) {
          setSuccessContinueReady(false);
          successContinueOpacity.setValue(0);
        } else {
          setSuccessContinueReady(true);
          successContinueOpacity.setValue(1);
        }
        if (successTimer.current) clearTimeout(successTimer.current);
        successTimer.current = null;
        setSuccess(true);
        Animated.parallel([
          Animated.timing(successOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
          Animated.spring(successScale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
        ]).start();
        if (delayContinue) {
          successContinueTimer.current = setTimeout(() => {
            successContinueTimer.current = null;
            setSuccessContinueReady(true);
            Animated.timing(successContinueOpacity, { toValue: 1, duration: 520, useNativeDriver: true }).start();
          }, 3000);
        }
      };

      if (!wasCompleted && shouldShowCompletionInterstitial(level)) {
        showInterstitialAdThen(() => {
          successTimer.current = setTimeout(revealSuccess, 220);
        });
      } else {
        successTimer.current = setTimeout(revealSuccess, 460);
      }
    },
    [completedLevels, hintTokens, layerTokens, level, levelData.size, levelMoves, levelTimeLimit, maybePromptForReview, playEffect, showInterstitialAdThen, successContinueOpacity, successOpacity, successScale, t, timeExpired, unlockedLayer, vibrateEffect],
  );

  const handleDragStart = useCallback(
    (id) => {
      if (timeExpired) return;
      if (undoLocked || placementFlight) return;
      const piece = levelData.pieces.find((item) => item.id === id);
      if (piece?.placed && piece.lockedHint) {
        showTransientNotice(t.msgHintPieceLocked);
      }
      dragStartPositions.current[id] = positions[id];
      setIsDraggingPiece(true);
      setLevelData((current) => ({
        ...current,
        pieces: current.pieces.map((piece) => ({ ...piece, active: piece.id === id })),
      }));
    },
    [levelData.pieces, placementFlight, positions, showTransientNotice, t, timeExpired, undoLocked],
  );

  const handleDragMove = useCallback((id, position) => {
    setPositions((current) => ({ ...current, [id]: position }));
  }, []);

  const handleDragEnd = useCallback(
    (id, position) => {
      if (timeExpired) return true;
      if (undoLocked || placementFlight) return true;
      const piece = levelData.pieces.find((item) => item.id === id);
      if (!piece || !boardLayout) {
        setIsDraggingPiece(false);
        return true;
      }

      if (piece.lockedHint && piece.placed) {
        const lockedPosition = {
          x: boardLayout.x + piece.col * cellSize,
          y: boardLayout.y + piece.row * cellSize,
        };
        setLevelData((current) => ({
          ...current,
          pieces: current.pieces.map((item) => ({ ...item, active: false })),
        }));
        setPositions((current) => ({ ...current, [id]: lockedPosition }));
        setIsDraggingPiece(false);
        playEffect('wrong');
        setMessage(t.msgHintPieceLocked);
        showTransientNotice(t.msgHintPieceLocked);
        return { snapTo: lockedPosition };
      }

      const wasPlaced = piece.placed;
      const previousPosition = dragStartPositions.current[id] || positions[id];
      const bounds = getPieceBounds(piece);
      const dragCellSize = wasPlaced || piece.active ? cellSize : trayCellSize;
      const pieceWidth = bounds.width * dragCellSize;
      const pieceHeight = bounds.height * dragCellSize;
      const pieceCenterX = position.x + pieceWidth / 2;
      const pieceCenterY = position.y + pieceHeight / 2;
      const col = Math.round((pieceCenterX - boardLayout.x) / cellSize - bounds.width / 2);
      const row = Math.round((pieceCenterY - boardLayout.y) / cellSize - bounds.height / 2);
      const boardRight = boardLayout.x + boardLayout.width;
      const boardBottom = boardLayout.y + boardLayout.height;
      const touchesBoard =
        pieceCenterX >= boardLayout.x &&
        pieceCenterX <= boardRight &&
        pieceCenterY >= boardLayout.y &&
        pieceCenterY <= boardBottom;

      if (!touchesBoard && wasPlaced) {
        pushHistory(id);
        const pieces = levelData.pieces.map((item) =>
          item.id === id ? { ...item, placed: false, row: null, col: null, active: false } : { ...item, active: false },
        );
        const unplaced = pieces.filter((item) => !item.placed);
        const pages = createTrayPages(unplaced, trayCellSize, trayInnerWidth, trayInnerHeight);
        const foundPage = pages.findIndex((page) => page.some((item) => item.id === id));
        const targetPage = foundPage >= 0 ? foundPage : 0;
        const arrangedPositions = arrangeTray(pieces, positions, targetPage);
        const traySnap = arrangedPositions[id] || previousPosition || positions[id];
        setLevelData((current) => ({ ...current, pieces }));
        setPiecePage(targetPage);
        setPositions({ ...arrangedPositions, [id]: traySnap });
        setIsDraggingPiece(false);
        setMessage(t.msgPieceReturned);
        return traySnap ? { snapTo: traySnap } : true;
      }

      if (touchesBoard && isPlacementValid(piece, row, col)) {
        pushHistory(id);
        const nextMoveCount = levelMoves + 1;
        const snapped = { x: boardLayout.x + col * cellSize, y: boardLayout.y + row * cellSize };
        const flightPiece = { ...piece, active: true };
        const placedPieces = levelData.pieces.map((item) =>
          item.id === id
            ? {
                ...item,
                placed: true,
                row,
                col,
                active: false,
                pulseKey: Date.now(),
              }
            : { ...item, active: false },
        );
        const arrangedAfterPlacement = { ...arrangeTray(placedPieces, positions), [id]: snapped };
        placementFlightAnim.setValue(0);
        setPlacementFlight({
          piece: flightPiece,
          from: position,
          to: snapped,
          fromCellSize: dragCellSize,
          toCellSize: cellSize,
        });
        setLevelData((current) => ({
          ...current,
          pieces: current.pieces.map((item) => ({ ...item, active: false })),
        }));
        setIsDraggingPiece(false);
        setMessage(t.msgPiecePlaced);
        playEffect('place');
        Animated.timing(placementFlightAnim, { toValue: 1, duration: 70, useNativeDriver: true }).start(() => {
          setPlacementFlight(null);
          setLevelData((current) => ({ ...current, pieces: placedPieces }));
          setPositions(arrangedAfterPlacement);
          setLevelMoves(nextMoveCount);
          checkComplete(placedPieces, nextMoveCount);
        });
        return false;
      }

      setLevelData((current) => ({
        ...current,
        pieces: current.pieces.map((item) => ({ ...item, active: false })),
      }));
      if (previousPosition) {
        setPositions((current) => ({ ...current, [id]: previousPosition }));
      }
      setIsDraggingPiece(false);
      playEffect('wrong');
      setMessage(t.msgWrongDrop);
      return previousPosition ? { snapTo: previousPosition } : true;
    },
    [arrangeTray, boardLayout, cellSize, checkComplete, isPlacementValid, levelData.pieces, levelData.size, levelMoves, placementFlight, placementFlightAnim, playEffect, positions, pushHistory, showTransientNotice, t, timeExpired, trayCellSize, trayInnerHeight, trayInnerWidth, undoLocked],
  );

  const continueRewardToMap = useCallback((doubleReward = false) => {
    if (!success) return;
    if (rewardDoubling) return;
    const proceed = () => {
      const completedLevel = level;
      const nextLevel = level + 1;
      const completedLayer = getLayerNumber(completedLevel);
      const nextLayer = getLayerNumber(nextLevel);
      const extraLayerReward = doubleReward && !rewardDoubled && (earnedRewards.hint > 0 || earnedRewards.layer > 0) ? earnedRewards.layer : 0;
      const availableLayerTokens = layerTokens + extraLayerReward;
      const nextLayerGateCost = nextLevel <= TOTAL_LEVELS && nextLayer > completedLayer ? getLayerCost(nextLayer) : null;
      const intro = nextLevel <= TOTAL_LEVELS && (!nextLayerGateCost || nextLayer <= unlockedLayer) ? getProgressIntro(completedLevel, nextLevel, t) : null;
      const runTransition = () => {
        clearTimeout(mapRevealTimer.current);
        clearTimeout(mapAutoStartTimer.current);
        setSuccess(false);

        if (nextLayerGateCost && availableLayerTokens < nextLayerGateCost) {
          setLevelsOpen(true);
          setRecentCompletedLevel(completedLevel);
          setRecentUnlockedLevel(null);
          setMapInteractionLocked(false);
          showInsufficientFunds('layer', nextLayerGateCost, availableLayerTokens);
          return;
        }

        if (intro) {
          if (!nextLayerGateCost && nextLayer > completedLayer) {
            setUnlockedLevel((current) => Math.max(current, nextLevel));
            setUnlockedLayer((current) => Math.max(current, nextLayer));
          }
          setLevelsOpen(false);
          setRecentCompletedLevel(null);
          setRecentUnlockedLevel(null);
          setMapInteractionLocked(false);
          setProgressIntro(intro);
          return;
        }

        setLevelsOpen(true);
        setRecentCompletedLevel(completedLevel);
        setRecentUnlockedLevel(null);
        setMapInteractionLocked(true);

        mapRevealTimer.current = setTimeout(() => {
          if (nextLevel <= TOTAL_LEVELS && getLayerNumber(nextLevel) === completedLayer) {
            setUnlockedLevel((current) => Math.max(current, nextLevel));
            setUnlockedLayer((current) => Math.max(current, getLayerNumber(nextLevel)));
            setRecentUnlockedLevel(nextLevel);
            startLevel(nextLevel, t.msgNewLevelOpened, false);
            mapAutoStartTimer.current = setTimeout(() => {
              setLevelsOpen(false);
              setRecentCompletedLevel(null);
              setRecentUnlockedLevel(null);
              setMapInteractionLocked(false);
              setMessage(t.msgLevelStarted(nextLevel));
            }, 780);
            return;
          }
          setMapInteractionLocked(false);
        }, 950);
      };

      runTransition();
    };

    if (doubleReward && !rewardDoubled && (earnedRewards.hint > 0 || earnedRewards.layer > 0)) {
      rewardCountAnim.stopAnimation();
      setHintTokens((tokens) => tokens + earnedRewards.hint);
      setLayerTokens((tokens) => tokens + earnedRewards.layer);
      setRewardDoubled(true);
      setRewardDoubling(true);
      playEffect('coin');
      Animated.timing(rewardCountAnim, { toValue: 2, duration: 720, useNativeDriver: false }).start(() => {
        setRewardDoubling(false);
        proceed();
      });
      return;
    }

    proceed();
  }, [earnedRewards, layerTokens, level, playEffect, rewardCountAnim, rewardDoubled, rewardDoubling, showInsufficientFunds, startLevel, success, t, unlockedLayer]);

  const watchAdForDoubleReward = useCallback(() => {
    if (level < REWARD_START_LEVEL || rewardDoubled || rewardDoubling || rewardAdLoading || (earnedRewards.hint <= 0 && earnedRewards.layer <= 0)) {
      return;
    }
    if (!rewardedAdsAvailable) {
      setMessage(t.adUnavailable);
      return;
    }

    setRewardAdLoading(true);
    showRewardedAdThen(
      () => {
        setRewardAdLoading(false);
        continueRewardToMap(true);
      },
      () => {
        setRewardAdLoading(false);
      },
    );
  }, [continueRewardToMap, earnedRewards, level, rewardAdLoading, rewardDoubled, rewardDoubling, rewardedAdsAvailable, showRewardedAdThen, t]);

  const continueProgressIntro = useCallback(() => {
    if (!progressIntro) return;
    const nextLevel = progressIntro.level;
    setProgressIntro(null);
    setUnlockedLevel((current) => Math.max(current, nextLevel));
    setUnlockedLayer((current) => Math.max(current, getLayerNumber(nextLevel)));
    startLevel(nextLevel, t.msgLevelStarted(nextLevel), false);
    setMessage(t.msgLevelStarted(nextLevel));
  }, [progressIntro, startLevel, t]);

  const undoLastMove = useCallback(() => {
    if (timeExpired) return;
    if (undoFlight || undoLocked) return;
    if (history.length === 0) {
      setMessage(t.msgNoUndo);
      return;
    }
    setUndoLocked(true);

    const currentPieceById = new Map(levelData.pieces.map((piece) => [piece.id, piece]));
    let returningPiece = null;
    let historyIndex = -1;
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const movedPieceId = history[index]?.movedPieceId;
      const piece = movedPieceId ? currentPieceById.get(movedPieceId) : null;
      if (piece?.placed && !piece.lockedHint) {
        returningPiece = piece;
        historyIndex = index;
        break;
      }
    }

    if (!returningPiece) {
      setMessage(t.msgNoUndo);
      setHistory([]);
      setTimeout(() => setUndoLocked(false), 180);
      return;
    }

    const undoLevelData = {
      ...levelData,
      pieces: levelData.pieces.map((piece) =>
        piece.id === returningPiece.id
          ? { ...piece, placed: false, row: null, col: null, active: false }
          : { ...piece, active: false },
      ),
    };

    const finishUndo = (nextPositions) => {
      setLevelData(undoLevelData);
      setPositions(nextPositions);
      setHistory((items) => items.slice(0, Math.max(0, historyIndex)));
      setMessage(t.msgUndo);
      setTimeout(() => setUndoLocked(false), 140);
    };

    const unplacedPieces = undoLevelData.pieces.filter((piece) => !piece.placed);
    const pages = createTrayPages(unplacedPieces, trayCellSize, trayInnerWidth, trayInnerHeight);
    const targetPage = Math.max(0, pages.findIndex((page) => page.some((piece) => piece.id === returningPiece.id)));
    const baseTrayPositions = {};
    levelData.pieces.forEach((piece) => {
      if (piece.placed) return;
      if (positions[piece.id]) baseTrayPositions[piece.id] = positions[piece.id];
    });
    const nextPositions = arrangeTray(undoLevelData.pieces, baseTrayPositions, targetPage);
    const targetPosition = nextPositions[returningPiece.id];

    if (!targetPosition) {
      finishUndo(arrangeTray(undoLevelData.pieces, positions, targetPage));
      return;
    }

    const bounds = getPieceBounds(returningPiece);
    const from =
      positions[returningPiece.id] ||
      (boardLayout && returningPiece.row !== null && returningPiece.col !== null
        ? { x: boardLayout.x + returningPiece.col * cellSize, y: boardLayout.y + returningPiece.row * cellSize }
        : targetPosition);
    const scale = Math.max(0.2, trayCellSize / cellSize);
    undoFlightAnim.setValue(0);
    setPiecePage(targetPage);
    setUndoFlight({
      piece: { ...returningPiece, active: true },
      from,
      to: targetPosition,
      scale,
      width: bounds.width * cellSize,
      height: bounds.height * cellSize,
    });

    Animated.timing(undoFlightAnim, { toValue: 1, duration: 360, useNativeDriver: true }).start(() => {
      setUndoFlight(null);
      finishUndo(nextPositions);
    });
  }, [arrangeTray, boardLayout, cellSize, history, levelData, positions, t, timeExpired, trayCellSize, trayInnerHeight, trayInnerWidth, undoFlight, undoFlightAnim, undoLocked]);

  const showHint = useCallback((forcePaid = false) => {
    if (timeExpired) return;
    if (hintFlight) return;

    const candidate =
      levelData.pieces.find((piece) => !piece.placed && isPlacementValid(piece, piece.answer.row, piece.answer.col)) ||
      levelData.pieces.find((piece) => piece.placed && (piece.row !== piece.answer.row || piece.col !== piece.answer.col));

    if (!candidate || !boardLayout) {
      setMessage(t.msgNoHint);
      return;
    }

    const usePaidHint = freeHintsLeft <= 0;
    if (usePaidHint && hintTokens < HINT_COST) {
      showInsufficientFunds('hint', HINT_COST, hintTokens);
      return;
    }

    const placeHint = (paid) => {
      pushHistory(candidate.id);
      const nextMoveCount = levelMoves + 1;
      setLevelMoves(nextMoveCount);
      const targetPosition = {
        x: boardLayout.x + candidate.answer.col * cellSize,
        y: boardLayout.y + candidate.answer.row * cellSize,
      };
      const startPosition =
        positions[candidate.id] || {
          x: targetPosition.x,
          y: targetPosition.y + cellSize * 1.4,
        };

      const answerCells = getPieceCells(candidate, candidate.answer);
      const blockers = new Set();
      answerCells.forEach((cell) => {
        const blocker = occupiedCells.get(cell);
        if (blocker && blocker !== candidate.id) blockers.add(blocker);
      });

      hintFlightAnim.setValue(0);
      setHintFlight({
        piece: { ...candidate, placed: false, active: true, row: null, col: null },
        from: startPosition,
        to: targetPosition,
      });

      Animated.timing(hintFlightAnim, { toValue: 1, duration: 430, useNativeDriver: true }).start(() => {
        setHintFlight(null);
        setLevelData((current) => {
          const pieces = current.pieces.map((piece) => {
            if (blockers.has(piece.id)) {
              return { ...piece, placed: false, row: null, col: null, active: false };
            }
            if (piece.id === candidate.id) {
              return {
                ...piece,
                placed: true,
                row: piece.answer.row,
                col: piece.answer.col,
                lockedHint: true,
                active: false,
                pulseKey: Date.now(),
              };
            }
            return { ...piece, active: false };
          });

          const nextPositions = arrangeTray(pieces, positions);
          nextPositions[candidate.id] = targetPosition;
          setPositions(nextPositions);
          checkComplete(pieces, nextMoveCount);
          return { ...current, pieces };
        });

        if (paid) {
          setPaidHintConfirmed(true);
          setHintTokens((tokens) => Math.max(0, tokens - HINT_COST));
          setMessage(t.msgPaidHint(HINT_COST));
          return;
        }

        setFreeHintsLeft((count) => Math.max(0, count - 1));
        setMessage(t.msgFreeHint);
      });
    };

    if (usePaidHint && !paidHintConfirmed && !forcePaid) {
      setHintConfirmOpen(true);
      return;
    }

    placeHint(usePaidHint);
  }, [arrangeTray, boardLayout, cellSize, checkComplete, freeHintsLeft, hintFlight, hintFlightAnim, hintTokens, isPlacementValid, levelData.pieces, levelMoves, occupiedCells, paidHintConfirmed, positions, pushHistory, showInsufficientFunds, t, timeExpired]);

  const openLevels = useCallback(() => {
    playEffect('tap');
    setLevelsOpen(true);
  }, [playEffect]);

  const closeLevels = useCallback(() => {
    playEffect('tap');
    setLevelsOpen(false);
  }, [playEffect]);

  const openStore = useCallback(() => {
    playEffect('tap');
    setStoreOpen(true);
  }, [playEffect]);

  const closeStore = useCallback(() => {
    playEffect('tap');
    setStoreOpen(false);
  }, [playEffect]);

  const buyStorePackage = useCallback(async (type, pack) => {
    if (pack.id === 'puzzlegrid_remove_ads' && settings.adsRemoved) {
      setMessage(t === I18N.tr ? 'Reklamlar zaten kaldırıldı.' : 'Ads are already removed.');
      return;
    }
    if (!storeProductsById[pack.id]) {
      setMessage(t.storeUnavailable);
      return;
    }
    if (!STORE_PURCHASES_ENABLED) {
      setMessage(t.storeDisabledText);
      return;
    }
    if (!storeConnected) {
      setMessage(t.storeUnavailable);
      return;
    }
    try {
      playEffect('tap');
      setStorePurchasePendingId(pack.id);
      await requestStorePurchase({
        request: {
          apple: { sku: pack.id, quantity: 1 },
          google: { skus: [pack.id] },
        },
        type: 'in-app',
      });
    } catch (error) {
      setStorePurchasePendingId(null);
      setMessage(t.purchaseFailed(error?.message || error?.code || ''));
    }
  }, [playEffect, requestStorePurchase, storeConnected, storeProductsById, settings.adsRemoved, t]);

  const openSettings = useCallback(() => {
    playEffect('tap');
    setSettingsOpen(true);
  }, [playEffect]);

  const closeSettings = useCallback(() => {
    playEffect('tap');
    setSettingsOpen(false);
  }, [playEffect]);

  const updateSettings = useCallback((patch) => {
    setSettings((current) => ({ ...current, ...patch, ...(patch.language ? { languageSelected: true } : {}) }));
  }, []);

  const selectStartupLanguage = useCallback((language) => {
    setSettings((current) => ({ ...current, language }));
  }, []);

  const finishStartupLanguage = useCallback(() => {
    playEffect('tap');
    const nextSettings = { ...settings, languageSelected: true };
    setSettings(nextSettings);
    writeStorageText(SETTINGS_FILE, JSON.stringify(nextSettings)).catch((error) => {
      console.warn('Startup language save failed', error);
    });
  }, [playEffect, settings]);

  const restorePurchases = useCallback(() => {
    restoreStorePurchases?.().catch((error) => {
      console.warn('Restore purchases failed', error);
    });
    setMessage(t.msgRestore);
  }, [restoreStorePurchases, t]);

  const claimDailyReward = useCallback(() => {
    setHintTokens((tokens) => tokens + DAILY_REWARD.hint);
    setLayerTokens((tokens) => tokens + DAILY_REWARD.layer);
    setDailyRewardOpen(false);
    playEffect('coin');
    writeStorageText(DAILY_FILE, JSON.stringify({ lastClaim: getTodayKey() })).catch((error) => {
      console.warn('Daily save failed', error);
    });
    setMessage(`+${DAILY_REWARD.hint} ${t.hint}, +${DAILY_REWARD.layer} ${t.layer}`);
  }, [playEffect, t]);

  const openHome = useCallback(() => {
    playEffect('tap');
    setSuccess(false);
    setChapterIntroLevel(null);
    setLevelsOpen(false);
    setHomeIntroPlayed(false);
    setShowSplash(true);
  }, [playEffect]);

  const openLevelsFromSplash = useCallback(() => {
    if (!progressReady) return;
    playEffect('tap');
    setLevelsOpen(true);
  }, [playEffect, progressReady]);

  const unlockLayerFromMap = useCallback(
    (targetLayer) => {
      if (targetLayer <= unlockedLayer) return true;
      const targetLevel = getLayerStart(targetLayer);
      const gateCost = getLayerCost(targetLayer);

      if (!gateCost) {
        setUnlockedLayer((current) => Math.max(current, targetLayer));
        setUnlockedLevel((current) => Math.max(current, targetLevel));
        playEffect('unlock');
        return true;
      }

      if (layerTokens < gateCost) {
        showInsufficientFunds('layer', gateCost, layerTokens);
        return false;
      }

      setLayerTokens((tokens) => Math.max(0, tokens - gateCost));
      setUnlockedLayer((current) => Math.max(current, targetLayer));
      setUnlockedLevel((current) => Math.max(current, targetLevel));
      playEffect('unlock');
      setMessage(t.msgLayerUnlocked(gateCost));
      return true;
    },
    [layerTokens, playEffect, showInsufficientFunds, t, unlockedLayer],
  );

  const selectLevelFromMap = useCallback(
    (levelNumber) => {
      if (levelNumber > unlockedLevel) {
        const targetLayer = getLayerNumber(levelNumber);
        const layerStartLevel = getLayerStart(targetLayer);
        if (targetLayer > unlockedLayer && levelNumber === layerStartLevel) {
          if (!unlockLayerFromMap(targetLayer)) {
            return;
          }
        } else {
          setMessage(t.msgLevelLocked);
          setLevelsOpen(false);
          return;
        }
      }
      setShowSplash(false);
      setLevelsOpen(false);
      const selectedLayer = getLayerNumber(levelNumber);
      const selectedIntro = selectedLayer > 1 && levelNumber === getLayerStart(selectedLayer) ? getProgressIntro(levelNumber - 1, levelNumber, t) : null;
      if (selectedIntro && levelNumber >= level) {
        setProgressIntro(selectedIntro);
        return;
      }
      startLevel(levelNumber, t.msgLevelOpened(levelNumber), false);
      if (!onboardingSeen) {
        setTutorialPlayOpen(true);
      }
    },
    [layerTokens, level, onboardingSeen, startLevel, t, unlockLayerFromMap, unlockedLayer, unlockedLevel],
  );

  const openLayerFirstLevel = useCallback(
    (levelNumber) => {
      setShowSplash(false);
      setLevelsOpen(false);
      setRecentCompletedLevel(null);
      setRecentUnlockedLevel(null);
      setMapInteractionLocked(false);
      startLevel(levelNumber, t.msgLevelStarted(levelNumber), true);
      if (!onboardingSeen) {
        setTutorialPlayOpen(true);
      }
    },
    [onboardingSeen, startLevel, t],
  );


  const startGameFromSplash = useCallback(() => {
    if (!onboardingReady || !progressReady) return;
    playEffect('tap');
    if (!onboardingSeen) {
      setShowSplash(false);
      setTutorialPlayOpen(true);
      return;
    }
    startLevel(level, t.msgLevelStarted(level), true);
    setShowSplash(false);
  }, [level, onboardingReady, onboardingSeen, playEffect, progressReady, startLevel, t]);

  const finishTutorialPlay = useCallback(() => {
    setTutorialPlayOpen(false);
    setShowSplash(false);
    setOnboardingSeen(true);
    setChapterIntroLevel(level);
  }, [level]);

  const retryTimedLevel = useCallback(() => {
    playEffect('tap');
    startLevel(level, t.msgPlacePieces, false);
  }, [level, playEffect, startLevel, t]);

  const continueAfterTimeUp = useCallback(() => {
    if (timeExtensionAdLoading) return;
    playEffect('tap');
    setTimeExtensionAdLoading(true);
    showRewardedAdThen(
      () => {
        const extraSeconds = timeExtensionSeconds;
        timeLeftRef.current = extraSeconds;
        setTimeLeft(extraSeconds);
        setTimeExpired(false);
        setTimeExtensionAdLoading(false);
        setMessage(t.extraTimeGranted(extraSeconds));
      },
      () => {
        setTimeExtensionAdLoading(false);
      },
      {
        unavailable: t.extraTimeAdUnavailable,
        skipped: t.extraTimeAdSkipped,
        failed: t.extraTimeAdFailed,
      },
    );
  }, [playEffect, showRewardedAdThen, t, timeExtensionAdLoading, timeExtensionSeconds]);

  const statusStyle = themeKey === 'dark' ? 'light' : 'dark';
  const hintFlightBounds = hintFlight ? getPieceBounds(hintFlight.piece) : null;

  if (showSplash) {
    return (
      <>
        <SplashScreen
          theme={THEMES.minimal}
          animateIntro={!homeIntroPlayed}
          onIntroComplete={() => setHomeIntroPlayed(true)}
          onDone={startGameFromSplash}
          onLevels={openLevelsFromSplash}
          onStore={openStore}
          onRemoveAds={() => buyStorePackage('premium', STORE_PACKAGES.premium[0])}
          onSettings={openSettings}
          t={t}
        />
        <LanguageChoiceModal
          visible={languagePromptVisible}
          theme={THEMES.minimal}
          language={settings.language}
          onSelect={selectStartupLanguage}
          onContinue={finishStartupLanguage}
          t={t}
        />
        <LevelsMapModal
          visible={levelsOpen}
          theme={theme}
          level={level}
          completedLevels={completedLevels}
          levelStars={levelStars}
          latestStarResult={latestStarResult}
          unlockedLevel={unlockedLevel}
          unlockedLayer={unlockedLayer}
          layerTokens={layerTokens}
          recentCompletedLevel={recentCompletedLevel}
          recentUnlockedLevel={recentUnlockedLevel}
          interactionLocked={mapInteractionLocked}
          insufficientFunds={insufficientFunds}
          storeVisible={storeOpen}
          storeProductsById={storeProductsById}
          storePurchasePendingId={storePurchasePendingId}
          onCloseInsufficientFunds={closeInsufficientFunds}
          onStoreFromInsufficient={openStoreFromInsufficient}
          onCloseStore={closeStore}
          onBuyStore={buyStorePackage}
          onClose={closeLevels}
          onSelectLevel={selectLevelFromMap}
          onUnlockLayer={unlockLayerFromMap}
          onOpenLayerFirstLevel={openLayerFirstLevel}
          t={t}
        />
        <InsufficientFundsModal visible={!!insufficientFunds && !levelsOpen} theme={theme} info={insufficientFunds} onClose={closeInsufficientFunds} onStore={openStoreFromInsufficient} t={t} />
        <StoreModal visible={storeOpen && !levelsOpen} theme={theme} productsById={storeProductsById} purchasingId={storePurchasePendingId} onClose={closeStore} onBuy={buyStorePackage} t={t} />
        <UpdatePromptModal visible={!!updatePrompt} theme={THEMES.minimal} version={updatePrompt?.version} onLater={closeUpdatePrompt} onUpdate={openUpdatePrompt} t={t} />
        <SettingsModal visible={settingsOpen} theme={THEMES.minimal} settings={settings} onChange={updateSettings} onClose={closeSettings} onRestore={restorePurchases} t={t} />
      </>
    );
  }

  if (tutorialPlayOpen) {
    return <TutorialPlayScreen theme={theme} onDone={finishTutorialPlay} t={t} />;
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
      <StatusBar style={statusStyle} />
      <View
        style={styles.fixedRoot}
        onLayout={(event) => {
          const nextHeight = Math.round(event.nativeEvent.layout.height);
          if (nextHeight > 0 && Math.abs(nextHeight - gameViewportHeight) > 2) {
            setGameViewportHeight(nextHeight);
          }
        }}
      >
        <Animated.View
            style={[
              styles.screen,
              {
                height: layoutHeight,
                minHeight: layoutHeight,
                paddingTop: gameTopPadding,
                paddingBottom: trayPanelHeight + trayBottomOffset + 16,
                opacity: levelEnterOpacity,
              },
            ]}
            ref={rootRef}
          onLayout={() => {
            requestAnimationFrame(measureBoard);
            requestAnimationFrame(measureTray);
          }}
        >
          <View style={styles.rewardBar}>
            <View style={styles.rewardPillsGroup}>
              <View style={[styles.rewardPill, { backgroundColor: theme.card, borderColor: theme.line }]}>
                <Image source={GAME_ART.coins.hint} style={styles.rewardIcon} resizeMode="contain" />
                <Text style={[styles.rewardValue, { color: theme.text }]}>{hintTokens}</Text>
              </View>
              <View style={[styles.rewardPill, { backgroundColor: theme.card, borderColor: theme.line }]}>
                <Image source={GAME_ART.coins.layer} style={styles.rewardIcon} resizeMode="contain" />
                <Text style={[styles.rewardValue, { color: theme.text }]}>{layerTokens}</Text>
              </View>
              <Pressable style={({ pressed }) => [styles.storeMiniButton, styles.pressableFeedback, { backgroundColor: theme.button, borderColor: theme.button, opacity: pressed ? 0.76 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] }]} onPress={openStore}>
                <Image source={GAME_ART.coins.hint} style={styles.storeMiniIcon} resizeMode="contain" />
                <Image source={GAME_ART.coins.layer} style={[styles.storeMiniIcon, styles.storeMiniIconOverlap]} resizeMode="contain" />
                <Text style={[styles.storeMiniPlus, { color: theme.buttonText }]}>+</Text>
              </Pressable>
            </View>
            <View style={[styles.topLevelBadge, { backgroundColor: theme.card, borderColor: theme.line }]}> 
              <Text style={[styles.topLevelBadgeLabel, { color: theme.muted }]}>{t.levelLabel}</Text>
              <Text style={[styles.topLevelBadgeValue, { color: theme.text }]}>{level}</Text>
            </View>
          </View>

          <View style={styles.header}>
            {isModernLevel ? (
              <>
                <Pressable style={({ pressed }) => [styles.homeButton, styles.pressableFeedback, { backgroundColor: theme.soft, borderColor: theme.line, opacity: pressed ? 0.72 : 1, transform: [{ scale: pressed ? 0.94 : 1 }] }]} onPress={openHome}>
                  <Image source={UI_ICONS.home} style={styles.headerIconButtonImage} resizeMode="contain" />
                </Pressable>
                <View style={styles.headerCenter}>
                  <Animated.View
                    style={[
                      styles.activeTimerPanel,
                      timeCritical && styles.activeTimerPanelCritical,
                      { transform: [{ scale: timerPulseScale }] },
                    ]}
                  >
                    <View style={styles.activeTimerTopRow}>
                      <ClockGlyph color={timerActiveColor} size={16} />
                      <Text style={styles.activeTimerText}>{timeText}</Text>
                    </View>
                    <SegmentedTimerBar progress={timeProgress} activeColor={timerActiveColor} />
                  </Animated.View>
                </View>
                <View style={styles.headerRightActions}>
                  <Pressable style={({ pressed }) => [styles.settingsButton, styles.pressableFeedback, { backgroundColor: theme.soft, borderColor: theme.line, opacity: pressed ? 0.76 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] }]} onPress={openSettings}>
                    <Image source={UI_ICONS.settings} style={styles.headerIconButtonImage} resizeMode="contain" />
                  </Pressable>
                  <Pressable style={({ pressed }) => [styles.primaryButton, styles.pressableFeedback, { backgroundColor: theme.soft, borderColor: theme.line, opacity: pressed ? 0.76 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] }]} onPress={openLevels}>
                    <Image source={UI_ICONS.levels} style={styles.headerIconButtonImage} resizeMode="contain" />
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <View>
                  <Text style={[styles.eyebrow, { color: theme.muted }]}>Puzzle Grid</Text>
                  <Text style={[styles.title, { color: theme.text }]}>{t.levelLabel} {level}</Text>
                  <Text style={[styles.version, { color: theme.muted }]}>Expo mobil v1</Text>
                  <View style={[styles.timerPillLegacy, { backgroundColor: theme.card, borderColor: timeUrgent ? theme.accent : theme.line }]}>
                    <Text style={[styles.timerText, { color: timeUrgent ? theme.accent : theme.text }]}>{timeText}</Text>
                    <View style={[styles.timerTrack, { backgroundColor: theme.soft }]}>
                      <View style={[styles.timerFill, { backgroundColor: timeUrgent ? theme.accent : theme.button, width: `${timeProgress * 100}%` }]} />
                    </View>
                  </View>
                </View>
                <View style={styles.headerRightActions}>
                  <Pressable style={({ pressed }) => [styles.settingsButton, styles.pressableFeedback, { backgroundColor: theme.soft, borderColor: theme.line, opacity: pressed ? 0.76 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] }]} onPress={openSettings}>
                    <Image source={UI_ICONS.settings} style={styles.headerIconButtonImage} resizeMode="contain" />
                  </Pressable>
                  <Pressable style={({ pressed }) => [styles.primaryButton, styles.pressableFeedback, { backgroundColor: theme.soft, borderColor: theme.line, opacity: pressed ? 0.76 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] }]} onPress={openLevels}>
                    <Image source={UI_ICONS.levels} style={styles.headerIconButtonImage} resizeMode="contain" />
                  </Pressable>
                </View>
              </>
            )}
          </View>

          <View style={styles.boardArea}>
          <View
            style={[
              styles.board,
              {
                width: cellSize * levelData.size,
                height: cellSize * levelData.size,
                backgroundColor: theme.soft,
                borderColor: theme.line,
              },
            ]}
            ref={boardRef}
            onLayout={measureBoard}
          >
            {Array.from({ length: levelData.size * levelData.size }).map((_, index) => (
              <View
                key={index}
                style={[
                  styles.boardCell,
                  {
                    width: cellSize,
                    height: cellSize,
                    left: (index % levelData.size) * cellSize,
                    top: Math.floor(index / levelData.size) * cellSize,
                    backgroundColor: theme.cell,
                    borderColor: theme.line,
                  },
                ]}
              />
            ))}
          </View>
          </View>

          <View style={styles.toolbarFloating}>
            <Pressable disabled={timeExpired} style={({ pressed }) => [styles.toolButton, { backgroundColor: theme.soft, borderColor: theme.line, opacity: timeExpired ? 0.45 : pressed ? 0.72 : 1 }]} onPress={() => showHint()}>
              <Image source={UI_ICONS.hint} style={styles.toolButtonImage} resizeMode="contain" />
              <View style={[styles.toolButtonBadge, { backgroundColor: theme.button, borderColor: theme.card }]}>
                <Text style={[styles.toolButtonBadgeText, { color: theme.buttonText }]}>{freeHintsLeft > 0 ? freeHintsLeft : HINT_COST}</Text>
                {freeHintsLeft <= 0 ? <Image source={GAME_ART.coins.hint} style={styles.hintCostBadgeIcon} resizeMode="contain" /> : null}
              </View>
            </Pressable>
            <Pressable disabled={undoLocked || timeExpired} style={({ pressed }) => [styles.toolButton, { backgroundColor: theme.soft, borderColor: theme.line, opacity: undoLocked || timeExpired ? 0.45 : pressed ? 0.72 : 1 }]} onPress={undoLastMove}>
              <Image source={UI_ICONS.undo} style={styles.toolButtonImage} resizeMode="contain" />
            </Pressable>
          </View>

          <View
            style={[
              styles.trayPanel,
              {
                backgroundColor: theme.card,
                borderColor: theme.line,
                bottom: trayBottomOffset,
                height: trayPanelHeight,
              },
            ]}
            ref={trayRef}
            onLayout={() => {
              requestAnimationFrame(measureTray);
            }}
          >
            <View style={styles.trayHeader}>
              <View>
                <Text style={[styles.trayTitle, { color: theme.text }]}>{t.pieces}</Text>
                <Text style={[styles.trayHint, { color: theme.muted }]}>{t.trayHint}</Text>
              </View>
              {trayPageCount > 1 ? (
                <View style={styles.trayPager}>
                  <Pressable
                    disabled={piecePage === 0}
                    style={[
                      styles.trayPageButton,
                      { borderColor: theme.line, opacity: piecePage === 0 ? 0.35 : 1 },
                    ]}
                    onPress={() => {
                      setPiecePage((page) => Math.max(0, page - 1));
                    }}
                  >
                    <Text style={[styles.trayPageText, { color: theme.text }]}>{'<'}</Text>
                  </Pressable>
                  <Text style={[styles.trayPageLabel, { color: theme.muted }]}>
                    {piecePage + 1}/{trayPageCount}
                  </Text>
                  <Pressable
                    disabled={piecePage >= trayPageCount - 1}
                    style={[
                      styles.trayPageButton,
                      { borderColor: theme.line, opacity: piecePage >= trayPageCount - 1 ? 0.35 : 1 },
                    ]}
                    onPress={() => {
                      setPiecePage((page) => Math.min(trayPageCount - 1, page + 1));
                    }}
                  >
                    <Text style={[styles.trayPageText, { color: theme.text }]}>{'>'}</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
            {isModernLevel ? (
              <View style={styles.trayFooter}>
                <Pressable
                  disabled={undoLocked}
                  style={({ pressed }) => [styles.trayFooterButton, styles.pressableFeedback, { backgroundColor: theme.soft, borderColor: theme.line, opacity: undoLocked ? 0.45 : pressed ? 0.7 : 1, transform: [{ scale: pressed && !undoLocked ? 0.94 : 1 }] }]}
                  onPress={undoLastMove}
                >
                  <Image source={UI_ICONS.undo} style={styles.trayFooterButtonImage} resizeMode="contain" />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.trayFooterButton, styles.pressableFeedback, { backgroundColor: theme.soft, borderColor: theme.line, opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.94 : 1 }] }]}
                  onPress={() => showHint()}
                >
                  <Image source={UI_ICONS.hint} style={styles.trayFooterButtonImage} resizeMode="contain" />
                  <View style={[styles.trayFooterBadge, { backgroundColor: theme.button, borderColor: theme.card }]}>
                    <Text style={[styles.trayFooterBadgeText, { color: theme.buttonText }]}>{freeHintsLeft > 0 ? freeHintsLeft : HINT_COST}</Text>
                    {freeHintsLeft <= 0 ? <Image source={GAME_ART.coins.hint} style={styles.hintCostBadgeIcon} resizeMode="contain" /> : null}
                  </View>
                </Pressable>
              </View>
            ) : null}
          </View>

          {levelData.pieces.map((piece) => {
            const position = positions[piece.id];
            if (placementFlight?.piece.id === piece.id) return null;
            if (hintFlight?.piece.id === piece.id) return null;
            if (undoFlight?.piece.id === piece.id) return null;
            const visible = piece.placed || piece.active || visibleTrayIds.has(piece.id);
            if (!visible) return null;
            if (!position) return null;
            return (
              <Piece
                key={piece.id}
                piece={piece}
                position={position}
                cellSize={piece.placed || piece.active ? cellSize : trayCellSize}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
              />
            );
          })}

          {transientNotice ? (
            <View
              pointerEvents="none"
              style={[
                styles.transientNotice,
                {
                  backgroundColor: theme.button,
                  bottom: trayBottomOffset + trayPanelHeight + 10,
                },
              ]}
            >
              <Text style={[styles.transientNoticeText, { color: theme.buttonText }]}>{transientNotice}</Text>
            </View>
          ) : null}

          {placementFlight ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.hintFlightPiece,
                {
                  left: placementFlight.from.x,
                  top: placementFlight.from.y,
                  width: getPieceBounds(placementFlight.piece).width * placementFlight.fromCellSize,
                  height: getPieceBounds(placementFlight.piece).height * placementFlight.fromCellSize,
                  transform: [
                    {
                      translateX: placementFlightAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [
                          0,
                          placementFlight.to.x - placementFlight.from.x - (getPieceBounds(placementFlight.piece).width * placementFlight.fromCellSize * (1 - placementFlight.toCellSize / placementFlight.fromCellSize)) / 2,
                        ],
                      }),
                    },
                    {
                      translateY: placementFlightAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [
                          0,
                          placementFlight.to.y - placementFlight.from.y - (getPieceBounds(placementFlight.piece).height * placementFlight.fromCellSize * (1 - placementFlight.toCellSize / placementFlight.fromCellSize)) / 2,
                        ],
                      }),
                    },
                    {
                      scale: placementFlightAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, placementFlight.toCellSize / placementFlight.fromCellSize],
                      }),
                    },
                  ],
                },
              ]}
            >
              {placementFlight.piece.cells.map((cell) => (
                <View
                  key={`placement-flight-${placementFlight.piece.id}-${cell.row}-${cell.col}`}
                  style={[
                    styles.pieceCell,
                    {
                      width: placementFlight.fromCellSize,
                      height: placementFlight.fromCellSize,
                      left: cell.col * placementFlight.fromCellSize,
                      top: cell.row * placementFlight.fromCellSize,
                      backgroundColor: placementFlight.piece.color,
                      borderColor: 'rgba(32,29,29,0.28)',
                      borderRadius: 6,
                    },
                  ]}
                />
              ))}
            </Animated.View>
          ) : null}

          {hintFlight && hintFlightBounds ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.hintFlightPiece,
                {
                  left: hintFlight.from.x,
                  top: hintFlight.from.y,
                  width: hintFlightBounds.width * cellSize,
                  height: hintFlightBounds.height * cellSize,
                  transform: [
                    {
                      translateX: hintFlightAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, hintFlight.to.x - hintFlight.from.x],
                      }),
                    },
                    {
                      translateY: hintFlightAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, hintFlight.to.y - hintFlight.from.y],
                      }),
                    },
                    {
                      scale: hintFlightAnim.interpolate({
                        inputRange: [0, 0.65, 1],
                        outputRange: [1, 1.06, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              {hintFlight.piece.cells.map((cell) => (
                <View
                  key={`hint-flight-${hintFlight.piece.id}-${cell.row}-${cell.col}`}
                  style={[
                    styles.pieceCell,
                    {
                      width: cellSize,
                      height: cellSize,
                      left: cell.col * cellSize,
                      top: cell.row * cellSize,
                      backgroundColor: hintFlight.piece.color,
                      borderColor: 'rgba(32,29,29,0.28)',
                      borderRadius: 6,
                    },
                  ]}
                />
              ))}
            </Animated.View>
          ) : null}

          {undoFlight ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.hintFlightPiece,
                {
                  left: undoFlight.from.x,
                  top: undoFlight.from.y,
                  width: undoFlight.width,
                  height: undoFlight.height,
                  transform: [
                    {
                      translateX: undoFlightAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [
                          0,
                          undoFlight.to.x - undoFlight.from.x - (undoFlight.width * (1 - undoFlight.scale)) / 2,
                        ],
                      }),
                    },
                    {
                      translateY: undoFlightAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [
                          0,
                          undoFlight.to.y - undoFlight.from.y - (undoFlight.height * (1 - undoFlight.scale)) / 2,
                        ],
                      }),
                    },
                    {
                      scale: undoFlightAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, undoFlight.scale],
                      }),
                    },
                  ],
                },
              ]}
            >
              {undoFlight.piece.cells.map((cell) => (
                <View
                  key={`undo-flight-${undoFlight.piece.id}-${cell.row}-${cell.col}`}
                  style={[
                    styles.pieceCell,
                    {
                      width: cellSize,
                      height: cellSize,
                      left: cell.col * cellSize,
                      top: cell.row * cellSize,
                      backgroundColor: undoFlight.piece.color,
                      borderColor: 'rgba(32,29,29,0.28)',
                      borderRadius: 6,
                    },
                  ]}
                />
              ))}
            </Animated.View>
          ) : null}

          {timeExpired ? (
            <TimeUpOverlay
              theme={theme}
              extensionSeconds={timeExtensionSeconds}
              loading={timeExtensionAdLoading}
              onContinue={continueAfterTimeUp}
              onRestart={retryTimedLevel}
              t={t}
            />
          ) : null}

          {success ? (
            <Animated.View style={[styles.successOverlay, { opacity: successOpacity }]}>
              <Animated.View
                style={[
                  styles.successCard,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.line,
                    transform: [{ scale: successScale }],
                  },
                ]}
              >
                <View style={[styles.successBadge, { backgroundColor: '#34C759' }]}>
                  <Text style={styles.successBadgeText}>{'\u2713'}</Text>
                </View>
                <Text style={[styles.successTitle, { color: theme.text }]}>{t.successTitle}</Text>
                <View style={styles.successStars} accessibilityLabel={`${completedStars} / 3`}>
                  {[1, 2, 3].map((star, index) => {
                    const anim = successStarAnims[index];
                    return (
                      <Animated.Image
                        key={star}
                        source={star <= completedStars ? GAME_ART.stars.filled : GAME_ART.stars.empty}
                        style={[
                          styles.successStarIcon,
                          {
                            opacity: anim,
                            transform: [
                              {
                                scale: anim.interpolate({
                                  inputRange: [0, 0.72, 1],
                                  outputRange: [0.42, 1.18, 1],
                                }),
                              },
                              {
                                translateY: anim.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [8, 0],
                                }),
                              },
                            ],
                          },
                        ]}
                        resizeMode="contain"
                      />
                    );
                  })}
                </View>
                <Text style={[styles.successText, { color: theme.muted }]}>{t.successMoves(formatTime(completedMoveCount))}</Text>
                <Text style={[styles.successTargetText, { color: theme.muted }]}>{t.bestMoves(formatTime(completedOptimalMoves))}</Text>
                <Text style={[styles.successSmallText, { color: theme.muted }]}>
                  {successWasCompleted
                    ? t.completedBefore
                    : level < REWARD_START_LEVEL
                      ? t.noRewardFirst10
                      : t.rewardsAdded}
                </Text>
                <View style={styles.successRewardRow}>
                  <View style={[styles.successRewardPill, { backgroundColor: theme.soft, borderColor: theme.line }]}>
                    <Image source={GAME_ART.coins.hint} style={styles.successRewardIcon} resizeMode="contain" />
                    <View>
                      <Text style={[styles.successRewardLabel, { color: theme.muted }]}>{t.hint}</Text>
                      <Text style={[styles.successRewardText, { color: theme.text }]}>{displayRewardBalances.hint}</Text>
                      <Text style={[styles.successRewardGain, { color: theme.accent }]}>+{displayRewards.hint}</Text>
                    </View>
                  </View>
                  <View style={[styles.successRewardPill, { backgroundColor: theme.soft, borderColor: theme.line }]}>
                    <Image source={GAME_ART.coins.layer} style={styles.successRewardIcon} resizeMode="contain" />
                    <View>
                      <Text style={[styles.successRewardLabel, { color: theme.muted }]}>{t.layer}</Text>
                      <Text style={[styles.successRewardText, { color: theme.text }]}>{displayRewardBalances.layer}</Text>
                      <Text style={[styles.successRewardGain, { color: theme.accent }]}>+{displayRewards.layer}</Text>
                    </View>
                  </View>
                </View>
                {successDoubleOfferActive ? (
                  <Pressable
                    disabled={!rewardedAdsAvailable || rewardDoubled || rewardDoubling || rewardAdLoading || (earnedRewards.hint <= 0 && earnedRewards.layer <= 0)}
                    style={({ pressed }) => [
                      styles.adRewardButton,
                      {
                        borderColor: theme.line,
                        opacity: !rewardedAdsAvailable || rewardDoubled || rewardDoubling || rewardAdLoading || (earnedRewards.hint <= 0 && earnedRewards.layer <= 0) ? 0.48 : pressed ? 0.76 : 1,
                        transform: [{ scale: pressed && rewardedAdsAvailable && !rewardDoubled && !rewardDoubling && !rewardAdLoading ? 0.97 : 1 }],
                      },
                    ]}
                    onPress={watchAdForDoubleReward}
                  >
                    <Text style={[styles.adRewardText, { color: '#201D1D' }]}>
                      {!rewardedAdsAvailable
                        ? t.adNotReadyShort
                        : rewardAdLoading
                        ? t.adLoading
                        : rewardDoubling
                        ? t.doubleCounting
                        : rewardDoubled
                        ? t.doubleTaken
                        : t.doubleWin}
                    </Text>
                  </Pressable>
                ) : null}
                <View style={[styles.successProgress, { backgroundColor: theme.soft }]}>
                  <View style={[styles.successProgressFill, { backgroundColor: theme.accent }]} />
                </View>
                <Animated.View
                  pointerEvents={successDoubleOfferActive && !successContinueReady ? 'none' : 'auto'}
                  style={[styles.successContinueWrap, { opacity: successDoubleOfferActive ? successContinueOpacity : 1 }]}
                >
                  <Pressable
                    disabled={rewardDoubling || (successDoubleOfferActive && !successContinueReady)}
                    style={({ pressed }) => [
                      styles.successButton,
                      styles.pressableFeedback,
                      {
                        backgroundColor: theme.button,
                        opacity: rewardDoubling ? 0.5 : pressed ? 0.78 : 1,
                        transform: [{ scale: pressed && !rewardDoubling ? 0.97 : 1 }],
                      },
                    ]}
                    onPress={() => continueRewardToMap(false)}
                  >
                    <Text style={[styles.successButtonText, { color: theme.buttonText }]}>{t.continue}</Text>
                  </Pressable>
                </Animated.View>
              </Animated.View>
            </Animated.View>
          ) : null}
          {progressIntro ? <ProgressIntroOverlay theme={theme} intro={progressIntro} onContinue={continueProgressIntro} t={t} /> : null}
          {hintConfirmOpen ? (
            <View style={styles.hintConfirmOverlay}>
              <View style={[styles.hintConfirmCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
                <View style={[styles.hintConfirmIconWrap, { backgroundColor: theme.soft, borderColor: theme.line }]}>
                  <Image source={GAME_ART.coins.hint} style={styles.hintConfirmIcon} resizeMode="contain" />
                </View>
                <Text style={[styles.hintConfirmTitle, { color: theme.text }]}>{t.hintQuestion}</Text>
                <Text style={[styles.hintConfirmText, { color: theme.muted }]}>{t.hintSpendText}</Text>
                <View style={[styles.hintConfirmCost, { backgroundColor: theme.soft, borderColor: theme.line }]}>
                  <Text style={[styles.hintConfirmCostText, { color: theme.text }]}>3</Text>
                  <Image source={GAME_ART.coins.hint} style={styles.hintConfirmCostIcon} resizeMode="contain" />
                </View>
                <View style={styles.hintConfirmActions}>
                  <Pressable
                    style={({ pressed }) => [styles.hintConfirmButton, { backgroundColor: theme.soft, borderColor: theme.line, opacity: pressed ? 0.76 : 1 }]}
                    onPress={() => setHintConfirmOpen(false)}
                  >
                    <Text style={[styles.hintConfirmButtonText, { color: theme.text }]}>{t.cancel}</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.hintConfirmButton, styles.hintConfirmButtonPrimary, { backgroundColor: theme.button, borderColor: theme.button, opacity: pressed ? 0.78 : 1 }]}
                    onPress={() => {
                      setHintConfirmOpen(false);
                      showHint(true);
                    }}
                  >
                    <Text style={[styles.hintConfirmButtonText, { color: theme.buttonText }]}>{t.use}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}
          {chapterIntroLevel ? (
            <ChapterIntro
              theme={theme}
              level={chapterIntroLevel}
              timeLimit={levelTimeLimit}
              onDone={() => setChapterIntroLevel(null)}
              onBack={() => { setChapterIntroLevel(null); openLevels(); }}
              t={t}
            />
          ) : null}
        </Animated.View>
      </View>
      <LevelsMapModal
        visible={levelsOpen}
        theme={theme}
          level={level}
          completedLevels={completedLevels}
          levelStars={levelStars}
          latestStarResult={latestStarResult}
          unlockedLevel={unlockedLevel}
          unlockedLayer={unlockedLayer}
        layerTokens={layerTokens}
          recentCompletedLevel={recentCompletedLevel}
          recentUnlockedLevel={recentUnlockedLevel}
        interactionLocked={mapInteractionLocked}
        insufficientFunds={insufficientFunds}
        storeVisible={storeOpen}
        storeProductsById={storeProductsById}
        storePurchasePendingId={storePurchasePendingId}
        onCloseInsufficientFunds={closeInsufficientFunds}
        onStoreFromInsufficient={openStoreFromInsufficient}
        onCloseStore={closeStore}
        onBuyStore={buyStorePackage}
        onClose={closeLevels}
        onSelectLevel={selectLevelFromMap}
        onUnlockLayer={unlockLayerFromMap}
        onOpenLayerFirstLevel={openLayerFirstLevel}
        t={t}
      />
      <SettingsModal visible={settingsOpen} theme={theme} settings={settings} onChange={updateSettings} onClose={closeSettings} onRestore={restorePurchases} t={t} />
      <InsufficientFundsModal visible={!!insufficientFunds && !levelsOpen} theme={theme} info={insufficientFunds} onClose={closeInsufficientFunds} onStore={openStoreFromInsufficient} t={t} />
      <StoreModal visible={storeOpen && !levelsOpen} theme={theme} productsById={storeProductsById} purchasingId={storePurchasePendingId} onClose={closeStore} onBuy={buyStorePackage} t={t} />
      <UpdatePromptModal visible={!!updatePrompt} theme={theme} version={updatePrompt?.version} onLater={closeUpdatePrompt} onUpdate={openUpdatePrompt} t={t} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  promptOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(32,29,29,0.36)',
  },
  promptCard: {
    width: '100%',
    maxWidth: 390,
    borderWidth: 1,
    borderRadius: 26,
    padding: 22,
    alignItems: 'center',
    shadowColor: '#201D1D',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  promptIconBubble: {
    width: 62,
    height: 62,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  promptIconText: {
    fontSize: 34,
    fontWeight: '900',
  },
  promptTitle: {
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 8,
  },
  promptText: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 18,
  },
  promptActions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  promptButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  promptButtonPrimary: {
    shadowColor: '#201D1D',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  promptButtonText: {
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  fixedRoot: {
    flex: 1,
    overflow: 'hidden',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 28,
  },
  screen: {
    flexGrow: 1,
    paddingHorizontal: BOARD_PADDING,
    paddingTop: 28,
    position: 'relative',
  },
  rewardBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    minHeight: 46,
    width: '100%',
  },
  rewardPillsGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  topLevelBadge: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    minWidth: 58,
    paddingHorizontal: 7,
  },
  topLevelBadgeLabel: {
    fontSize: 9,
    fontWeight: '900',
    lineHeight: 11,
  },
  topLevelBadgeValue: {
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
    lineHeight: 18,
  },
  settingsOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(32,29,29,0.36)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    padding: 18,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  languagePromptOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(32,29,29,0.32)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    padding: 20,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  languagePromptCard: {
    borderRadius: 24,
    borderWidth: 2,
    maxWidth: 380,
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.16,
    shadowRadius: 22,
    width: '100%',
  },
  languagePromptTitle: {
    fontSize: 25,
    fontWeight: '900',
    textAlign: 'center',
  },
  languagePromptText: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
    marginTop: 8,
    textAlign: 'center',
  },
  languagePromptOptions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  languagePromptOption: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  languagePromptOptionText: {
    fontSize: 15,
    fontWeight: '900',
  },
  languagePromptContinue: {
    alignItems: 'center',
    borderRadius: 16,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 50,
  },
  languagePromptContinueText: {
    fontSize: 16,
    fontWeight: '900',
  },
  insufficientOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(32,29,29,0.36)',
    bottom: 0,
    elevation: 80,
    justifyContent: 'center',
    left: 0,
    padding: 24,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 80,
  },
  insufficientCard: {
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 2,
    maxWidth: 340,
    padding: 22,
    width: '100%',
  },
  insufficientIconWrap: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  insufficientIcon: {
    height: 38,
    width: 38,
  },
  insufficientTitle: {
    fontSize: 22,
    fontWeight: '900',
    marginTop: 12,
    textAlign: 'center',
  },
  insufficientText: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    marginTop: 8,
    textAlign: 'center',
  },
  insufficientActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
    width: '100%',
  },
  insufficientButton: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  insufficientButtonText: {
    fontSize: 14,
    fontWeight: '900',
  },
  settingsCard: {
    borderRadius: 24,
    borderWidth: 2,
    maxWidth: 420,
    padding: 18,
    width: '100%',
  },
  settingsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  settingsTitle: {
    fontSize: 26,
    fontWeight: '900',
  },
  settingsSubtitle: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  settingsCloseButton: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  settingsCloseText: {
    fontSize: 16,
    fontWeight: '900',
  },
  settingsRow: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  settingsRowText: {
    flex: 1,
    paddingRight: 12,
  },
  settingsLabel: {
    fontSize: 15,
    fontWeight: '900',
  },
  settingsDescription: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    marginTop: 2,
  },
  settingsToggle: {
    borderRadius: 999,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    paddingHorizontal: 3,
    width: 52,
  },
  settingsToggleDot: {
    borderRadius: 999,
    height: 20,
    width: 20,
  },
  settingsToggleDotOn: {
    alignSelf: 'flex-end',
  },
  settingsSectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    marginTop: 14,
  },
  languageRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  languageButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 11,
  },
  languageButtonText: {
    fontSize: 13,
    fontWeight: '900',
  },
  restoreButton: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 16,
    paddingVertical: 12,
  },
  restoreButtonText: {
    fontSize: 13,
    fontWeight: '900',
  },
  legalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 14,
  },
  legalLink: {
    fontSize: 11,
    fontWeight: '800',
  },
  legalDivider: {
    fontSize: 12,
    fontWeight: '900',
    marginHorizontal: 8,
  },
  dailyOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(32,29,29,0.36)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    padding: 24,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  dailyCard: {
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 2,
    maxWidth: 340,
    padding: 22,
    width: '100%',
  },
  dailyKicker: {
    fontSize: 12,
    fontWeight: '900',
  },
  dailyTitle: {
    fontSize: 24,
    fontWeight: '900',
    marginTop: 4,
    textAlign: 'center',
  },
  dailyRewardsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  dailyRewardPill: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  dailyRewardIcon: {
    height: 28,
    width: 28,
  },
  dailyRewardText: {
    fontSize: 18,
    fontWeight: '900',
  },
  dailyText: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    marginTop: 14,
    textAlign: 'center',
  },
  dailyClaimButton: {
    alignItems: 'center',
    borderRadius: 15,
    height: 52,
    justifyContent: 'center',
    marginTop: 18,
    width: '100%',
  },
  dailyClaimText: {
    fontSize: 16,
    fontWeight: '900',
  },
  storeMiniButton: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 5,
    width: 52,
  },
  storeMiniIconPair: {
    flexDirection: 'row',
  },
  storeMiniIcon: {
    height: 19,
    width: 19,
  },
  storeMiniIconOverlap: {
    marginLeft: -9,
  },
  storeMiniPlus: {
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 18,
    marginLeft: 2,
  },
  storeMiniButtonText: {
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 15,
  },
  storeOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(32,29,29,0.36)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    padding: 18,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  storeCard: {
    borderRadius: 24,
    borderWidth: 2,
    maxHeight: '86%',
    maxWidth: 420,
    padding: 18,
    width: '100%',
  },
  storeHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  storeTitle: {
    fontSize: 26,
    fontWeight: '900',
  },
  storeSubtitle: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  storeCloseButton: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  storeCloseText: {
    fontSize: 16,
    fontWeight: '900',
  },
  storeScrollContent: {
    paddingBottom: 8,
  },
  storeDisabledText: {
    borderRadius: 14,
    borderWidth: 1,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlign: 'center',
  },
  storeSection: {
    gap: 8,
    marginBottom: 16,
  },
  storeSectionTitle: {
    fontSize: 17,
    fontWeight: '900',
  },
  storePackage: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
  storeBestBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 7,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  storePackageTop: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  storePackageIcon: {
    height: 38,
    marginRight: 10,
    width: 38,
  },
  storePackageTextWrap: {
    flex: 1,
  },
  storePackageTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  storePackageSubtitle: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  storePackagePrice: {
    fontSize: 18,
    fontWeight: '900',
    marginTop: 9,
    textAlign: 'right',
  },
  storeLegalText: {
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
    textAlign: 'center',
  },  rewardPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,253,248,0.92)',
    borderColor: 'rgba(139,105,66,0.24)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    minWidth: 64,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  rewardText: {
    fontSize: 12,
    fontWeight: '900',
  },
  rewardIcon: {
    height: 22,
    width: 22,
  },
  rewardCoin: {
    borderRadius: 999,
    borderWidth: 2,
    height: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 4,
    width: 18,
  },
  rewardCoinGold: {
    backgroundColor: '#FFD55A',
    borderColor: '#E6A825',
  },
  rewardCoinBronze: {
    backgroundColor: '#B87333',
    borderColor: '#8D5524',
  },
  rewardValue: {
    fontSize: 12,
    fontWeight: '900',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 62,
    marginBottom: 2,
  },
  headerCenter: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 6,
  },
  headerTools: {
    flexDirection: 'row',
    gap: 8,
  },
  homeButton: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  headerRightActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  settingsButton: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    height: 54,
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingVertical: 0,
    width: 54,
  },
  settingsButtonText: {
    fontSize: 12,
    fontWeight: '900',
  },  headerIconButtonImage: {
    height: 26,
    width: 26,
  },
  homeButtonText: {
    fontSize: 13,
    fontWeight: '900',
  },
  backButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  backButtonText: {
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 26,
  },
  hintButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  hintButtonText: {
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 22,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  title: {
    color: '#3B2B1D',
    fontSize: 25,
    fontWeight: '900',
    lineHeight: 29,
    textShadowColor: 'rgba(255,255,255,0.72)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  timerPill: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 4,
    minWidth: 86,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  timerPillLegacy: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 5,
    minWidth: 86,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  timerText: {
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 15,
  },
  timerTrack: {
    borderRadius: 999,
    height: 4,
    marginTop: 3,
    overflow: 'hidden',
    width: 66,
  },
  timerFill: {
    borderRadius: 999,
    height: 4,
  },
  activeTimerPanel: {
    alignSelf: 'center',
    backgroundColor: '#252326',
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 10,
    borderWidth: 1,
    maxWidth: 142,
    minWidth: 96,
    paddingHorizontal: 9,
    paddingVertical: 5,
    width: '100%',
  },
  activeTimerPanelCritical: {
    borderColor: 'rgba(242,101,90,0.68)',
  },
  activeTimerTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
  },
  activeTimerText: {
    color: '#FFF9F0',
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
    lineHeight: 19,
  },
  segmentedTimerBar: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 4,
    width: '100%',
  },
  segmentedTimerCell: {
    borderRadius: 2,
    flex: 1,
    height: 3,
  },
  clockGlyph: {
    borderWidth: 2,
    position: 'relative',
  },
  clockHandHour: {
    borderRadius: 2,
    height: 6,
    left: '50%',
    marginLeft: -1,
    position: 'absolute',
    top: 4,
    width: 2,
  },
  clockHandMinute: {
    borderRadius: 2,
    height: 2,
    left: '50%',
    position: 'absolute',
    top: '50%',
    width: 6,
  },
  clockCenter: {
    borderRadius: 2,
    height: 4,
    left: '50%',
    marginLeft: -2,
    marginTop: -2,
    position: 'absolute',
    top: '50%',
    width: 4,
  },
  version: {
    fontSize: 11,
    fontWeight: '800',
    marginTop: 3,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    height: 54,
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingVertical: 0,
    width: 54,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '900',
  },
  modernActionRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginTop: 8,
  },
  actionChip: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 104,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  actionChipText: {
    fontSize: 13,
    fontWeight: '900',
  },
  infoText: {
    borderRadius: 999,
    borderWidth: 1,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 5,
    overflow: 'hidden',
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  message: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  nextLevelRow: {
    display: 'none',
  },
  nextLevelControl: {
    alignItems: 'center',
  },
  nextLevelCostBadge: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    marginLeft: 2,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  nextLevelCostCoin: {
    borderWidth: 1,
    height: 12,
    width: 12,
  },
  nextLevelCostIcon: {
    height: 15,
    width: 15,
  },
  nextLevelCostText: {
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 13,
  },
  nextLevelButton: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    height: 44,
    justifyContent: 'center',
    minWidth: 72,
    paddingHorizontal: 6,
  },
  nextLevelButtonImage: {
    height: 22,
    marginRight: 2,
    width: 22,
  },
  nextLevelButtonText: {
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 16,
  },
  nextLevelButtonArrow: {
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 20,
  },
  pressableFeedback: {
  },
  boardArea: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 8,
    paddingTop: 8,
  },
  board: {
    alignSelf: 'center',
    backgroundColor: 'rgba(238,219,184,0.94)',
    borderColor: 'rgba(124,91,48,0.22)',
    borderRadius: 18,
    borderWidth: 0,
    elevation: 7,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
  },
  boardCell: {
    borderRadius: 6,
    borderWidth: 0,
    position: 'absolute',
  },
  toolbarFloating: {
    alignItems: 'center',
    bottom: 12,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    left: BOARD_PADDING,
    position: 'absolute',
    right: BOARD_PADDING,
    zIndex: 35,
    display: 'none',
  },
  toolButton: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    position: 'relative',
    width: 56,
  },
  toolButtonImage: {
    height: 26,
    width: 26,
  },
  toolButtonBadge: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 2,
    minWidth: 22,
    paddingHorizontal: 5,
    paddingVertical: 2,
    position: 'absolute',
    right: -7,
    top: -7,
  },
  hintCostBadgeIcon: {
    height: 13,
    marginLeft: 2,
    width: 13,
  },  toolButtonBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 13,
    lineHeight: 12,
  },
  toolText: {
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 24,
  },
  trayPanel: {
    backgroundColor: 'rgba(255,253,248,0.94)',
    borderColor: 'rgba(139,105,66,0.22)',
    borderRadius: 24,
    borderWidth: 2,
    bottom: 24,
    elevation: 8,
    left: BOARD_PADDING,
    minHeight: 172,
    paddingBottom: 22,
    paddingHorizontal: 12,
    paddingTop: 10,
    position: 'absolute',
    right: BOARD_PADDING,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    zIndex: 10,
  },
  trayHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 38,
  },
  trayFooter: {
    bottom: 12,
    flexDirection: 'row',
    gap: 10,
    left: 12,
    position: 'absolute',
    right: 12,
  },
  trayFooterButton: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    height: 54,
    justifyContent: 'center',
    position: 'relative',
  },
  trayFooterButtonImage: {
    height: 26,
    width: 26,
  },
  trayFooterBadge: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 2,
    minWidth: 24,
    paddingHorizontal: 6,
    paddingVertical: 2,
    position: 'absolute',
    right: 12,
    top: 7,
  },
  trayFooterBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 13,
    lineHeight: 12,
  },
  transientNotice: {
    alignSelf: 'center',
    borderRadius: 999,
    elevation: 12,
    maxWidth: '86%',
    paddingHorizontal: 14,
    paddingVertical: 8,
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    zIndex: 70,
  },
  transientNoticeText: {
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 16,
    textAlign: 'center',
  },
  trayFooterText: {
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 24,
  },
  trayTitle: {
    fontSize: 17,
    fontWeight: '900',
  },
  trayHint: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  trayPager: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  trayPageButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  trayPageText: {
    fontSize: 18,
    fontWeight: '900',
  },
  trayPageLabel: {
    fontSize: 12,
    fontWeight: '900',
    minWidth: 28,
    textAlign: 'center',
  },
  piece: {
    position: 'absolute',
  },
  hintFlightPiece: {
    elevation: 18,
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    zIndex: 70,
  },
  pieceCell: {
    borderColor: 'rgba(32,29,29,0.24)',
    borderRadius: 6,
    borderWidth: 1,
    elevation: 3,
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
  },
  progressIntroOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(32,29,29,0.34)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    paddingHorizontal: 26,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 145,
  },
  progressIntroCard: {
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 2,
    elevation: 12,
    maxWidth: 340,
    paddingHorizontal: 22,
    paddingVertical: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    width: '100%',
  },
  progressIntroBadge: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 72,
    justifyContent: 'center',
    marginBottom: 12,
    width: 72,
  },
  progressIntroBadgeText: {
    fontSize: 20,
    fontWeight: '900',
  },
  progressIntroTitle: {
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  progressIntroText: {
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
  progressIntroButton: {
    alignItems: 'center',
    borderRadius: 15,
    height: 52,
    justifyContent: 'center',
    marginTop: 20,
    width: '100%',
  },
  progressIntroButtonText: {
    fontSize: 16,
    fontWeight: '900',
  },
  hintConfirmOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(32,29,29,0.32)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    paddingHorizontal: 26,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 150,
  },
  hintConfirmCard: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    maxWidth: 330,
    padding: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    width: '100%',
  },
  hintConfirmIconWrap: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 58,
    justifyContent: 'center',
    marginBottom: 10,
    width: 58,
  },
  hintConfirmIcon: {
    height: 34,
    width: 34,
  },
  hintConfirmTitle: {
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  hintConfirmText: {
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    marginTop: 6,
    textAlign: 'center',
  },
  hintConfirmCost: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  hintConfirmCostText: {
    fontSize: 16,
    fontWeight: '900',
  },
  hintConfirmCostIcon: {
    height: 22,
    width: 22,
  },
  hintConfirmActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    width: '100%',
  },
  hintConfirmButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
  },
  hintConfirmButtonPrimary: {
  },
  hintConfirmButtonText: {
    fontSize: 13,
    fontWeight: '900',
  },
  timeUpOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(32,29,29,0.34)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    paddingHorizontal: 22,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 88,
  },
  timeUpCard: {
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 2,
    maxWidth: 360,
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 22,
    width: '100%',
  },
  timeUpBadge: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 58,
    justifyContent: 'center',
    marginBottom: 12,
    paddingHorizontal: 18,
  },
  timeUpBadgeText: {
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 26,
  },
  timeUpTitle: {
    fontSize: 25,
    fontWeight: '900',
    textAlign: 'center',
  },
  timeUpText: {
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
  timeUpActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
    width: '100%',
  },
  timeUpButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 10,
  },
  timeUpButtonPrimary: {
    shadowColor: '#201D1D',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  timeUpButtonText: {
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  timeUpAdButtonRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
  },
  timeUpExtraTime: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
    lineHeight: 14,
    marginTop: 2,
  },
  successOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(32,29,29,0.28)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 90,
  },
  successCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,253,248,0.98)',
    borderColor: 'rgba(139,105,66,0.2)',
    borderRadius: 24,
    borderWidth: 2,
    elevation: 10,
    maxWidth: 380,
    padding: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 22,
    width: '88%',
  },
  successBadge: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    marginBottom: 10,
    width: 40,
  },
  successBadgeText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  successStars: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 43,
  },
  successStarIcon: {
    height: 42,
    width: 42,
  },
  successText: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 7,
    textAlign: 'center',
  },
  successTargetText: {
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 15,
    textAlign: 'center',
  },
  successSmallText: {
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
    textAlign: 'center',
  },
  successRewardRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  successRewardPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,253,248,0.94)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    minWidth: 86,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  successRewardIcon: {
    height: 28,
    width: 28,
  },
  successRewardText: {
    fontSize: 18,
    fontWeight: '900',
  },
  successRewardGain: {
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 12,
  },
  successRewardLabel: {
    fontSize: 9,
    fontWeight: '900',
    lineHeight: 11,
  },
  adRewardButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,246,219,0.96)',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 12,
    height: 54,
    paddingHorizontal: 16,
    paddingVertical: 0,
    justifyContent: 'center',
    width: '100%',
  },
  adRewardText: {
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 18,
    textAlign: 'center',
  },
  successProgress: {
    borderRadius: 999,
    height: 7,
    marginTop: 14,
    overflow: 'hidden',
    width: '100%',
  },
  successProgressFill: {
    borderRadius: 999,
    height: 7,
    width: '72%',
  },
  successButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 8,
    height: 54,
    justifyContent: 'center',
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 0,
    width: '100%',
  },
  successContinueWrap: {
    alignSelf: 'stretch',
    width: '100%',
  },
  successButtonIcon: {
    height: 26,
    width: 26,
  },
  successButtonText: {
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 19,
    textAlign: 'center',
  },
  onboardingOverlay: {
    backgroundColor: 'rgba(32,29,29,0.38)',
    bottom: 0,
    left: 0,
    paddingHorizontal: 22,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 95,
  },
  onboardingTarget: {
    borderRadius: 18,
    borderWidth: 3,
    height: 62,
    position: 'absolute',
    width: 62,
  },
  onboardingMarker: {
    alignItems: 'center',
    height: 34,
    justifyContent: 'center',
    position: 'absolute',
    width: 62,
  },
  onboardingMarkerBelow: {
    marginTop: 58,
  },
  onboardingMarkerAbove: {
    marginTop: -34,
  },
  onboardingMarkerGlow: {
    borderRadius: 999,
    height: 28,
    opacity: 0.18,
    position: 'absolute',
    width: 28,
  },
  onboardingMarkerDot: {
    borderRadius: 999,
    borderWidth: 3,
    height: 16,
    width: 16,
  },
  onboardingMarkerLine: {
    borderRadius: 999,
    height: 3,
    marginTop: 6,
    opacity: 0.72,
    width: 30,
  },
  onboardingCoachCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    position: 'absolute',
    width: 230,
  },
  onboardingCoachCardCenter: {
    left: 24,
    position: 'absolute',
    right: 24,
    top: '42%',
  },
  onboardingCard: {
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 2,
    elevation: 12,
    padding: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    width: '100%',
    maxWidth: 330,
  },
  onboardingDemo: {
    alignItems: 'center',
    height: 170,
    justifyContent: 'center',
    marginBottom: 8,
    width: 230,
  },
  onboardingMiniBoard: {
    borderRadius: 18,
    borderWidth: 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
    height: 112,
    padding: 8,
    width: 112,
  },
  onboardingMiniCell: {
    borderRadius: 7,
    borderWidth: 1,
    height: 28,
    margin: 2,
    width: 28,
  },
  onboardingDemoPiece: {
    borderColor: 'rgba(255,255,255,0.62)',
    borderRadius: 9,
    borderWidth: 1,
    height: 32,
    position: 'absolute',
    width: 64,
  },
  onboardingHand: {
    alignItems: 'center',
    backgroundColor: '#FFFDF8',
    borderColor: '#DED4C4',
    borderRadius: 999,
    borderWidth: 2,
    height: 46,
    justifyContent: 'center',
    position: 'absolute',
    width: 46,
  },
  onboardingHandText: {
    color: '#201D1D',
    fontSize: 11,
    fontWeight: '900',
  },
  onboardingIconWrap: {
    alignItems: 'center',
    height: 130,
    justifyContent: 'center',
  },
  onboardingIcon: {
    height: 86,
    width: 86,
  },
  onboardingTitle: {
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  onboardingText: {
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
    marginTop: 6,
    textAlign: 'center',
  },
  onboardingDots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 14,
  },
  onboardingDot: {
    borderRadius: 999,
    height: 8,
    width: 8,
  },
  onboardingActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
    width: '100%',
  },
  onboardingSkip: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 12,
  },
  onboardingSkipText: {
    fontSize: 14,
    fontWeight: '900',
  },
  onboardingNext: {
    alignItems: 'center',
    borderRadius: 14,
    flex: 1.4,
    paddingVertical: 12,
  },
  onboardingNextFull: {
    flex: 1,
  },
  onboardingNextText: {
    fontSize: 14,
    fontWeight: '900',
  },
  levelsBackground: {
    flex: 1,
  },
  levelsBackdropTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(247,242,234,0.08)',
  },
  levelsSafe: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  levelsMapHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  mapHeaderTitleWrap: {
    alignItems: 'center',
    flex: 1,
  },
  levelsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  levelsTitle: {
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 30,
  },
  levelsSubtitle: {
    fontSize: 12,
    fontWeight: '900',
    marginTop: 3,
  },
  mapHeaderCoins: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  mapCoinPill: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    minHeight: 36,
    paddingHorizontal: 10,
  },
  mapCoinIcon: {
    height: 20,
    width: 20,
  },
  mapCoinText: {
    fontSize: 14,
    fontWeight: '900',
  },
  mapCloseButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 10,
    minWidth: 72,
  },
  mapEconomyPanel: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    minHeight: 70,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#201D1D',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
  },
  mapEconomyText: {
    fontSize: 15,
    fontWeight: '900',
  },
  mapEconomySub: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 3,
  },
  mapUnlockButton: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 12,
  },
  mapUnlockText: {
    fontSize: 12,
    fontWeight: '900',
  },
  mapLayerTabs: {
    alignItems: 'flex-start',
    gap: 8,
    paddingBottom: 8,
  },
  mapLayerTabsScroller: {
    flexGrow: 0,
    marginBottom: 12,
    minHeight: 74,
    maxHeight: 82,
  },
  mapLayerTab: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
    height: 66,
    justifyContent: 'center',
    width: 96,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  mapLayerTabText: {
    fontSize: 12,
    fontWeight: '900',
  },
  mapLayerCostBadge: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 3,
    marginTop: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  mapLayerCostIcon: {
    height: 12,
    width: 12,
  },
  mapLayerCostText: {
    fontSize: 9,
    fontWeight: '900',
    lineHeight: 11,
  },
  layerConfirmOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(32,29,29,0.28)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    paddingHorizontal: 24,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 30,
  },
  layerConfirmCard: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    maxWidth: 330,
    padding: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    width: '100%',
  },
  layerConfirmIconWrap: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 58,
    justifyContent: 'center',
    marginBottom: 10,
    width: 58,
  },
  layerConfirmIcon: {
    height: 34,
    width: 34,
  },
  layerConfirmTitle: {
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  layerConfirmText: {
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    marginTop: 6,
    textAlign: 'center',
  },
  layerConfirmCost: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    marginTop: 12,
    paddingHorizontal: 13,
    paddingVertical: 6,
  },
  layerConfirmCostText: {
    fontSize: 16,
    fontWeight: '900',
  },
  layerConfirmCostIcon: {
    height: 22,
    width: 22,
  },
  layerConfirmActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    width: '100%',
  },
  layerConfirmButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
  },
  layerConfirmButtonText: {
    fontSize: 13,
    fontWeight: '900',
  },
  layerCongratsOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(32,29,29,0.34)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    paddingHorizontal: 24,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 28,
  },
  layerCongratsPanel: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 22,
    borderWidth: 1,
    maxWidth: 340,
    minHeight: 250,
    paddingHorizontal: 20,
    paddingVertical: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    width: '100%',
  },
  layerCongratsIconWrap: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 70,
    justifyContent: 'center',
    marginBottom: 12,
    width: 70,
  },
  layerCongratsIcon: {
    height: 42,
    width: 42,
  },
  layerCongratsCheck: {
    fontSize: 38,
    fontWeight: '900',
    lineHeight: 42,
  },
  layerCongratsTextWrap: {
    alignItems: 'center',
    width: '100%',
  },
  layerCongratsBadge: {
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 4,
  },
  layerCongratsTitle: {
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  layerCongratsText: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 22,
    marginTop: 10,
    maxWidth: 280,
    textAlign: 'center',
  },
  layerCongratsSubText: {
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18,
    marginTop: 10,
    textAlign: 'center',
  },
  mapCircleButton: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  closeButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  closeText: {
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 16,
  },
  closeIconText: {
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 24,
  },
  mapStarText: {
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 20,
  },
  pageBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  pageButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 46,
  },
  pageButtonText: {
    fontSize: 22,
    fontWeight: '900',
  },
  pageTitle: {
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
    overflow: 'hidden',
    paddingVertical: 11,
    textAlign: 'center',
  },
  levelGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    paddingBottom: 120,
  },
  levelCard: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    height: 62,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingTop: 0,
    position: 'relative',
    width: '18.1%',
  },
  levelNumber: {
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 21,
  },
  levelStatus: {
    alignItems: 'center',
    borderRadius: 999,
    bottom: 4,
    justifyContent: 'center',
    minWidth: 38,
    paddingHorizontal: 5,
    paddingVertical: 2,
    position: 'absolute',
  },
  levelStatusText: {
    fontSize: 8,
    fontWeight: '900',
    lineHeight: 10,
  },
  completedBadge: {
    alignItems: 'center',
    borderRadius: 999,
    height: 18,
    justifyContent: 'center',
    position: 'absolute',
    right: 4,
    top: 4,
    width: 18,
  },
  completedBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 14,
  },
  levelMapContent: {
    paddingBottom: 120,
    paddingTop: 2,
  },
  levelMapList: {
    flex: 1,
    minHeight: 0,
  },
  levelMapRow: {
    columnGap: MAP_ROW_GAP,
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginBottom: MAP_ROW_GAP,
  },
  mapCard: {
    borderRadius: 8,
    borderWidth: 1,
    height: MAP_CARD_HEIGHT,
    justifyContent: 'space-between',
    overflow: 'hidden',
    padding: 10,
    flexGrow: 0,
    flexShrink: 0,
  },
  mapCardTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mapCardNumber: {
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 24,
  },
  mapMiniBoard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    height: 22,
    width: 22,
  },
  mapMiniTile: {
    borderRadius: 2,
    height: 10,
    width: 10,
  },
  mapCardMeta: {
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 14,
  },
  mapCardStars: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 2,
    justifyContent: 'center',
    minHeight: 22,
    paddingHorizontal: 4,
    width: 62,
  },
  mapCardStarIcon: {
    height: 16,
    width: 16,
  },
  mapDecorLayer: {
    bottom: 0,
    opacity: 0.22,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  mapBiome: {
    opacity: 0.68,
    position: 'absolute',
  },
  mapForestBiome: {
    backgroundColor: '#CFE7A9',
    borderRadius: 120,
    height: 310,
    left: -80,
    top: 40,
    width: 230,
  },
  mapDesertBiome: {
    backgroundColor: '#F2D39B',
    borderRadius: 130,
    height: 330,
    right: -95,
    top: 120,
    width: 250,
  },
  mapIceBiome: {
    backgroundColor: '#DDEEFF',
    borderRadius: 150,
    height: 360,
    right: -110,
    top: 430,
    width: 280,
  },
  mapLavaBiome: {
    backgroundColor: '#B99ACB',
    borderRadius: 150,
    height: 340,
    left: -120,
    top: 520,
    width: 270,
  },
  mapCloud: {
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 999,
    height: 70,
    position: 'absolute',
    width: 130,
  },
  mapCloudOne: {
    left: 18,
    top: 92,
  },
  mapCloudTwo: {
    right: 20,
    top: 28,
  },
  mapStep: {
    minHeight: 84,
    overflow: 'visible',
    position: 'relative',
  },
  mapStepBackground: {
    bottom: -1,
    left: -18,
    opacity: 0.72,
    position: 'absolute',
    right: -18,
    top: -1,
  },
  mapStepBackgroundImage: {
    opacity: 0.82,
  },
  mapStepBackgroundTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,253,248,0.18)',
  },
  mapWorldBadge: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,253,248,0.9)',
    borderColor: 'rgba(139,105,66,0.25)',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 2,
    paddingHorizontal: 12,
    paddingVertical: 4,
    zIndex: 3,
  },
  mapWorldBadgeText: {
    color: '#6B4A24',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 13,
  },
  mapLayerNav: {
    alignItems: 'center',
    gap: 10,
    paddingBottom: 16,
    paddingTop: 18,
  },
  mapLayerButton: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 18,
    paddingVertical: 10,
    width: '72%',
  },
  mapLayerButtonText: {
    fontSize: 13,
    fontWeight: '900',
  },
  mapLayerButtonPrimary: {
    backgroundColor: '#201D1D',
    borderColor: '#201D1D',
  },
  mapLayerButtonPrimaryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  mapTrail: {
    opacity: 0.75,
    position: 'absolute',
  },
  mapConnector: {
    borderRadius: 999,
    opacity: 0.5,
    position: 'absolute',
  },
  mapPathLayer: {
    height: 84,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 0,
  },
  mapRoadDot: {
    borderColor: 'rgba(255,255,255,0.42)',
    borderRadius: 999,
    borderWidth: 1,
    height: 34,
    marginLeft: -17,
    marginTop: -17,
    position: 'absolute',
    shadowColor: '#6B4A24',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 4,
    width: 34,
  },
  mapRoadImage: {
    height: 46,
    marginLeft: -23,
    marginTop: -23,
    position: 'absolute',
    width: 46,
  },
  mapDot: {
    borderRadius: 999,
    height: 4,
    marginLeft: -2,
    marginTop: -2,
    position: 'absolute',
    width: 4,
  },
  mapSparkImage: {
    height: 18,
    marginLeft: -9,
    marginTop: -9,
    position: 'absolute',
    width: 18,
  },
  mapNode: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 0,
    elevation: 4,
    height: 66,
    justifyContent: 'center',
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    top: 6,
    width: 66,
    zIndex: 4,
  },
  mapLaneLeft: {
    left: '18%',
    marginLeft: -33,
  },
  mapLaneMidLeft: {
    left: '38%',
    marginLeft: -33,
  },
  mapLaneCenter: {
    left: '34%',
    marginLeft: -33,
  },
  mapLaneMidRight: {
    left: '58%',
    marginLeft: -33,
  },
  mapLaneRight: {
    left: '70%',
    marginLeft: -33,
  },
  mapLaneLeftSoft: {
    left: '22%',
    marginLeft: -33,
  },
  mapGateNode: {
    height: 78,
    marginLeft: -39,
    top: 0,
    width: 78,
  },
  mapGateBadge: {
    alignItems: 'center',
    backgroundColor: '#FFFDF8',
    borderColor: '#C9933A',
    borderRadius: 999,
    borderWidth: 1,
    top: -18,
    justifyContent: 'center',
    minWidth: 44,
    paddingHorizontal: 5,
    paddingVertical: 2,
    position: 'absolute',
  },
  mapGateBadgeText: {
    color: '#6B4A24',
    fontSize: 9,
    fontWeight: '900',
  },
  mapNodeImage: {
    height: 76,
    position: 'absolute',
    width: 76,
  },
  mapNodeImageGate: {
    height: 96,
    position: 'absolute',
    width: 96,
  },
  mapNodeText: {
    fontSize: 14,
    fontWeight: '900',
    textShadowColor: 'rgba(255,255,255,0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  mapDoneMark: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 13,
    position: 'absolute',
    right: 10,
    top: 6,
  },
  mapActiveMark: {
    borderRadius: 999,
    borderWidth: 3,
    height: 66,
    position: 'absolute',
    width: 66,
  },
  heroBoard: {
    borderRadius: 22,
    borderWidth: 3,
    flexDirection: 'row',
    flexWrap: 'wrap',
    height: 180,
    padding: 12,
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    width: 180,
  },
  heroBoardCompact: {
    borderRadius: 18,
    height: 136,
    padding: 9,
    width: 136,
  },
  heroBoardCell: {
    borderRadius: 7,
    borderWidth: 1,
    height: 27,
    margin: 2,
    width: 27,
  },
  heroBoardCellCompact: {
    borderRadius: 5,
    height: 20,
    margin: 1.5,
    width: 20,
  },
  heroPiece: {
    borderRadius: 8,
    elevation: 7,
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },
  heroPieceOne: {
    height: 50,
    left: 26,
    top: 24,
    width: 25,
  },
  heroPieceOneCompact: {
    height: 36,
    left: 20,
    top: 18,
    width: 18,
  },
  heroPieceTwo: {
    height: 25,
    right: 25,
    top: 58,
    width: 55,
  },
  heroPieceTwoCompact: {
    height: 18,
    right: 19,
    top: 42,
    width: 40,
  },
  heroPieceThree: {
    bottom: 35,
    height: 50,
    left: 64,
    width: 50,
  },
  heroPieceThreeCompact: {
    bottom: 26,
    height: 36,
    left: 47,
    width: 36,
  },
  heroPieceFour: {
    bottom: 66,
    height: 25,
    right: 61,
    width: 25,
  },
  heroPieceFourCompact: {
    bottom: 49,
    height: 18,
    right: 45,
    width: 18,
  },
  chapterOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(247,242,234,0.72)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 80,
  },
  chapterCard: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    maxWidth: 360,
    paddingHorizontal: 22,
    paddingVertical: 22,
    width: '88%',
  },
  chapterTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    width: '100%',
  },
  miniPuzzleGlyph: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    height: 34,
    width: 34,
  },
  miniPuzzleCell: {
    borderRadius: 3,
    height: 16,
    width: 16,
  },
  chapterLevelLabel: {
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 22,
    marginLeft: 10,
  },
  chapterGridBadge: {
    alignItems: 'center',
    backgroundColor: '#F2655A',
    borderRadius: 9,
    justifyContent: 'center',
    minHeight: 32,
    minWidth: 54,
    paddingHorizontal: 10,
  },
  chapterGridBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  chapterDivider: {
    height: 1,
    marginBottom: 18,
    marginTop: 16,
    opacity: 0.72,
    width: '100%',
  },
  chapterKicker: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  chapterTitle: {
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 31,
    textAlign: 'center',
  },
  chapterTimerPanel: {
    backgroundColor: '#252326',
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 13,
    borderWidth: 1,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 13,
    width: '100%',
  },
  chapterTimerTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  chapterTimerCopy: {
    marginLeft: 11,
  },
  chapterTimerValue: {
    color: '#FFF9F0',
    fontSize: 29,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
    lineHeight: 32,
  },
  chapterTimerLabel: {
    color: 'rgba(255,249,240,0.62)',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  chapterText: {
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
    marginTop: 14,
    textAlign: 'center',
  },
  chapterSubText: {
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
    marginTop: 14,
    textAlign: 'center',
  },
  chapterStartButton: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 50,
    width: '100%',
  },
  chapterStartButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  playGlyph: {
    borderBottomColor: 'transparent',
    borderBottomWidth: 7,
    borderLeftWidth: 11,
    borderTopColor: 'transparent',
    borderTopWidth: 7,
    height: 0,
    width: 0,
  },
  videoGlyph: {
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1.5,
    height: 16,
    justifyContent: 'center',
    width: 22,
  },
  videoPlayGlyph: {
    borderBottomColor: 'transparent',
    borderBottomWidth: 4,
    borderLeftWidth: 6,
    borderTopColor: 'transparent',
    borderTopWidth: 4,
    height: 0,
    marginLeft: 2,
    width: 0,
  },
  splash: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 74,
  },
  splashLogo: {
    alignItems: 'center',
    paddingHorizontal: 26,
    width: '100%',
  },
  splashAnimatedLogo: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  splashMenu: {
    alignItems: 'center',
    marginTop: -10,
    paddingHorizontal: 26,
    width: '100%',
  },
  splashTitle: {
    fontSize: 36,
    fontWeight: '900',
    marginTop: 22,
  },
  splashText: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 5,
  },
  playButton: {
    alignItems: 'center',
    borderRadius: 16,
    justifyContent: 'center',
    marginTop: 22,
    paddingHorizontal: 42,
    paddingVertical: 14,
  },
  playButtonText: {
    fontSize: 18,
    fontWeight: '900',
  },
  playButtonHint: {
    fontSize: 11,
    fontWeight: '900',
    marginTop: 2,
    opacity: 0.78,
  },
  splashLevelsButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 14,
    paddingHorizontal: 34,
    paddingVertical: 13,
  },
  splashLevelsText: {
    fontSize: 16,
    fontWeight: '900',
  },
  splashBrandFooter: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    bottom: 24,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    position: 'absolute',
    shadowColor: '#201D1D',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  splashBrandLogo: {
    borderRadius: 8,
    height: 28,
    width: 28,
  },
  splashBrandText: {
    fontSize: 12,
    fontWeight: '900',
  },
  splashLoading: {
    borderRadius: 999,
    height: 8,
    marginTop: 20,
    overflow: 'hidden',
    width: 178,
  },
  splashLoadingFill: {
    borderRadius: 999,
    height: 8,
    width: '72%',
  },
  appIntro: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  appIntroLogoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIntroBoard: {
    borderRadius: 28,
    borderWidth: 3,
    height: 154,
    position: 'relative',
    shadowColor: '#201D1D',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    width: 154,
  },
  appIntroCell: {
    borderRadius: 6,
    borderWidth: 1,
    height: 21,
    position: 'absolute',
    width: 21,
  },
  appIntroPiece: {
    borderColor: 'rgba(32,29,29,0.16)',
    borderRadius: 10,
    borderWidth: 1,
    elevation: 8,
    position: 'absolute',
    shadowColor: '#201D1D',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
  },
  appIntroPieceOne: {
    height: 46,
    left: 14,
    top: 14,
    width: 72,
  },
  appIntroPieceTwo: {
    height: 46,
    left: 64,
    top: 64,
    width: 72,
  },
  appIntroPieceThree: {
    height: 72,
    left: 14,
    top: 64,
    width: 46,
  },
  appIntroPieceFour: {
    height: 46,
    left: 90,
    top: 14,
    width: 46,
  },
  appIntroTitleWrap: {
    alignItems: 'center',
    marginTop: 30,
  },
  appIntroTitle: {
    fontSize: 29,
    fontWeight: '900',
    letterSpacing: 0,
  },
  appIntroProgress: {
    borderRadius: 999,
    height: 6,
    marginTop: 14,
    overflow: 'hidden',
    width: 132,
  },
  appIntroProgressFill: {
    borderRadius: 999,
    height: 6,
    width: '100%',
  },
  tutorialScreen: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 44,
  },
  tutorialTitle: {
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
  },
  tutorialSubtitle: {
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
    marginTop: 6,
    textAlign: 'center',
  },
  tutorialStage: {
    alignSelf: 'center',
    height: 512,
    marginTop: 18,
    position: 'relative',
    width: 300,
  },
  tutorialBoard: {
    borderRadius: 18,
    borderWidth: 0,
    elevation: 1,
    overflow: 'hidden',
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    zIndex: 1,
  },
  tutorialCell: {
    borderRadius: 6,
    borderWidth: 0,
    height: 52,
    position: 'absolute',
    width: 52,
  },
  tutorialPieceWide: {
    elevation: 20,
    height: 52,
    position: 'absolute',
    width: 104,
    zIndex: 30,
  },
  tutorialDomino: {
    position: 'relative',
    zIndex: 31,
  },
  tutorialDominoCell: {
    borderColor: 'rgba(32,29,29,0.28)',
  },
  tutorialTray: {
    borderRadius: 24,
    borderWidth: 2,
    elevation: 2,
    height: 148,
    left: 10,
    paddingHorizontal: 14,
    position: 'absolute',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    top: 334,
    width: 280,
    zIndex: 2,
  },
  tutorialTrayText: {
    fontSize: 13,
    fontWeight: '900',
    left: 18,
    position: 'absolute',
    top: 14,
  },
  tutorialHand: {
    alignItems: 'center',
    backgroundColor: '#FFFDF8',
    borderColor: '#DED4C4',
    borderRadius: 999,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    position: 'absolute',
    width: 44,
    elevation: 24,
    zIndex: 40,
  },
  tutorialHandText: {
    color: '#201D1D',
    fontSize: 11,
    fontWeight: '900',
  },
  tutorialCongratsScreen: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tutorialCongratsCard: {
    alignItems: 'center',
    borderRadius: 26,
    borderWidth: 2,
    elevation: 16,
    maxWidth: 360,
    overflow: 'hidden',
    paddingHorizontal: 24,
    paddingVertical: 26,
    shadowColor: '#201D1D',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    width: '90%',
  },
  tutorialCongratsVisual: {
    alignItems: 'center',
    height: 128,
    justifyContent: 'center',
    marginBottom: 4,
    width: 150,
  },
  tutorialCongratsGlow: {
    borderRadius: 999,
    height: 118,
    opacity: 0.13,
    position: 'absolute',
    width: 118,
  },
  tutorialCongratsMiniBoard: {
    borderRadius: 18,
    borderWidth: 2,
    height: 102,
    padding: 8,
    position: 'relative',
    transform: [{ rotate: '-2deg' }],
    width: 102,
  },
  tutorialCongratsMiniCell: {
    borderColor: 'rgba(32,29,29,0.18)',
    borderRadius: 9,
    borderWidth: 1,
    height: 39,
    position: 'absolute',
    shadowColor: '#201D1D',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    width: 39,
  },
  tutorialCongratsCheck: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 3,
    bottom: 8,
    height: 38,
    justifyContent: 'center',
    position: 'absolute',
    right: 12,
    width: 38,
  },
  tutorialCongratsCheckText: {
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 25,
  },
  tutorialCongratsEyebrow: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
    marginTop: 2,
    textAlign: 'center',
  },
  tutorialCongratsTitle: {
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 34,
    marginTop: 5,
    textAlign: 'center',
  },
  tutorialCongratsText: {
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
    marginTop: 10,
    textAlign: 'center',
  },
  tutorialCongratsDots: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 18,
  },
  tutorialCongratsDot: {
    borderRadius: 999,
    height: 8,
    width: 8,
  },
  tutorialContinueButton: {
    alignItems: 'center',
    borderRadius: 16,
    height: 52,
    justifyContent: 'center',
    marginTop: 20,
    width: '100%',
  },
  tutorialContinueText: {
    fontSize: 17,
    fontWeight: '900',
  },
});



















































