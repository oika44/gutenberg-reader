import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TitleTranslationError, TitleTranslationService } from './title-translation.service';
import { weblioPage } from './title-translation.testing';

describe('TitleTranslationService', () => {
  let service: TitleTranslationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TitleTranslationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('題名をエンコードして中継（/weblio/...）から取得し、英訳の候補を返す', async () => {
    const result = service.translate('若草物語');
    const req = httpMock.expectOne(`/weblio/${encodeURIComponent('若草物語')}`);
    expect(req.request.responseType).toBe('text');
    req.flush(weblioPage('Little Women (1994 film)、Little Women'));
    await expect(result).resolves.toEqual(['Little Women']);
  });

  it('前後の空白を除いてから問い合わせる', async () => {
    const result = service.translate('  白鯨 ');
    httpMock.expectOne(`/weblio/${encodeURIComponent('白鯨')}`).flush(weblioPage('Moby Dick'));
    await expect(result).resolves.toEqual(['Moby Dick']);
  });

  it('訳が無いページなら空の配列', async () => {
    const result = service.translate('ほげほげ');
    httpMock.expectOne(() => true).flush('<html><body></body></html>');
    await expect(result).resolves.toEqual([]);
  });

  it('Weblio に無い語（404）なら、失敗ではなく空の配列', async () => {
    const result = service.translate('ほげほげ');
    httpMock.expectOne(() => true).flush('', { status: 404, statusText: 'Not Found' });
    await expect(result).resolves.toEqual([]);
  });

  it.each([
    [0, 'Weblio に接続できません（ネットワークを確認してください）'],
    [502, 'Weblio に接続できません（ネットワークを確認してください）'],
    [500, 'Weblio がエラーを返しました（500）'],
  ])('通信に失敗したら（status %i）理由付きの TitleTranslationError', async (status, message) => {
    const result = service.translate('白鯨');
    httpMock.expectOne(() => true).flush('', { status, statusText: 'error' });
    await expect(result).rejects.toBeInstanceOf(TitleTranslationError);
    await expect(result).rejects.toThrow(message);
  });
});
