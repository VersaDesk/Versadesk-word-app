# Changelog

本檔案記錄 Versadesk OnlyOffice Word 專案的所有重要變更。

## [1.0.0] - 2026-02-26

### 專案重新命名

- 套件名稱從 `onlyoffice-word-angular` 更名為 `versadesk-onlyoffice-word`
- 更新 `package.json`、`angular.json` 中所有相關名稱與 build target

### 新增功能

- **Angular v20 重寫**：將原始 [mvp-onlyoffice](https://github.com/electroluxcode/mvp-onlyoffice) Next.js 專案以 Angular v20+ 全面改寫，使用 Standalone Components、Signals、新版控制流語法等最新特性
- **文件下載功能**：實作 `onSave` handler，透過 x2t WASM 將 DOCY 格式轉換為 DOCX/PDF 後下載
- **台灣繁體中文 locale（zh-TW）**：為 Document Editor、Presentation Editor、Spreadsheet Editor 三個編輯器新增完整的 zh-TW 語系檔
- **繁體中文字型縮圖**：產生繁體中文版的 `fonts_thumbnail_ea@1.5x.png.bin`，字型下拉選單顯示繁體中文名稱（等線、微軟雅黑、宋體、華文彩雲等）
- **字型縮圖產生器**：新增 `scripts/generate-font-thumbnails-tw.html` 工具，可在瀏覽器中重新產生繁體中文字型縮圖

### 問題修復

- **修復下載按鈕無反應**：加入 `onSave` 事件處理，透過 x2t WASM 進行 DOCY → DOCX/PDF 格式轉換後觸發下載
- **修復第二次上傳檔案失敗**：調整編輯器 destroy/check 順序，確保重新上傳時編輯器正確重建
- **修復 .doc 格式 Error 88**：從支援格式清單移除 .doc（僅支援 DOCX、ODT、RTF、TXT）
- **修復 PDF 下載內容空白**：將字型檔載入 WASM 虛擬檔案系統，確保 x2t 轉換 PDF 時能正確嵌入字型
- **修復編輯器卡在「正在啟動編輯器...」**：改用 `sendCommand` 方式載入離線文件
- **修復字型下拉選單顯示簡體中文**：
  - 在 SDK 層（`sdk-all.js`）加入 `__sc2tc_font` 簡轉繁對照表，修改 `asc_getFontName()` 回傳繁體中文字型名稱
  - 產生繁體中文版字型縮圖二進位檔（RLE 壓縮格式），替換 `fonts_thumbnail_ea@1.5x.png.bin`
  - 修正 EA 縮圖載入的 locale 正規表達式：`/^(zh|ja|ko)$/i` → `/^(zh|ja|ko)(\b|-|$)/i`，支援 `zh-tw`、`zh-cn` 等完整語系代碼
- **修復字型名稱取得方式**：在 app.js 的字型初始化函式中加入 `_.isFunction()` 安全檢查，以 `asc_getFontName` → `get_Name` 順序 graceful fallback
