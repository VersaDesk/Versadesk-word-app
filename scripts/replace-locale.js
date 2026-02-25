const fs = require('fs');
const path = require('path');

const appJsPath = path.join(__dirname, '..', 'public/web-apps/apps/documenteditor/main/app.js');
const zhTWPath = path.join(__dirname, '..', 'public/web-apps/apps/documenteditor/main/locale/zh-TW.json');

// 讀取 app.js 按行分割
const lines = fs.readFileSync(appJsPath, 'utf8').split('\n');

// 讀取繁體中文 locale
const zhTW = JSON.parse(fs.readFileSync(zhTWPath, 'utf8'));

// 找到 define('documenteditor/main/locale/zh.json' 開始行
const startLine = lines.findIndex(l => l.includes("define('documenteditor/main/locale/zh.json'"));
if (startLine === -1) {
  console.error('找不到 zh.json define 開頭');
  process.exit(1);
}

// 找到對應的 }); 結尾行
let endLine = -1;
for (let i = startLine + 1; i < lines.length; i++) {
  if (lines[i].trim() === '});') {
    endLine = i;
    break;
  }
}
if (endLine === -1) {
  console.error('找不到 zh.json define 結尾 });');
  process.exit(1);
}

console.log(`找到 zh.json define block: 行 ${startLine + 1} ~ ${endLine + 1}`);

// 建立繁體中文內容
const entries = Object.entries(zhTW);
const newLines = [];
newLines.push("define('documenteditor/main/locale/zh.json', {");
entries.forEach(([key, value], idx) => {
  const escapedValue = JSON.stringify(String(value));
  // JSON.stringify 用雙引號，轉為單引號格式
  const inner = escapedValue.slice(1, -1).replace(/'/g, "\\'").replace(/\\"/g, '"');
  const comma = idx < entries.length - 1 ? ',' : ',';
  newLines.push("  '" + key + "': '" + inner + "'" + comma);
});
newLines.push('});');

// 替換行
const before = lines.slice(0, startLine);
const after = lines.slice(endLine + 1);
const result = [...before, ...newLines, ...after].join('\n');

fs.writeFileSync(appJsPath, result, 'utf8');
console.log('Done! 替換了', entries.length, '條 locale 條目');
console.log('原始行數:', lines.length, '→ 新行數:', before.length + newLines.length + after.length);
