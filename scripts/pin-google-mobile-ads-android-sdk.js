const fs = require('fs');
const path = require('path');

const packagePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-google-mobile-ads',
  'package.json'
);
const adsPackageRoot = path.dirname(packagePath);
const androidSourceRoot = path.join(
  adsPackageRoot,
  'android',
  'src',
  'main',
  'java',
  'io',
  'invertase',
  'googlemobileads'
);
const adsModulePath = path.join(androidSourceRoot, 'ReactNativeGoogleMobileAdsModule.kt');
const adsCommonPath = path.join(androidSourceRoot, 'ReactNativeGoogleMobileAdsCommon.java');
const appModuleSpecPath = path.join(androidSourceRoot, 'NativeAppModuleSpec.java');

const ANDROID_ADS_VERSION = '24.9.0';
const ANDROID_UMP_VERSION = '3.2.0';

if (!fs.existsSync(packagePath)) {
  console.log('[postinstall] react-native-google-mobile-ads package not found; skipping Android SDK pin.');
  process.exit(0);
}

const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

packageJson.sdkVersions = packageJson.sdkVersions || {};
packageJson.sdkVersions.android = packageJson.sdkVersions.android || {};
packageJson.sdkVersions.android.googleMobileAds = ANDROID_ADS_VERSION;
packageJson.sdkVersions.android.googleUmp = ANDROID_UMP_VERSION;

fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

if (fs.existsSync(adsModulePath)) {
  let adsModule = fs.readFileSync(adsModulePath, 'utf8');

  adsModule = adsModule.replace(
    /^\s*import com\.google\.android\.gms\.ads\.AgeRestrictedTreatment\r?\n/m,
    ''
  );
  adsModule = adsModule.replace(
    /\n\s*if \(requestConfiguration\.hasKey\("ageRestrictedTreatment"\)\) \{[\s\S]*?\n\s*}\n\s*\n\s*if \(requestConfiguration\.hasKey\("tagForChildDirectedTreatment"\)\) \{/,
    '\n\n    if (requestConfiguration.hasKey("tagForChildDirectedTreatment")) {'
  );

  fs.writeFileSync(adsModulePath, adsModule);
}

if (fs.existsSync(adsCommonPath)) {
  let adsCommon = fs.readFileSync(adsCommonPath, 'utf8');

  adsCommon = adsCommon.replace(
    'return AdSize.getLargeAnchoredAdaptiveBannerAdSize(reactViewGroup.getContext(), adWidth);',
    'return AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(reactViewGroup.getContext(), adWidth);'
  );

  fs.writeFileSync(adsCommonPath, adsCommon);
}

const nativeAppModuleSpec = `package io.invertase.googlemobileads;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReadableMap;

public abstract class NativeAppModuleSpec extends ReactContextBaseJavaModule {
  public static final String NAME = "RNAppModule";

  public NativeAppModuleSpec(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  public abstract void initializeApp(ReadableMap options, ReadableMap appConfig, Promise promise);

  public abstract void setAutomaticDataCollectionEnabled(String appName, boolean enabled);

  public abstract void deleteApp(String appName, Promise promise);

  public abstract void eventsNotifyReady(boolean ready);

  public abstract void eventsGetListeners(Promise promise);

  public abstract void eventsPing(String eventName, ReadableMap eventBody, Promise promise);

  public abstract void eventsAddListener(String eventName);

  public abstract void eventsRemoveListener(String eventName, boolean all);

  public abstract void addListener(String eventName);

  public abstract void removeListeners(double count);

  public abstract void metaGetAll(Promise promise);

  public abstract void jsonGetAll(Promise promise);

  public abstract void preferencesSetBool(String key, boolean value, Promise promise);

  public abstract void preferencesSetString(String key, String value, Promise promise);

  public abstract void preferencesGetAll(Promise promise);

  public abstract void preferencesClearAll(Promise promise);
}
`;

if (fs.existsSync(androidSourceRoot)) {
  fs.writeFileSync(appModuleSpecPath, nativeAppModuleSpec);
}

console.log(
  `[postinstall] Pinned react-native-google-mobile-ads Android SDKs: ` +
    `play-services-ads ${ANDROID_ADS_VERSION}, UMP ${ANDROID_UMP_VERSION}.`
);
