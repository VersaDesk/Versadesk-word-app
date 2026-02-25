/**
 * 將所有 editor 的 zh.json（簡體中文）轉換為台灣口語繁體中文 zh-TW.json
 * 步驟：
 *   1. opencc-js 簡體→繁體（台灣用語）
 *   2. 額外的台灣 UI/科技術語替換
 */

const fs = require('fs');
const path = require('path');
const OpenCC = require('opencc-js');

// ── opencc-js 轉換器 ─────────────────────────────────────
const converter = OpenCC.Converter({ from: 'cn', to: 'twp' });

// ── 台灣口語術語替換表 ───────────────────────────────────
// opencc-js twp 已處理大部分字元轉換，這裡補充 UI/科技特定用語
// 格式：[搜尋字串, 替換字串]
// 注意：順序很重要，長的先配對避免子字串衝突
const TW_TERM_REPLACEMENTS = [
  // ── 字型相關 ──
  ['字體顏色', '字型顏色'],
  ['字體名稱', '字型名稱'],
  ['字體大小', '字型大小'],
  ['字體微調', '字型微調'],
  ['字體未載入', '字型未載入'],
  ['字體未加載', '字型未載入'],
  ['字體', '字型'],     // 通用
  ['字號', '字級'],
  ['加粗', '粗體'],
  ['斜體字', '斜體字'],   // 保持不變

  // ── 對齊 ──
  ['居中對齊', '置中對齊'],
  ['水平居中', '水平置中'],
  ['垂直居中', '垂直置中'],
  ['居中的', '置中的'],
  ['居中', '置中'],

  // ── 表格/儲存格 ──
  ['合併單元格', '合併儲存格'],
  ['拆分單元格', '拆分儲存格'],
  ['選擇單元格', '選取儲存格'],
  ['刪除單元格', '刪除儲存格'],
  ['覆蓋單元格', '覆蓋儲存格'],
  ['插入單元格', '插入儲存格'],
  ['單元格垂直', '儲存格垂直'],
  ['單元格左移', '儲存格左移'],
  ['單元格寬度', '儲存格寬度'],
  ['單元格', '儲存格'],  // 通用

  // ── 文件 / 文檔 ──
  ['文檔伺服器', '文件伺服器'],
  ['文檔服務器', '文件伺服器'],
  ['文檔', '文件'],

  // ── 簡報 / 投影片 ──
  ['演示文稿', '簡報'],
  ['幻燈片放映', '投影片放映'],
  ['幻燈片', '投影片'],

  // ── 試算表 ──
  ['電子表格', '試算表'],
  ['電子資料表', '試算表'],
  ['工作簿', '活頁簿'],

  // ── 剪貼簿 ──
  ['剪貼板', '剪貼簿'],

  // ── 超連結 ──
  ['超鏈接', '超連結'],
  ['超連結', '超連結'],  // 確保一致
  ['鏈接', '連結'],

  // ── 列印 ──
  ['列印預覽', '預覽列印'],

  // ── 巨集 ──
  ['宏', '巨集'],

  // ── 外掛 ──
  ['插件', '外掛程式'],

  // ── 程式/軟體/硬體 ──
  ['應用程序', '應用程式'],
  ['程序', '程式'],

  // ── 資訊/訊息 ──
  ['信息', '資訊'],

  // ── 伺服器 ──
  ['服務器', '伺服器'],

  // ── 網路 ──
  ['互聯網', '網際網路'],

  // ── 游標/滑鼠 ──
  ['光標', '游標'],
  ['鼠標', '滑鼠'],

  // ── 位元組/記憶體 ──
  ['字節', '位元組'],
  ['內存', '記憶體'],

  // ── 數位/數碼 ──
  ['數碼', '數位'],

  // ── 圖片/影像 ──
  ['圖片品質', '圖片品質'],

  // ── 對話方塊 ──
  ['對話框', '對話方塊'],

  // ── 回車/換行 ──
  ['回車', '換行'],

  // ── 註釋/批註 ──
  ['批註', '註解'],

  // ── 腳註 ──
  ['腳註', '註腳'],

  // ── 頁首/頁尾 ──
  ['頁首', '頁首'],  // 台灣也用頁首
  ['頁尾', '頁尾'],  // 台灣也用頁尾

  // ── 縮排/縮進 ──
  ['縮進', '縮排'],

  // ── 目錄 ──
  ['目錄', '目錄'],  // 台灣也用目錄

  // ── 範本/模板 ──
  ['模板', '範本'],

  // ── 佈局/版面配置 ──
  ['佈局', '版面配置'],

  // ── 項目符號 ──
  ['項目符號', '項目符號'],  // 台灣也用

  // ── 分隔符 ──
  ['分隔符', '分隔符號'],

  // ── 復原/重做 ──
  ['撤銷', '復原'],
  ['重做', '重做'],  // 台灣也用重做

  // ── 上傳/下載 ──
  ['上傳', '上傳'],
  ['下載', '下載'],

  // ── 操作相關 ──
  ['新增間隔', '新增間距'],

  // ── 其他 ──
  ['拼寫檢查', '拼字檢查'],
  ['拼寫', '拼字'],
  ['回收站', '資源回收桶'],
  ['最大化', '最大化'],
  ['最小化', '最小化'],
  ['全屏', '全螢幕'],
  ['屏幕', '螢幕'],
  ['截屏', '截圖'],
  ['帳戶', '帳號'],
  ['賬戶', '帳號'],
  ['登錄', '登入'],
  ['註冊', '註冊'],
  ['用戶', '使用者'],
  ['激活', '啟用'],
  ['雙擊', '按兩下'],
  ['單擊', '按一下'],
  ['右擊', '右鍵按一下'],
  ['點擊', '按一下'],
];

// ── 轉換函式 ────────────────────────────────────────────

function convertToTW(text) {
  // Step 1: opencc-js 簡→繁（台灣用語）
  let result = converter(text);

  // Step 2: 額外台灣口語替換
  for (const [search, replace] of TW_TERM_REPLACEMENTS) {
    // 使用全域替換
    result = result.split(search).join(replace);
  }

  return result;
}

function convertLocaleFile(inputPath, outputPath) {
  console.log(`\n讀取: ${inputPath}`);
  const raw = fs.readFileSync(inputPath, 'utf8');
  const data = JSON.parse(raw);

  const result = {};
  let count = 0;
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      result[key] = convertToTW(value);
      count++;
    } else {
      result[key] = value;
    }
  }

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
  console.log(`寫入: ${outputPath} (${count} 筆翻譯)`);
  return count;
}

// ── 主程式 ──────────────────────────────────────────────

const editors = ['documenteditor', 'presentationeditor', 'spreadsheeteditor'];
const baseDir = path.resolve(__dirname, '../public/web-apps/apps');

let totalCount = 0;

for (const editor of editors) {
  const zhPath = path.join(baseDir, editor, 'main/locale/zh.json');
  const twPath = path.join(baseDir, editor, 'main/locale/zh-TW.json');

  if (!fs.existsSync(zhPath)) {
    console.warn(`略過: ${zhPath} 不存在`);
    continue;
  }

  const count = convertLocaleFile(zhPath, twPath);
  totalCount += count;
}

console.log(`\n✅ 全部完成！共 ${totalCount} 筆翻譯`);
