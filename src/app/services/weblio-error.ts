import { HttpErrorResponse } from '@angular/common/http';

/** Weblio との通信エラーの理由（status 0 は接続できない、502 は中継役が接続できなかった） */
export function weblioErrorReason(err: HttpErrorResponse): string {
  return err.status === 0 || err.status === 502
    ? 'Weblio に接続できません（ネットワークを確認してください）'
    : `Weblio がエラーを返しました（${err.status}）`;
}
