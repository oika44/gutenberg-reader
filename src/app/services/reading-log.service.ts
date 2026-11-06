import { Injectable, inject, signal } from '@angular/core';
import { DesktopBridgeService } from './desktop-bridge.service';
import { LOG_HEADER, ReadingRecord, formatLogLine, parseLog } from './reading-log';

/** 記録ファイルを選ばなかった（キャンセルした）ため記録できない */
export class LogPathNotSetError extends Error {
  constructor() {
    super('記録ファイルが選ばれていないため記録しませんでした');
  }
}

/** 記録ファイルに書き込めなかった */
export class LogWriteError extends Error {}

/** デスクトップ版以外ではファイルに記録できない */
export class DesktopUnavailableError extends Error {
  constructor() {
    super('記録はデスクトップ版でのみ保存できます');
  }
}

const EMPTY = () => ({ records: [] as ReadingRecord[], badLines: [] as number[] });

/** 読書記録 CSV（UTF-8・BOM 付き）の読み書き */
@Injectable({ providedIn: 'root' })
export class ReadingLogService {
  private readonly api = inject(DesktopBridgeService).api;
  private readonly _logPath = signal<string | null>(null);
  readonly logPath = this._logPath.asReadonly();

  async init(): Promise<void> {
    this._logPath.set((await this.api?.getLogPath()) ?? null);
  }

  async changeLogPath(): Promise<void> {
    const path = await this.api?.chooseLogPath();
    if (path) this._logPath.set(path);
  }

  async load(): Promise<{ records: ReadingRecord[]; badLines: number[] }> {
    const path = this._logPath();
    if (!this.api || !path) return EMPTY();
    const text = await this.api.readLog(path);
    return text === null ? EMPTY() : parseLog(text);
  }

  async append(record: ReadingRecord): Promise<void> {
    if (!this.api) throw new DesktopUnavailableError();
    if (!this._logPath()) await this.changeLogPath();
    const path = this._logPath();
    if (!path) throw new LogPathNotSetError();
    const result = await this.api.appendLog(path, '\uFEFF' + LOG_HEADER, formatLogLine(record));
    if (!result.ok) throw new LogWriteError(result.message);
  }
}
