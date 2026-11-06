import { HttpClient } from '@angular/common/http';
import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  CATALOG_URL,
  CatalogData,
  CatalogEntry,
  CatalogFormatError,
  MIN_CATALOG_ENTRIES,
  assertCompleteCatalog,
  parseCatalog,
  parseSavedCatalog,
} from './catalog';
import { DesktopBridgeService } from './desktop-bridge.service';

/** 取得した目録に必要な最小冊数（テストで小さい値に差し替える） */
export const CATALOG_MIN_ENTRIES = new InjectionToken<number>('CATALOG_MIN_ENTRIES', {
  factory: () => MIN_CATALOG_ENTRIES,
});

/** 今日の日付（YYYY-MM-DD、端末の時刻） */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Project Gutenberg の目録の取得・保存・読み込み */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly http = inject(HttpClient);
  private readonly minEntries = inject(CATALOG_MIN_ENTRIES);
  private readonly api = inject(DesktopBridgeService).api;
  private readonly _entries = signal<CatalogEntry[]>([]);
  private readonly _fetchedAt = signal<string | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  readonly entries = this._entries.asReadonly();
  readonly fetchedAt = this._fetchedAt.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /** 保存した目録を読む。ブラウザ版・保存なしなら何もしない */
  async load(): Promise<void> {
    if (!this.api) return;
    let json: string | null;
    try {
      json = await this.api.readCatalog();
    } catch (e) {
      this._error.set(e instanceof Error ? e.message : String(e));
      return;
    }
    if (json === null) return;
    const data = parseSavedCatalog(json);
    if (!data) {
      this._error.set('保存した目録が壊れています。「目録を取得」で取得し直してください');
      return;
    }
    this._entries.set(data.entries);
    this._fetchedAt.set(data.fetchedAt);
    this._error.set(null);
  }

  /** ダウンロードして保存する。loading 中なら何もしない */
  async fetch(): Promise<void> {
    if (this._loading()) return;
    this._loading.set(true);
    this._error.set(null);
    try {
      let entries: CatalogEntry[];
      try {
        const csv = await firstValueFrom(this.http.get(CATALOG_URL, { responseType: 'text' }));
        entries = parseCatalog(csv);
        assertCompleteCatalog(entries, this.minEntries);
      } catch (e) {
        this._error.set(
          e instanceof CatalogFormatError
            ? e.message
            : '目録を取得できません（ネットワークを確認してください）',
        );
        return;
      }
      const data: CatalogData = { fetchedAt: today(), entries };
      this._entries.set(data.entries);
      this._fetchedAt.set(data.fetchedAt);
      if (!this.api) return;
      const result = await this.api.writeCatalog(JSON.stringify(data));
      if (!result.ok) this._error.set(`${result.message}。今回の起動中だけ使います`);
    } finally {
      this._loading.set(false);
    }
  }
}
