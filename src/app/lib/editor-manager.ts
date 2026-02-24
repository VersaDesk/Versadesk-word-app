import { Injectable } from '@angular/core';
import { OnlyOfficeEditorInstance } from './x2t';
import { SDK_CONFIG } from './const';

/**
 * 單一編輯器實例管理器
 */
export class EditorManager {
  private instance: OnlyOfficeEditorInstance | null = null;
  private _readOnly = false;
  readonly instanceId: string;

  constructor(instanceId: string) {
    this.instanceId = instanceId;
  }

  /**
   * 設定編輯器實例
   */
  set(editor: OnlyOfficeEditorInstance): void {
    this.instance = editor;
  }

  /**
   * 取得編輯器實例
   */
  get(): OnlyOfficeEditorInstance | null {
    return this.instance;
  }

  /**
   * 是否已建立編輯器
   */
  exists(): boolean {
    return this.instance !== null;
  }

  /**
   * 銷毀編輯器實例
   */
  destroy(): void {
    if (this.instance) {
      try {
        this.instance.destroyEditor?.();
      } catch (err) {
        console.warn(`[EditorManager] 銷毀實例 "${this.instanceId}" 時發生錯誤:`, err);
      }
      this.instance = null;
    }

    // 清空容器 DOM
    const container = document.getElementById(this.instanceId);
    if (container) {
      container.innerHTML = '';
    }
  }

  /**
   * 觸發文件儲存/匯出
   * OnlyOffice 會透過 onDownloadAs 事件回傳資料
   */
  async export(): Promise<void> {
    if (!this.instance) {
      throw new Error(`編輯器實例 "${this.instanceId}" 不存在`);
    }

    // 觸發 OnlyOffice 的 downloadAs 命令
    try {
      this.instance.serviceCommand?.('save', { saveAsType: 'docx' });
    } catch {
      // 嘗試另一種方式
      try {
        // 透過 DOM 觸發儲存快捷鍵
        const event = new KeyboardEvent('keydown', {
          key: 's',
          ctrlKey: true,
          bubbles: true
        });
        document.dispatchEvent(event);
      } catch (err) {
        console.error('[EditorManager] 觸發匯出失敗:', err);
      }
    }
  }

  /**
   * 設定唯讀模式
   */
  async setReadOnly(readOnly: boolean): Promise<void> {
    this._readOnly = readOnly;
    // OnlyOffice 不支援動態切換，需重新初始化
    // 此方法由外部的 WordEditorComponent 處理
    console.log(`[EditorManager] 唯讀模式已${readOnly ? '開啟' : '關閉'}`);
  }

  /**
   * 取得目前唯讀狀態
   */
  getReadOnly(): boolean {
    return this._readOnly;
  }
}

/**
 * 編輯器管理器工廠服務
 * 支援單實例與多實例模式
 */
@Injectable({
  providedIn: 'root'
})
export class EditorManagerFactory {
  private managers = new Map<string, EditorManager>();

  /**
   * 建立或取得指定容器 ID 的管理器
   */
  create(containerId: string): EditorManager {
    if (!this.managers.has(containerId)) {
      this.managers.set(containerId, new EditorManager(containerId));
    }
    return this.managers.get(containerId)!;
  }

  /**
   * 取得預設管理器（使用預設容器 ID）
   */
  getDefault(): EditorManager {
    return this.create(SDK_CONFIG.defaultContainerId);
  }

  /**
   * 取得指定容器 ID 的管理器
   */
  get(containerId: string): EditorManager | undefined {
    return this.managers.get(containerId);
  }

  /**
   * 取得所有管理器
   */
  getAll(): Map<string, EditorManager> {
    return this.managers;
  }

  /**
   * 銷毀指定實例
   */
  destroy(containerId: string): void {
    const manager = this.managers.get(containerId);
    if (manager) {
      manager.destroy();
      this.managers.delete(containerId);
    }
  }

  /**
   * 銷毀所有實例
   */
  destroyAll(): void {
    this.managers.forEach(manager => manager.destroy());
    this.managers.clear();
  }
}
