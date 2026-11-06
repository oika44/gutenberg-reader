import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { parseTranslations } from './title-translation';
import { weblioErrorReason } from './weblio-error';

/** 英訳を取得できなかった（通信の失敗）。message は画面に出す理由 */
export class TitleTranslationError extends Error {}

/**
 * 日本語の題名を Weblio の和英で英訳する。
 * CORS 回避のため、中継役（Electron の main、開発時は proxy.conf.json）の /weblio/ 経由で取得する。
 */
@Injectable({ providedIn: 'root' })
export class TitleTranslationService {
  private readonly http = inject(HttpClient);

  /** 英訳の候補。Weblio に無い語（404）なら空の配列。通信に失敗したら TitleTranslationError */
  async translate(title: string): Promise<string[]> {
    try {
      const html = await firstValueFrom(
        this.http.get(`/weblio/${encodeURIComponent(title.trim())}`, { responseType: 'text' }),
      );
      return parseTranslations(html);
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        if (err.status === 404) return [];
        throw new TitleTranslationError(weblioErrorReason(err));
      }
      throw err;
    }
  }
}
