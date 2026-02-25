/**
 * OnlyOffice 事件常數
 */
export const ONLYOFFICE_EVENT_KEYS = {
  /** 文件儲存完成事件 */
  SAVE_DOCUMENT: 'saveDocument',
  /** 文件載入就緒事件 */
  DOCUMENT_READY: 'documentReady',
  /** 載入狀態變化事件 */
  LOADING_CHANGE: 'loadingChange',
} as const;

export type OnlyofficeEventKey = typeof ONLYOFFICE_EVENT_KEYS[keyof typeof ONLYOFFICE_EVENT_KEYS];

/**
 * 支援的文件類型
 */
export const FILE_TYPE = {
  DOCX: 'docx',
  DOC: 'doc',
  ODT: 'odt',
  RTF: 'rtf',
  TXT: 'txt',
  HTML: 'html',
} as const;

export type FileType = typeof FILE_TYPE[keyof typeof FILE_TYPE];

/**
 * 文件類型對應的 MIME 類型
 */
export const FILE_MIME_MAP: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  odt: 'application/vnd.oasis.opendocument.text',
  rtf: 'application/rtf',
  txt: 'text/plain',
  html: 'text/html',
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
  dotx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  ott: 'application/vnd.oasis.opendocument.text-template',
};

/**
 * Word 文件允許的副檔名
 */
export const ALLOWED_WORD_EXTENSIONS = ['.docx', '.odt', '.rtf', '.txt'];

/**
 * 不支援的副檔名（x2t WASM 未包含舊版格式解析器）
 */
export const UNSUPPORTED_EXTENSIONS_MSG: Record<string, string> = {
  '.doc': '不支援舊版 .doc 格式，請先用 Word 另存為 .docx 後再上傳',
};

/**
 * 預設語言設定（繁體中文）
 */
export const DEFAULT_LANG = 'zh-TW';

/**
 * OnlyOffice SDK 路徑
 */
export const SDK_CONFIG = {
  /** API 腳本路徑 */
  apiScriptPath: '/web-apps/apps/api/documents/api.js',
  /** 預設容器 ID */
  defaultContainerId: 'onlyoffice-editor-container',
};
