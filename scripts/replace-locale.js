/**
 * 將三個 editor 的 app.js 中內嵌的 zh.json define block
 * 替換為台灣口語繁體中文（從 zh-TW.json 讀取）
 */

const fs = require('fs');
const path = require('path');

const editors = ['documenteditor', 'presentationeditor', 'spreadsheeteditor'];
const baseDir = path.resolve(__dirname, '../public/web-apps/apps');

for (const editor of editors) {
  const appJsPath = path.join(baseDir, editor, 'main/app.js');
  const zhTWPath = path.join(baseDir, editor, 'main/locale/zh-TW.json');

  if (!fs.existsSync(appJsPath) || !fs.existsSync(zhTWPath)) {
    console.warn(`略過 ${editor}：缺少 app.js 或 zh-TW.json`);
    continue;
  }

  console.log(`\n=== ${editor} ===`);

  // 讀取 app.js 按行分割
  const content = fs.readFileSync(appJsPath, 'utf8');
  const lines = content.split('\n');

  // 偵測換行風格（\r\n 或 \n）
  const useCRLF = lines.length > 1 && lines[0].endsWith('\r');

  // 讀取繁體中文 locale
  const zhTW = JSON.parse(fs.readFileSync(zhTWPath, 'utf8'));

  // 找到 define('xxx/main/locale/zh.json' 開始行
  const definePattern = `define('${editor}/main/locale/zh.json'`;
  const startLine = lines.findIndex(l => l.includes(definePattern));
  if (startLine === -1) {
    console.error(`找不到 ${definePattern}`);
    continue;
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
    continue;
  }

  console.log(`zh.json define block: 行 ${startLine + 1} ~ ${endLine + 1}`);

  // 建立繁體中文內容
  const entries = Object.entries(zhTW);
  const cr = useCRLF ? '\r' : '';
  const newLines = [];
  newLines.push(`define('${editor}/main/locale/zh.json', {${cr}`);
  entries.forEach(([key, value], idx) => {
    const escapedValue = JSON.stringify(String(value));
    // JSON.stringify 用雙引號，轉為單引號格式
    const inner = escapedValue.slice(1, -1).replace(/'/g, "\\'").replace(/\\"/g, '"');
    newLines.push(`  '${key}': '${inner}',${cr}`);
  });
  newLines.push(`});${cr}`);

  // 替換行
  const before = lines.slice(0, startLine);
  const after = lines.slice(endLine + 1);
  const result = [...before, ...newLines, ...after].join('\n');

  fs.writeFileSync(appJsPath, result, 'utf8');

  // 驗證語法
  const newLines2 = result.split('\n');
  const verifyStart = newLines2.findIndex(l => l.includes(definePattern));
  let verifyEnd = -1;
  for (let i = verifyStart + 1; i < newLines2.length; i++) {
    if (newLines2[i].trim() === '});') {
      verifyEnd = i;
      break;
    }
  }

  console.log(`替換 ${entries.length} 條 locale 條目`);
  console.log(`驗證: define block 行 ${verifyStart + 1} ~ ${verifyEnd + 1}`);
  console.log(`原始行數: ${lines.length} → 新行數: ${newLines2.length}`);
}

console.log('\n✅ 全部 app.js 替換完成');
