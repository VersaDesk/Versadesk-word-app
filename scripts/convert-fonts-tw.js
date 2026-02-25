/**
 * 將 AllFonts.js 中的簡體中文字型名稱轉為繁體中文
 * 只影響 __fonts_sort 陣列中的中文名稱
 */

const fs = require('fs');
const path = require('path');
const OpenCC = require('opencc-js');

const converter = OpenCC.Converter({ from: 'cn', to: 'twp' });

const filePath = path.resolve(__dirname, '../public/sdkjs/common/AllFonts.js');

let content = fs.readFileSync(filePath, 'utf8');

// 簡體→繁體字型名稱對照（在 __fonts_sort 中出現的）
const fontNameReplacements = [
  ['等线 Light', '等線 Light'],
  ['等线', '等線'],
  ['微软雅黑 Light', '微軟雅黑 Light'],
  ['微软雅黑', '微軟雅黑'],
  ['宋体', '宋體'],
  ['黑体', '黑體'],
  ['楷体', '楷體'],
  ['隶书', '隸書'],
  ['新宋体', '新宋體'],
  ['幼圆', '幼圓'],
  ['方正舒体', '方正舒體'],
  ['方正姚体', '方正姚體'],
  ['华文彩云', '華文彩雲'],
  ['华文仿宋', '華文仿宋'],
  ['华文琥珀', '華文琥珀'],
  ['华文楷体', '華文楷體'],
  ['华文隶书', '華文隸書'],
  ['华文宋体', '華文宋體'],
  ['华文细黑', '華文細黑'],
  ['华文行楷', '華文行楷'],
  ['华文新魏', '華文新魏'],
  ['华文中宋', '華文中宋'],
];

let count = 0;
for (const [from, to] of fontNameReplacements) {
  const pattern = `'${from}'`;
  const replacement = `'${to}'`;
  if (content.includes(pattern)) {
    content = content.split(pattern).join(replacement);
    count++;
    console.log(`  ${from} → ${to}`);
  }
}

fs.writeFileSync(filePath, content, 'utf8');
console.log(`\n✅ 共替換 ${count} 個字型名稱`);
