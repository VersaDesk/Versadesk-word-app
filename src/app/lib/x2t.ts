import { Injectable, inject } from '@angular/core';
import { OnlyofficeEventbusService } from './eventbus';
import { ONLYOFFICE_EVENT_KEYS, SDK_CONFIG } from './const';
import { EditorManagerFactory } from './editor-manager';
import { g_sEmpty_bin } from './empty_bin';

// ── 全域型別宣告 ──────────────────────────────────────────

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (containerId: string, config: OnlyOfficeConfig) => OnlyOfficeEditorInstance;
    };
    Module?: EmscriptenX2tModule;
  }
}

interface EmscriptenX2tModule {
  FS: {
    mkdir(path: string): void;
    writeFile(path: string, data: string | Uint8Array): void;
    readFile(path: string, opts?: { encoding?: string }): Uint8Array;
    readdir(path: string): string[];
  };
  ccall(name: string, returnType: string, argTypes: string[], args: unknown[]): number;
  onRuntimeInitialized?: () => void;
}

export interface OnlyOfficeConfig {
  document: {
    fileType: string;
    title: string;
    url: string;
    permissions?: Record<string, boolean>;
  };
  documentType?: 'word' | 'cell' | 'slide';
  editorConfig?: {
    lang?: string;
    mode?: 'edit' | 'view';
    customization?: Record<string, unknown>;
  };
  events?: Record<string, ((...args: any[]) => void) | undefined>;
  width?: string;
  height?: string;
  type?: string;
}

export interface OnlyOfficeEditorInstance {
  destroyEditor?: () => void;
  serviceCommand?: (cmd: string, data?: unknown) => void;
  sendCommand?: (msg: { command: string; data: unknown }) => void;
}

export interface CreateEditorViewOptions {
  file?: File;
  fileName: string;
  isNew?: boolean;
  readOnly?: boolean;
  lang?: string;
  containerId?: string;
}

export function getFileExtension(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'docx';
}

// ── WASM fetch 攔截（快取至 IndexedDB）──────────────────

const WASM_CACHE_PATTERNS = [
  { url: 'x2t.wasm', useGz: true },
];

let _fetchIntercepted = false;

function interceptFetch(): void {
  if (typeof window === 'undefined' || !window.fetch || _fetchIntercepted) return;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let url: string;
    if (typeof input === 'string') url = input;
    else if (input instanceof URL) url = input.href;
    else if (input instanceof Request) url = input.url;
    else return originalFetch(input, init);

    const pattern = WASM_CACHE_PATTERNS.find(p => url.includes(p.url));
    if (!pattern) return originalFetch(input, init);

    // 嘗試從 IndexedDB 讀取快取
    const cached = await getWasmFromIDB(url);
    if (cached) {
      console.log('[X2t] WASM 快取命中:', url);
      return new Response(cached, { headers: { 'Content-Type': 'application/wasm' } });
    }

    // 未命中，嘗試使用 .gz 壓縮版本
    const fetchUrl = pattern.useGz ? url + '.gz' : url;
    console.log('[X2t] 從網路載入 WASM:', fetchUrl);

    const response = await originalFetch(fetchUrl, init);
    if (!response.ok) {
      // 若 .gz 失敗，回退到原始 URL
      if (pattern.useGz) return originalFetch(input, init);
      return response;
    }

    let arrayBuffer: ArrayBuffer;
    const contentEncoding = response.headers.get('Content-Encoding');
    if (pattern.useGz && !contentEncoding) {
      // 手動解壓 gzip
      try {
        const blob = await response.blob();
        const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
        arrayBuffer = await new Response(stream).arrayBuffer();
      } catch {
        return originalFetch(input, init);
      }
    } else {
      arrayBuffer = await response.arrayBuffer();
    }

    // 寫入 IndexedDB 快取
    putWasmToIDB(url, arrayBuffer).catch(() => {});

    return new Response(arrayBuffer, {
      status: 200,
      headers: { 'Content-Type': 'application/wasm' },
    });
  } as typeof fetch;

  _fetchIntercepted = true;
}

// ── IndexedDB WASM 快取 ──────────────────────────────────

const IDB_NAME = 'onlyoffice-cache';
const IDB_STORE = 'wasm-cache';
let _db: IDBDatabase | null = null;

function openIDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'url' });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

async function getWasmFromIDB(url: string): Promise<ArrayBuffer | null> {
  try {
    const db = await openIDB();
    return new Promise(resolve => {
      const tx = db.transaction([IDB_STORE], 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(url);
      req.onsuccess = () => resolve(req.result?.data ?? null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function putWasmToIDB(url: string, data: ArrayBuffer): Promise<void> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([IDB_STORE], 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    const req = store.put({ url, data, timestamp: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ── x2t WASM 模組 ────────────────────────────────────────

const X2T_SCRIPT_PATH = '/wasm/x2t/x2t.js';
const X2T_WORKING_DIRS = ['/working', '/working/media', '/working/fonts', '/working/themes'];

let _x2tModule: EmscriptenX2tModule | null = null;
let _x2tInitPromise: Promise<EmscriptenX2tModule> | null = null;

function initX2t(): Promise<EmscriptenX2tModule> {
  if (_x2tModule) return Promise.resolve(_x2tModule);
  if (_x2tInitPromise) return _x2tInitPromise;

  _x2tInitPromise = (async () => {
    interceptFetch();

    // 載入 x2t.js 腳本
    await new Promise<void>((resolve, reject) => {
      if (document.getElementById('x2t-script')) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.id = 'x2t-script';
      script.src = X2T_SCRIPT_PATH;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('無法載入 x2t WASM 腳本'));
      document.head.appendChild(script);
    });

    // 等待 WASM 初始化
    return new Promise<EmscriptenX2tModule>((resolve, reject) => {
      const mod = window.Module;
      if (!mod) { reject(new Error('x2t Module 不存在')); return; }

      const timer = setTimeout(() => {
        if (!_x2tModule) reject(new Error('x2t 初始化超時'));
      }, 300000);

      mod.onRuntimeInitialized = () => {
        clearTimeout(timer);
        X2T_WORKING_DIRS.forEach(dir => {
          try { mod.FS.mkdir(dir); } catch { /* 已存在 */ }
        });
        _x2tModule = mod;
        console.log('[X2t] x2t WASM 初始化完成');
        resolve(mod);
      };
    });
  })();

  return _x2tInitPromise;
}

function convertDocumentToOnlyofficeBin(
  x2t: EmscriptenX2tModule,
  fileData: Uint8Array,
  fileName: string
): { bin: Uint8Array; media: Record<string, string> } {
  const safeName = fileName.replace(/[^\w.\-]/g, '_');
  const inputPath = `/working/${safeName}`;
  const outputPath = `${inputPath}.bin`;

  x2t.FS.writeFile(inputPath, fileData);

  const params = `<?xml version="1.0" encoding="utf-8"?>
<TaskQueueDataConvert xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <m_sFileFrom>${inputPath}</m_sFileFrom>
  <m_sThemeDir>/working/themes</m_sThemeDir>
  <m_sFileTo>${outputPath}</m_sFileTo>
  <m_bIsNoBase64>false</m_bIsNoBase64>
</TaskQueueDataConvert>`;

  x2t.FS.writeFile('/working/params.xml', params);
  const result = x2t.ccall('main1', 'number', ['string'], ['/working/params.xml']);
  if (result !== 0) {
    throw new Error(`文件轉換失敗（錯誤碼：${result}）`);
  }

  const bin = x2t.FS.readFile(outputPath);

  // 讀取媒體檔案
  const media: Record<string, string> = {};
  try {
    const files = x2t.FS.readdir('/working/media/');
    files.filter(f => f !== '.' && f !== '..').forEach(f => {
      try {
        const data = x2t.FS.readFile(`/working/media/${f}`, { encoding: 'binary' }) as unknown as BlobPart;
        media[`media/${f}`] = URL.createObjectURL(new Blob([data]));
      } catch { /* skip */ }
    });
  } catch { /* 沒有媒體目錄 */ }

  return { bin, media };
}

// ── SDK 載入 ─────────────────────────────────────────────

function loadSdk(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const wait = (deadline = Date.now() + 20000) => {
      if (window.DocsAPI) { resolve(); return; }
      if (Date.now() > deadline) {
        reject(new Error('OnlyOffice SDK 超時，請確認 /web-apps/ 已正確部署'));
        return;
      }
      setTimeout(() => wait(deadline), 200);
    };
    if (document.querySelector(`script[src="${src}"]`)) { wait(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = () => wait();
    s.onerror = () => reject(new Error(`無法載入 ${src}`));
    document.head.appendChild(s);
  });
}

function nextTick(): Promise<void> {
  return new Promise(r => setTimeout(r, 0));
}

// ── X2tService ───────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class X2tService {
  private eventbus = inject(OnlyofficeEventbusService);
  private managerFactory = inject(EditorManagerFactory);

  async createEditorView(options: CreateEditorViewOptions): Promise<void> {
    const {
      file,
      fileName,
      isNew = false,
      readOnly = false,
      lang = 'zh',
      containerId = SDK_CONFIG.defaultContainerId,
    } = options;

    this.eventbus.emit(ONLYOFFICE_EVENT_KEYS.LOADING_CHANGE, {
      loading: true, message: '正在初始化...',
    });

    try {
      // ── 1. 準備文件二進位資料 ──────────────────────────
      this.eventbus.emit(ONLYOFFICE_EVENT_KEYS.LOADING_CHANGE, {
        loading: true, message: '正在準備文件...',
      });

      const fileType = isNew ? 'docx' : getFileExtension(fileName);
      let binData: ArrayBuffer | string;
      let media: Record<string, string> | undefined;

      if (isNew) {
        // 新建文件：使用預製的空白二進位範本
        const emptyBin = g_sEmpty_bin[`.${fileType}`];
        if (!emptyBin) throw new Error(`不支援的檔案格式：.${fileType}`);
        binData = emptyBin;
      } else if (file) {
        // 開啟現有文件：使用 x2t WASM 轉換
        this.eventbus.emit(ONLYOFFICE_EVENT_KEYS.LOADING_CHANGE, {
          loading: true, message: '正在轉換文件格式...',
        });
        const x2t = await initX2t();
        const buf = await file.arrayBuffer();
        const result = convertDocumentToOnlyofficeBin(x2t, new Uint8Array(buf), fileName);
        binData = result.bin;
        media = result.media;
      } else {
        throw new Error('缺少文件資料');
      }

      // ── 2. 載入 OnlyOffice SDK ────────────────────────
      this.eventbus.emit(ONLYOFFICE_EVENT_KEYS.LOADING_CHANGE, {
        loading: true, message: '正在載入編輯器...',
      });
      await loadSdk(SDK_CONFIG.apiScriptPath);

      // ── 3. 確認容器存在 ────────────────────────────────
      await nextTick();
      const container = document.getElementById(containerId);
      if (!container) throw new Error(`容器 #${containerId} 不在 DOM 中`);

      // ── 4. 銷毀舊編輯器 ────────────────────────────────
      const manager = this.managerFactory.create(containerId);
      manager.destroy();

      // ── 5. 建立 OnlyOffice 編輯器 ─────────────────────
      this.eventbus.emit(ONLYOFFICE_EVENT_KEYS.LOADING_CHANGE, {
        loading: true, message: '正在啟動編輯器...',
      });

      const capturedMedia = media;
      const capturedBinData = binData;

      const config: OnlyOfficeConfig = {
        document: {
          title: fileName || '未命名文件.docx',
          url: fileName || '未命名文件.docx', // 離線模式僅作為標識，非真實 URL
          fileType,
          permissions: {
            chat: false,
            protect: false,
            print: false,
          },
        },
        editorConfig: {
          lang,
          customization: {
            autosave: false,
            forcesave: false,
            chat: false,
            feedback: false,
            about: false,
            help: false,
            anonymous: { request: false },
          },
        },
        type: 'desktop',
        width: '100%',
        height: '100%',
        events: {
          onAppReady: () => {
            console.log('[OnlyOffice] onAppReady - 傳送文件資料至編輯器');
            const inst = manager.get();
            if (!inst?.sendCommand) {
              console.error('[OnlyOffice] sendCommand 不可用');
              return;
            }
            // 設定媒體圖片
            if (capturedMedia && Object.keys(capturedMedia).length > 0) {
              inst.sendCommand({
                command: 'asc_setImageUrls',
                data: { urls: capturedMedia },
              });
            }
            // 傳送文件二進位資料
            inst.sendCommand({
              command: 'asc_openDocument',
              data: { buf: capturedBinData },
            });
          },
          onDocumentReady: () => {
            console.log('[OnlyOffice] onDocumentReady');
            this.eventbus.emit(ONLYOFFICE_EVENT_KEYS.DOCUMENT_READY, {
              fileName: fileName || '未命名文件.docx',
              fileType,
            });
            this.eventbus.emit(ONLYOFFICE_EVENT_KEYS.LOADING_CHANGE, { loading: false });
          },
          writeFile: (event: any) => {
            this.handleWriteFile(event, fileName || '未命名文件.docx', containerId);
          },
          onError: (e: any) => {
            console.error('[OnlyOffice] 錯誤:', e?.data?.errorCode, e?.data?.errorDescription);
            this.eventbus.emit(ONLYOFFICE_EVENT_KEYS.LOADING_CHANGE, { loading: false });
          },
          onWarning: (e: unknown) => console.warn('[OnlyOffice] 警告:', e),
        },
      };

      const inst = new window.DocsAPI!.DocEditor(containerId, config);
      manager.set(inst);

    } catch (err) {
      console.error('[X2t] 失敗:', err);
      this.eventbus.emit(ONLYOFFICE_EVENT_KEYS.LOADING_CHANGE, { loading: false });
      throw err;
    }
  }

  private handleWriteFile(
    event: { data: { file: any; data: any } },
    originalFileName: string,
    instanceId: string
  ): void {
    try {
      if (!event?.data) return;
      const { file, data } = event.data;

      let binData: Uint8Array;
      if (data instanceof Uint8Array) {
        binData = data;
      } else if (data instanceof ArrayBuffer) {
        binData = new Uint8Array(data);
      } else if (typeof data === 'string') {
        // 嘗試 base64 解碼
        try {
          const binaryStr = atob(data);
          binData = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            binData[i] = binaryStr.charCodeAt(i);
          }
        } catch {
          binData = new TextEncoder().encode(data);
        }
      } else if (data?.buffer) {
        binData = new Uint8Array(data.buffer);
      } else {
        console.error('[X2t] handleWriteFile：未知的資料格式');
        return;
      }

      this.eventbus.emit(ONLYOFFICE_EVENT_KEYS.SAVE_DOCUMENT, {
        fileName: originalFileName,
        fileType: getFileExtension(originalFileName),
        binData,
        instanceId,
      });
    } catch (err) {
      console.error('[X2t] handleWriteFile 失敗:', err);
    }
  }

  async cleanup(): Promise<void> {
    // 清理媒體 blob URL 等資源（如有需要）
  }
}
