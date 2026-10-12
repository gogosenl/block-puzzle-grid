const fs = require('fs');
const vm = require('vm');
const parser = require('@babel/parser');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
const ast = parser.parse(source, { sourceType: 'module', plugins: ['jsx'] });
const names = ['TOTAL_LEVELS', 'LAYER_CONFIGS', 'THREE_BY_THREE_LEVEL_PATTERNS', 'THEME_ORDER', 'LEVELS_PER_THEME', 'MODERN_LEVEL_LIMIT'];
let code = ast.program.body.filter((node) => node.type === 'VariableDeclaration' && node.declarations.some((item) => names.includes(item.id.name))).map((node) => source.slice(node.start, node.end)).join('\n');
code += '\nconst THEMES = new Proxy({}, { get: () => ({ pieces: [1,2,3,4,5,6] }) });\n';
code += ast.program.body.filter((node) => node.type === 'FunctionDeclaration' && node.start >= source.indexOf('function createRandom') && node.end <= source.indexOf('function createSnapshot')).map((node) => source.slice(node.start, node.end)).join('\n');
code += `
let bad = 0, maxSingle = 0;
const times = {};
for (let level = 1; level <= TOTAL_LEVELS; level++) {
  const data = makeLevel(level), seen = new Set();
  for (const piece of data.pieces) for (const cell of piece.cells) {
    const row = cell.row + piece.answer.row, col = cell.col + piece.answer.col;
    const key = row + ':' + col;
    if (row < 0 || col < 0 || row >= data.size || col >= data.size || seen.has(key)) bad++;
    seen.add(key);
  }
  if (seen.size !== data.size * data.size) bad++;
  maxSingle = Math.max(maxSingle, data.pieces.filter(p => p.cells.length === 1).length);
  const time = getLevelTimeLimit(level, data);
  if (!times[data.size]) times[data.size] = [time, time];
  times[data.size] = [Math.min(times[data.size][0], time), Math.max(times[data.size][1], time)];
}
console.log(JSON.stringify({ levels: TOTAL_LEVELS, bad, maxSingle, times }, null, 2));
if (bad || maxSingle > 3) throw new Error('Level validation failed');
`;
vm.runInNewContext(code, { console });
