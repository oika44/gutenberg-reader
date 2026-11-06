import { Injectable } from '@angular/core';

export type AppendResult = { ok: true } | { ok: false; message: string };
export type SaveResult = { ok: true; path: string } | { ok: false; message: string };

/** Electron の preload（electron/preload.cjs）が window.gutenbergDesktop として公開する API */
export interface GutenbergDesktop {
  getLogPath(): Promise<string | null>;
  /** ダイアログで記録ファイルを選び、設定に保存する。キャンセルなら null */
  chooseLogPath(): Promise<string | null>;
  /** 記録ファイルの内容。ファイルが無ければ null */
  readLog(path: string): Promise<string | null>;
  /** ファイルが無ければ見出し付きで作成し、1 行追記する */
  appendLog(path: string, header: string, line: string): Promise<AppendResult>;
  /** 目録（JSON 文字列）。まだ保存していなければ null。読めないときは理由をメッセージにした Error を投げる */
  readCatalog(): Promise<string | null>;
  /** 目録（JSON 文字列）を userData に保存する。保存先は固定で、画面からは指定できない */
  writeCatalog(json: string): Promise<AppendResult>;
  /** ダイアログで保存先を選んで保存する。キャンセルなら null */
  saveFile(defaultName: string, data: Uint8Array): Promise<SaveResult | null>;
  /** 目録の一覧ウインドウを開く。すでに開いていれば前に出す */
  openCatalogWindow(): Promise<void>;
  /** 読書ウインドウに本（番号）を開かせる。読書ウインドウが開いていなければ ok: false */
  openBookInReader(id: number): Promise<AppendResult>;
  /** 一覧から「開く」が押されたときの通知を受け取る。戻り値の関数で購読を解除する */
  onOpenBook(callback: (id: number) => void): () => void;
}

declare global {
  interface Window {
    gutenbergDesktop?: GutenbergDesktop;
  }
}

/** デスクトップ版の API を包む。ブラウザで動かしているときは api が null */
@Injectable({ providedIn: 'root' })
export class DesktopBridgeService {
  readonly api: GutenbergDesktop | null = window.gutenbergDesktop ?? null;
}
