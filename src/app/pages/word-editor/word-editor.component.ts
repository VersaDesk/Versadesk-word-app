import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
  ElementRef,
  viewChild,
  effect,
  afterNextRender
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { X2tService, getFileExtension } from '../../lib/x2t';
import { EditorManagerFactory } from '../../lib/editor-manager';
import {
  OnlyofficeEventbusService,
  SaveDocumentData,
  DocumentReadyData,
  LoadingChangeData
} from '../../lib/eventbus';
import { ONLYOFFICE_EVENT_KEYS, ALLOWED_WORD_EXTENSIONS, SDK_CONFIG, FILE_MIME_MAP } from '../../lib/const';

/** 應用程式狀態 */
type AppState = 'idle' | 'loading' | 'ready' | 'error';

@Component({
  selector: 'app-word-editor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './word-editor.component.html',
  styleUrl: './word-editor.component.scss'
})
export class WordEditorComponent implements OnInit, OnDestroy {
  // ── 服務注入 ──────────────────────────────────────────
  private x2t = inject(X2tService);
  private editorManagerFactory = inject(EditorManagerFactory);
  private eventbus = inject(OnlyofficeEventbusService);

  // ── 模板引用 ──────────────────────────────────────────
  fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  // ── 狀態訊號（Signals） ───────────────────────────────
  appState = signal<AppState>('idle');
  loadingMessage = signal<string>('');
  errorMessage = signal<string>('');
  fileName = signal<string>('');
  fileType = signal<string>('');
  isReadOnly = signal<boolean>(false);
  isDragOver = signal<boolean>(false);
  showNotification = signal<boolean>(false);
  notificationMessage = signal<string>('');
  notificationType = signal<'success' | 'error' | 'info'>('info');
  isExporting = signal<boolean>(false);

  // ── 計算屬性 ──────────────────────────────────────────
  isIdle = computed(() => this.appState() === 'idle');
  isLoading = computed(() => this.appState() === 'loading');
  isReady = computed(() => this.appState() === 'ready');
  isError = computed(() => this.appState() === 'error');
  hasFile = computed(() => this.fileName() !== '');

  /** 容器 ID */
  readonly containerId = SDK_CONFIG.defaultContainerId;

  /** 允許的副檔名清單（用於顯示） */
  readonly allowedExtensions = ALLOWED_WORD_EXTENSIONS.join('、');

  // ── 事件監聽器（保留引用以便清除） ───────────────────
  private onDocumentReady = (data: DocumentReadyData) => {
    this.fileType.set(data.fileType);
    this.appState.set('ready');
    this.loadingMessage.set('');
    this.notify('文件載入完成，可以開始編輯', 'success');
  };

  private onLoadingChange = (data: LoadingChangeData) => {
    if (data.loading) {
      this.appState.set('loading');
      this.loadingMessage.set(data.message || '載入中...');
    }
  };

  private onSaveDocument = (data: SaveDocumentData) => {
    this.downloadFile(data);
  };

  // ── 生命週期 ──────────────────────────────────────────
  constructor() {
    // 使用 afterNextRender 確保在瀏覽器環境中執行
    afterNextRender(() => {
      this.subscribeEvents();
    });
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    // 清除事件訂閱
    this.eventbus.off(ONLYOFFICE_EVENT_KEYS.DOCUMENT_READY, this.onDocumentReady);
    this.eventbus.off(ONLYOFFICE_EVENT_KEYS.LOADING_CHANGE, this.onLoadingChange);
    this.eventbus.off(ONLYOFFICE_EVENT_KEYS.SAVE_DOCUMENT, this.onSaveDocument);

    // 銷毀編輯器
    this.editorManagerFactory.destroy(this.containerId);

    // 清理 X2t 資源
    this.x2t.cleanup().catch(() => {});
  }

  // ── 私有方法 ──────────────────────────────────────────
  private subscribeEvents(): void {
    this.eventbus.on(ONLYOFFICE_EVENT_KEYS.DOCUMENT_READY, this.onDocumentReady);
    this.eventbus.on(ONLYOFFICE_EVENT_KEYS.LOADING_CHANGE, this.onLoadingChange);
    this.eventbus.on(ONLYOFFICE_EVENT_KEYS.SAVE_DOCUMENT, this.onSaveDocument);
  }

  private downloadFile(data: SaveDocumentData): void {
    try {
      const mimeType = FILE_MIME_MAP[data.fileType] || FILE_MIME_MAP['docx'];
      const blob = new Blob([data.binData], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = data.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      this.isExporting.set(false);
      this.notify(`文件「${data.fileName}」已成功下載`, 'success');
    } catch (err) {
      console.error('[WordEditor] 下載失敗:', err);
      this.isExporting.set(false);
      this.notify('文件下載失敗，請重試', 'error');
    }
  }

  private notify(
    message: string,
    type: 'success' | 'error' | 'info' = 'info',
    duration = 3500
  ): void {
    this.notificationMessage.set(message);
    this.notificationType.set(type);
    this.showNotification.set(true);
    setTimeout(() => this.showNotification.set(false), duration);
  }

  private async loadFile(file: File): Promise<void> {
    const ext = `.${getFileExtension(file.name)}`;
    if (!ALLOWED_WORD_EXTENSIONS.includes(ext)) {
      this.notify(`不支援的檔案格式：${ext}，請上傳 ${this.allowedExtensions} 格式`, 'error', 5000);
      return;
    }

    this.fileName.set(file.name);
    this.appState.set('loading');
    this.loadingMessage.set('正在解析文件...');

    try {
      await this.x2t.createEditorView({
        file,
        fileName: file.name,
        isNew: false,
        readOnly: this.isReadOnly(),
        lang: 'zh',
        containerId: this.containerId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知錯誤';
      this.errorMessage.set(msg);
      this.appState.set('error');
      this.notify(`載入文件失敗：${msg}`, 'error', 6000);
    }
  }

  // ── 公開方法（模板呼叫） ─────────────────────────────

  /** 點擊上傳按鈕 */
  onUploadClick(): void {
    this.fileInput()?.nativeElement.click();
  }

  /** 檔案選擇變更 */
  async onFileChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    await this.loadFile(file);

    // 清除 input 以允許重複選擇同一檔案
    input.value = '';
  }

  /** 拖曳進入 */
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(true);
  }

  /** 拖曳離開 */
  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);
  }

  /** 放下檔案 */
  async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);

    const file = event.dataTransfer?.files?.[0];
    if (!file) return;

    await this.loadFile(file);
  }

  /** 新建文件 */
  async onCreateNew(): Promise<void> {
    const newFileName = '未命名文件.docx';
    this.fileName.set(newFileName);
    this.appState.set('loading');
    this.loadingMessage.set('正在建立新文件...');

    try {
      await this.x2t.createEditorView({
        fileName: newFileName,
        isNew: true,
        readOnly: false,
        lang: 'zh',
        containerId: this.containerId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知錯誤';
      this.errorMessage.set(msg);
      this.appState.set('error');
      this.notify(`建立文件失敗：${msg}`, 'error', 6000);
    }
  }

  /** 匯出/儲存文件 */
  async onExport(): Promise<void> {
    if (this.isExporting()) return;
    this.isExporting.set(true);
    this.notify('正在準備匯出文件...', 'info');

    try {
      const manager = this.editorManagerFactory.get(this.containerId);
      if (!manager?.exists()) {
        throw new Error('編輯器未就緒');
      }
      await manager.export();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知錯誤';
      this.isExporting.set(false);
      this.notify(`匯出失敗：${msg}`, 'error');
    }
  }

  /** 切換唯讀模式 */
  async onToggleReadOnly(): Promise<void> {
    const newReadOnly = !this.isReadOnly();
    this.isReadOnly.set(newReadOnly);

    // 需重新載入編輯器以切換模式
    if (this.isReady()) {
      this.appState.set('loading');
      this.loadingMessage.set(newReadOnly ? '切換至唯讀模式...' : '切換至編輯模式...');

      try {
        await this.x2t.createEditorView({
          fileName: this.fileName(),
          isNew: false,
          readOnly: newReadOnly,
          lang: 'zh',
          containerId: this.containerId,
        });
        this.notify(newReadOnly ? '已切換為唯讀模式' : '已切換為編輯模式', 'info');
      } catch (err) {
        this.isReadOnly.set(!newReadOnly); // 回滾
        this.notify('切換模式失敗', 'error');
      }
    } else {
      this.notify(newReadOnly ? '已切換為唯讀模式（下次載入文件時生效）' : '已切換為編輯模式', 'info');
    }
  }

  /** 重設錯誤，回到初始狀態 */
  onReset(): void {
    this.appState.set('idle');
    this.errorMessage.set('');
    this.fileName.set('');
    this.fileType.set('');
    this.editorManagerFactory.destroy(this.containerId);
    this.x2t.cleanup();
  }
}
