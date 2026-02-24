import { Injectable, inject } from '@angular/core';
import { OnlyofficeEventbusService } from './eventbus';
import { ONLYOFFICE_EVENT_KEYS, SDK_CONFIG, FILE_MIME_MAP } from './const';
import { EditorManagerFactory } from './editor-manager';

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (containerId: string, config: OnlyOfficeConfig) => OnlyOfficeEditorInstance;
    };
  }
}

export interface OnlyOfficeConfig {
  document: {
    fileType: string;
    key: string;
    title: string;
    url: string;
    permissions?: Record<string, boolean>;
  };
  documentType: 'word' | 'cell' | 'slide';
  editorConfig?: {
    lang?: string;
    mode?: 'edit' | 'view';
    customization?: Record<string, unknown>;
  };
  events?: {
    onDocumentReady?: () => void;
    onDownloadAs?: (e: { data: { fileType: string; url: string } }) => void;
    onRequestSaveAs?: (e: { data: { fileType: string; url: string } }) => void;
    onError?: (e: { data: { errorCode: number; errorDescription: string } }) => void;
    onAppReady?: () => void;
    onInfo?: (e: unknown) => void;
    onWarning?: (e: unknown) => void;
  };
  width?: string;
  height?: string;
  type?: string;
}

export interface OnlyOfficeEditorInstance {
  destroyEditor?: () => void;
  serviceCommand?: (cmd: string, data?: unknown) => void;
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

function generateDocKey(): string {
  return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(new Error('讀取檔案失敗'));
    r.readAsArrayBuffer(file);
  });
}

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

const SW_CACHE = 'oo-docs-v1';
let _currentDocUrl: string | null = null;

/**
 * 將文件儲存至 Cache API，讓 Service Worker 可以攔截並回傳。
 * 這樣 OnlyOffice iframe 可以用真實的 HTTP URL 拿到文件。
 */
async function storeInCache(
  buffer: ArrayBuffer,
  fileName: string,
  mimeType: string
): Promise<string> {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  // 用副檔名讓 OnlyOffice 能辨識格式
  const ext = mimeType.includes('wordprocessingml') ? 'docx'
    : mimeType.includes('msword') ? 'doc'
    : mimeType.includes('opendocument.text') ? 'odt'
    : mimeType.includes('rtf') ? 'rtf'
    : 'docx';
  const path = `/sw-doc/${id}.${ext}`;

  const response = new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(buffer.byteLength),
      'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
    },
  });

  const cache = await caches.open(SW_CACHE);
  await cache.put(path, response);
  console.log(`[X2t] ✅ 文件已存入 Cache: ${path} (${buffer.byteLength} bytes)`);
  return path;
}

async function removeFromCache(path: string): Promise<void> {
  try {
    const cache = await caches.open(SW_CACHE);
    await cache.delete(path);
  } catch { /* ignore */ }
}

/**
 * 等待 Service Worker 進入 active + controlling 狀態
 * 最多等 8 秒
 */
async function waitForSW(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('瀏覽器不支援 Service Worker，請使用 Chrome / Firefox / Edge');
  }

  // 先嘗試取得已存在的 registration
  let reg = await navigator.serviceWorker.getRegistration('/');

  if (!reg) {
    console.log('[X2t] 註冊 Service Worker...');
    reg = await navigator.serviceWorker.register('/doc-sw.js', { scope: '/' });
  }

  // 等待 SW active
  if (!reg.active) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SW 啟動超時')), 8000);
      const sw = reg!.installing ?? reg!.waiting;
      if (sw) {
        sw.addEventListener('statechange', () => {
          if (sw.state === 'activated') { clearTimeout(timer); resolve(); }
        });
      } else {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          clearTimeout(timer); resolve();
        }, { once: true });
      }
    });
  }

  // 確保 SW 控制當前頁面
  if (!navigator.serviceWorker.controller) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SW 未能控制頁面')), 5000);
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        clearTimeout(timer); resolve();
      }, { once: true });
    });
  }

  console.log('[X2t] ✅ Service Worker 已就緒');
}

function nextTick(): Promise<void> {
  return new Promise(r => setTimeout(r, 0));
}

@Injectable({ providedIn: 'root' })
export class X2tService {
  private eventbus = inject(OnlyofficeEventbusService);
  private managerFactory = inject(EditorManagerFactory);
  private swReady = false;

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
      // ── 1. 初始化 Service Worker（只在第一次載入）─────
      if (!this.swReady) {
        this.eventbus.emit(ONLYOFFICE_EVENT_KEYS.LOADING_CHANGE, {
          loading: true, message: '正在初始化 Service Worker...',
        });
        await waitForSW();
        this.swReady = true;
      }

      // ── 2. 載入 SDK ────────────────────────────────────
      this.eventbus.emit(ONLYOFFICE_EVENT_KEYS.LOADING_CHANGE, {
        loading: true, message: '正在載入 OnlyOffice SDK...',
      });
      await loadSdk(SDK_CONFIG.apiScriptPath);
      console.log('[X2t] ✅ SDK 載入完成');

      // ── 3. 確認容器在 DOM 且有尺寸 ────────────────────
      await nextTick();
      const container = document.getElementById(containerId);
      if (!container) throw new Error(`容器 #${containerId} 不在 DOM 中`);
      const { width, height } = container.getBoundingClientRect();
      console.log(`[X2t] 容器尺寸: ${width}x${height}`);
      if (width === 0 || height === 0) {
        console.warn('[X2t] ⚠️ 容器尺寸為 0，OnlyOffice 可能無法顯示');
      }

      // ── 4. 準備文件，存入 Cache ────────────────────────
      this.eventbus.emit(ONLYOFFICE_EVENT_KEYS.LOADING_CHANGE, {
        loading: true, message: '正在準備文件...',
      });

      if (_currentDocUrl) {
        await removeFromCache(_currentDocUrl);
        _currentDocUrl = null;
      }

      const fileType = isNew ? 'docx' : getFileExtension(fileName);
      const mimeType = FILE_MIME_MAP[fileType] ?? FILE_MIME_MAP['docx'];

      let docBuffer: ArrayBuffer;
      if (isNew || !file) {
        docBuffer = buildMinimalDocx();
      } else {
        docBuffer = await readFileAsArrayBuffer(file);
      }

      _currentDocUrl = await storeInCache(docBuffer, fileName || '未命名文件.docx', mimeType);

      // 驗證快取可以被 fetch 到（提前確認）
      const testResp = await fetch(_currentDocUrl);
      if (!testResp.ok) {
        throw new Error(`Service Worker 快取驗證失敗 (${testResp.status})，請重新整理頁面`);
      }
      console.log('[X2t] ✅ 快取驗證成功，文件可被 fetch');

      // ── 5. 銷毀舊編輯器 ────────────────────────────────
      const manager = this.managerFactory.create(containerId);
      manager.destroy();

      // ── 6. 啟動 OnlyOffice ─────────────────────────────
      this.eventbus.emit(ONLYOFFICE_EVENT_KEYS.LOADING_CHANGE, {
        loading: true, message: '正在啟動編輯器...',
      });

      const docUrl = _currentDocUrl;  // 真實的 HTTP path，iframe 可以 fetch

      const config: OnlyOfficeConfig = {
        document: {
          fileType,
          key: generateDocKey(),
          title: fileName || '未命名文件.docx',
          url: docUrl,
          permissions: {
            edit: !readOnly,
            download: true,
            print: true,
            review: !readOnly,
            comment: !readOnly,
            copy: true,
            fillForms: !readOnly,
          },
        },
        documentType: 'word',
        editorConfig: {
          lang,
          mode: readOnly ? 'view' : 'edit',
          customization: {
            autosave: false,
            forcesave: false,
            chat: false,
            feedback: false,
            compactHeader: false,
            statusBar: true,
            leftMenu: true,
            logo: { image: '', imageEmbedded: '', url: '' },
            anonymous: { request: false },
          },
        },
        type: 'desktop',
        width: '100%',
        height: '100%',
        events: {
          onAppReady: () => console.log('[OnlyOffice] onAppReady'),
          onDocumentReady: () => {
            console.log('[OnlyOffice] ✅ onDocumentReady！');
            this.eventbus.emit(ONLYOFFICE_EVENT_KEYS.DOCUMENT_READY, {
              fileName: fileName || '未命名文件.docx',
              fileType,
            });
            this.eventbus.emit(ONLYOFFICE_EVENT_KEYS.LOADING_CHANGE, { loading: false });
          },
          onDownloadAs: (e) => this.handleDownloadAs(e.data, fileName || '未命名文件.docx', containerId),
          onRequestSaveAs: (e) => this.handleDownloadAs(e.data, fileName || '未命名文件.docx', containerId),
          onError: (e) => {
            console.error('[OnlyOffice] ❌', e.data?.errorCode, e.data?.errorDescription);
            this.eventbus.emit(ONLYOFFICE_EVENT_KEYS.LOADING_CHANGE, { loading: false });
          },
          onInfo: (e) => console.log('[OnlyOffice] info', e),
          onWarning: (e) => console.warn('[OnlyOffice] warning', e),
        },
      };

      console.log('[X2t] 呼叫 DocsAPI.DocEditor，docUrl =', docUrl);
      const inst = new window.DocsAPI!.DocEditor(containerId, config);
      manager.set(inst);

    } catch (err) {
      console.error('[X2t] ❌ 失敗:', err);
      this.eventbus.emit(ONLYOFFICE_EVENT_KEYS.LOADING_CHANGE, { loading: false });
      throw err;
    }
  }

  private async handleDownloadAs(
    data: { fileType: string; url: string },
    originalFileName: string,
    instanceId: string
  ): Promise<void> {
    try {
      const resp = await fetch(data.url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buf = await resp.arrayBuffer();
      this.eventbus.emit(ONLYOFFICE_EVENT_KEYS.SAVE_DOCUMENT, {
        fileName: originalFileName,
        fileType: data.fileType || getFileExtension(originalFileName),
        binData: new Uint8Array(buf),
        instanceId,
      });
    } catch (err) {
      console.error('[X2t] handleDownloadAs 失敗:', err);
    }
  }

  async cleanup(): Promise<void> {
    if (_currentDocUrl) {
      await removeFromCache(_currentDocUrl);
      _currentDocUrl = null;
    }
  }
}

// ── 最小合法 DOCX ─────────────────────────────────────────
function buildMinimalDocx(): ArrayBuffer {
  return buildZip([
    {
      name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    },
    {
      name: '_rels/.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    },
    {
      name: 'word/document.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>',
    },
    {
      name: 'word/_rels/document.xml.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>',
    },
  ]);
}

function buildZip(files: Array<{ name: string; data: string }>): ArrayBuffer {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const nb = enc.encode(f.name), db = enc.encode(f.data);
    const crc = crc32(db), { t, d } = dosNow();
    const lh = new Uint8Array(30 + nb.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true);
    lv.setUint16(10, t, true); lv.setUint16(12, d, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, db.length, true);
    lv.setUint32(22, db.length, true); lv.setUint16(26, nb.length, true);
    lh.set(nb, 30);
    const ch = new Uint8Array(46 + nb.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(12, t, true); cv.setUint16(14, d, true); cv.setUint32(16, crc, true);
    cv.setUint32(20, db.length, true); cv.setUint32(24, db.length, true);
    cv.setUint16(28, nb.length, true); cv.setUint32(38, 0x20, true); cv.setUint32(42, offset, true);
    ch.set(nb, 46);
    locals.push(lh, db); centrals.push(ch);
    offset += lh.length + db.length;
  }
  const cs = centrals.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, cs, true); ev.setUint32(16, offset, true);
  const all = [...locals, ...centrals, eocd];
  const total = all.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const a of all) { out.set(a, pos); pos += a.length; }
  return out.buffer;
}

function dosNow() {
  const d = new Date();
  return {
    t: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    d: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

let _crcTable: Uint32Array | null = null;
function crc32(data: Uint8Array): number {
  if (!_crcTable) {
    _crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      _crcTable[i] = c;
    }
  }
  let crc = 0xffffffff;
  for (const b of data) crc = (crc >>> 8) ^ _crcTable[(crc ^ b) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}
