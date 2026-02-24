# OnlyOffice Word 編輯器（Angular v20）

基於 [mvp-onlyoffice](https://github.com/electroluxcode/mvp-onlyoffice) 專案，抽取 Word 編輯器功能並以 **Angular v20+** 重新改寫，介面語言改為**繁體中文**。

## 功能特點

- 🔒 **資料安全**：文件處理完全在瀏覽器內完成，資料不離開本機
- 📄 **格式支援**：支援 DOCX、DOC、ODT、RTF、TXT 格式
- ✏️ **完整編輯**：整合 OnlyOffice SDK，提供完整的 Word 文件編輯功能
- 💾 **匯出下載**：一鍵匯出並下載編輯後的文件
- 👁️ **唯讀模式**：支援唯讀/編輯模式切換
- ➕ **新建文件**：可建立空白 Word 文件
- 🌏 **繁體中文**：介面完全中文化
- ♿ **無障礙設計**：遵循 ARIA 標準

## 技術架構

- **Angular v20+**：使用最新的 Angular 特性
  - Standalone Components（無 NgModules）
  - Signals 狀態管理（`signal`、`computed`、`effect`）
  - 新版控制流語法（`@if`、`@for`）
  - `inject()` 依賴注入
  - `afterNextRender` 生命週期
  - `viewChild` 模板引用
- **TypeScript 5.5+**：強型別定義
- **SCSS**：模組化樣式

## 專案結構

```
src/
├── app/
│   ├── app.component.ts          # 根元件
│   ├── app.config.ts             # 應用設定（Router、DI）
│   ├── app.routes.ts             # 路由設定
│   ├── lib/                      # 核心工具庫
│   │   ├── const.ts              # 常數定義
│   │   ├── eventbus.ts           # 事件總線 Service
│   │   ├── x2t.ts               # OnlyOffice SDK 封裝 Service
│   │   └── editor-manager.ts    # 編輯器實例管理 Service
│   └── pages/
│       └── word-editor/          # Word 編輯器頁面
│           ├── word-editor.component.ts
│           ├── word-editor.component.html
│           └── word-editor.component.scss
├── styles.scss                   # 全域樣式與 CSS 變數
├── index.html                    # 應用入口 HTML
└── main.ts                       # Bootstrap 入口點
```

## 安裝與啟動

### 前置需求

- Node.js 18+
- npm 9+ 或 pnpm

### 步驟

```bash
# 1. 安裝依賴
npm install

# 2. 部署 OnlyOffice 靜態資源（必要！）
# 將原始 repo 的 public/ 目錄內容複製至本專案的 public/ 目錄
# 所需資源：
#   public/web-apps/    → OnlyOffice Web 應用資源
#   public/sdkjs/       → OnlyOffice SDK
#   public/wasm/        → WebAssembly 轉換器

# 3. 啟動開發伺服器
npm start
# 瀏覽器開啟 http://localhost:3001
```

### 靜態資源說明

本專案的編輯器功能需要 OnlyOffice 的靜態資源，請從原始 repo 取得：

```bash
# 從原始 repo 複製靜態資源
git clone https://github.com/electroluxcode/mvp-onlyoffice.git temp-repo
cp -r temp-repo/public/* ./public/
rm -rf temp-repo
```

## 路由

| 路徑 | 說明 |
|------|------|
| `/` | 重新導向至 `/docs/base` |
| `/docs/base` | Word 文件編輯器主頁 |

## API 說明

### EventbusService

```typescript
import { OnlyofficeEventbusService } from './lib/eventbus';

// 訂閱文件就緒事件
eventbus.on('documentReady', (data) => {
  console.log('文件已就緒:', data.fileName);
});

// 訂閱文件儲存事件
eventbus.on('saveDocument', (data) => {
  console.log('已取得文件資料:', data.binData);
});

// 等待事件（Promise 形式）
const result = await eventbus.waitFor('saveDocument', 30000);
```

### EditorManagerFactory

```typescript
import { EditorManagerFactory } from './lib/editor-manager';

// 取得預設管理器
const manager = factory.getDefault();

// 觸發匯出
await manager.export();

// 設定唯讀
await manager.setReadOnly(true);

// 銷毀編輯器
manager.destroy();
```

### X2tService

```typescript
import { X2tService } from './lib/x2t';

// 開啟文件
await x2t.createEditorView({
  file: fileObject,        // File 物件
  fileName: 'doc.docx',
  isNew: false,
  readOnly: false,
  lang: 'zh',              // 繁體中文介面
  containerId: 'my-editor'
});

// 新建文件
await x2t.createEditorView({
  fileName: '未命名文件.docx',
  isNew: true,
  lang: 'zh'
});
```

## 與原始 Next.js 版本的對應關係

| Next.js（原始）| Angular v20（本專案）|
|----------------|----------------------|
| `src/app/docs/base/page.tsx` | `word-editor.component.*` |
| `src/onlyoffice-comp/lib/eventbus.ts` | `lib/eventbus.ts` |
| `src/onlyoffice-comp/lib/editor-manager.ts` | `lib/editor-manager.ts` |
| `src/onlyoffice-comp/lib/x2t.ts` | `lib/x2t.ts` |
| `src/onlyoffice-comp/lib/const.ts` | `lib/const.ts` |
| React Hooks / useState | Angular Signals |
| Next.js Router | Angular Router |
| React useEffect | `afterNextRender` / `ngOnDestroy` |

## 瀏覽器相容性

建議使用最新版本的：
- Google Chrome
- Mozilla Firefox  
- Microsoft Edge
- Apple Safari

## 授權

AGPL-3.0（與原始專案相同）
