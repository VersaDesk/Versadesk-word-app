import { Injectable } from '@angular/core';
import { ONLYOFFICE_EVENT_KEYS, OnlyofficeEventKey } from './const';

// 事件資料類型定義
export interface SaveDocumentData {
  /** 檔案名稱 */
  fileName: string;
  /** 檔案類型（如 'docx'） */
  fileType: string;
  /** 二進位資料 */
  binData: Uint8Array;
  /** 實例 ID（多實例模式下用於事件匹配） */
  instanceId: string;
  /** 媒體檔案映射 */
  media?: Record<string, string>;
}

export interface DocumentReadyData {
  /** 檔案名稱 */
  fileName: string;
  /** 檔案類型 */
  fileType: string;
}

export interface LoadingChangeData {
  /** 是否正在載入 */
  loading: boolean;
  /** 載入訊息 */
  message?: string;
}

// 事件資料聯合類型
export type EventDataMap = {
  [ONLYOFFICE_EVENT_KEYS.SAVE_DOCUMENT]: SaveDocumentData;
  [ONLYOFFICE_EVENT_KEYS.DOCUMENT_READY]: DocumentReadyData;
  [ONLYOFFICE_EVENT_KEYS.LOADING_CHANGE]: LoadingChangeData;
};

type EventListener<T = unknown> = (data: T) => void;

/**
 * OnlyOffice 事件總線服務
 * 使用發佈/訂閱模式處理編輯器狀態變化和文件操作事件
 */
@Injectable({
  providedIn: 'root'
})
export class OnlyofficeEventbusService {
  private listeners = new Map<string, Set<EventListener>>();

  /**
   * 訂閱事件
   */
  on<K extends OnlyofficeEventKey>(
    event: K,
    listener: EventListener<EventDataMap[K]>
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as EventListener);
  }

  /**
   * 取消訂閱事件
   */
  off<K extends OnlyofficeEventKey>(
    event: K,
    listener: EventListener<EventDataMap[K]>
  ): void {
    this.listeners.get(event)?.delete(listener as EventListener);
  }

  /**
   * 發布事件
   */
  emit<K extends OnlyofficeEventKey>(
    event: K,
    data: EventDataMap[K]
  ): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (err) {
          console.error(`[EventBus] 事件處理器錯誤 (${event}):`, err);
        }
      });
    }
  }

  /**
   * 等待事件觸發（返回 Promise）
   * @param event 事件名稱
   * @param timeout 超時時間（毫秒），預設 30000ms
   */
  waitFor<K extends OnlyofficeEventKey>(
    event: K,
    timeout = 30000
  ): Promise<EventDataMap[K]> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off(event, listener);
        reject(new Error(`等待事件 "${event}" 超時（${timeout}ms）`));
      }, timeout);

      const listener = (data: EventDataMap[K]) => {
        clearTimeout(timer);
        this.off(event, listener);
        resolve(data);
      };

      this.on(event, listener);
    });
  }

  /**
   * 清除所有事件監聽器
   */
  clear(): void {
    this.listeners.clear();
  }

  /**
   * 清除特定事件的所有監聽器
   */
  clearEvent(event: OnlyofficeEventKey): void {
    this.listeners.delete(event);
  }
}
