import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CATALOG_URL, parseCatalog } from './catalog';
import { CATALOG_CSV } from './catalog.testing';
import { CATALOG_MIN_ENTRIES, CatalogService } from './catalog.service';
import { AppendResult, DesktopBridgeService, GutenbergDesktop } from './desktop-bridge.service';

const SAVED = JSON.stringify({
  fetchedAt: '2026-10-01',
  entries: [{ id: 1, title: 'A Book', author: 'Someone' }],
});

function fakeDesktop() {
  return {
    getLogPath: vi.fn(async (): Promise<string | null> => null),
    chooseLogPath: vi.fn(async (): Promise<string | null> => null),
    readLog: vi.fn(async (): Promise<string | null> => null),
    appendLog: vi.fn(async (): Promise<AppendResult> => ({ ok: true })),
    saveFile: vi.fn(async () => null),
    openCatalogWindow: vi.fn(async () => undefined),
    openBookInReader: vi.fn(async () => ({ ok: true as const })),
    onOpenBook: vi.fn(() => () => undefined),
    readCatalog: vi.fn(async (): Promise<string | null> => null),
    writeCatalog: vi.fn(async (): Promise<AppendResult> => ({ ok: true })),
  } satisfies GutenbergDesktop;
}

function setup(api: GutenbergDesktop | null, minEntries = 1) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: DesktopBridgeService, useValue: { api } },
      { provide: CATALOG_MIN_ENTRIES, useValue: minEntries },
    ],
  });
  return {
    service: TestBed.inject(CatalogService),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

describe('CatalogService', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 6, 9, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('初期値は空', () => {
    const { service } = setup(fakeDesktop());
    expect(service.entries()).toEqual([]);
    expect(service.fetchedAt()).toBeNull();
    expect(service.loading()).toBe(false);
    expect(service.error()).toBeNull();
  });

  describe('load', () => {
    it('保存した目録を読む', async () => {
      const api = fakeDesktop();
      api.readCatalog.mockResolvedValue(SAVED);
      const { service } = setup(api);
      await service.load();
      expect(service.entries()).toEqual([
        { id: 1, title: 'A Book', author: 'Someone', categories: [] },
      ]);
      expect(service.fetchedAt()).toBe('2026-10-01');
      expect(service.error()).toBeNull();
    });

    it('保存がなければ空のまま', async () => {
      const { service } = setup(fakeDesktop());
      await service.load();
      expect(service.entries()).toEqual([]);
      expect(service.error()).toBeNull();
    });

    it('壊れた JSON ならエラーにする', async () => {
      const api = fakeDesktop();
      api.readCatalog.mockResolvedValue('{broken');
      const { service } = setup(api);
      await service.load();
      expect(service.entries()).toEqual([]);
      expect(service.error()).toBe(
        '保存した目録が壊れています。「目録を取得」で取得し直してください',
      );
    });

    it('読み込みに失敗したら理由をエラーにする', async () => {
      const api = fakeDesktop();
      api.readCatalog.mockRejectedValue(new Error('目録を読み込めませんでした（EACCES）'));
      const { service } = setup(api);
      await service.load();
      expect(service.entries()).toEqual([]);
      expect(service.error()).toBe('目録を読み込めませんでした（EACCES）');
    });

    it('ブラウザ版では何もしない', async () => {
      const { service } = setup(null);
      await service.load();
      expect(service.entries()).toEqual([]);
      expect(service.error()).toBeNull();
    });
  });

  describe('fetch', () => {
    it('取得して保存し、取得中は loading になる', async () => {
      const api = fakeDesktop();
      const { service, httpMock } = setup(api);
      const done = service.fetch();
      expect(service.loading()).toBe(true);
      const req = httpMock.expectOne(CATALOG_URL);
      expect(req.request.responseType).toBe('text');
      req.flush(CATALOG_CSV);
      await done;
      const entries = parseCatalog(CATALOG_CSV);
      expect(service.loading()).toBe(false);
      expect(service.entries()).toEqual(entries);
      expect(service.fetchedAt()).toBe('2026-11-06');
      expect(service.error()).toBeNull();
      expect(api.writeCatalog).toHaveBeenCalledExactlyOnceWith(
        JSON.stringify({ fetchedAt: '2026-11-06', entries }),
      );
      httpMock.verify();
    });

    it('成功したら前のエラーを消す', async () => {
      const api = fakeDesktop();
      api.readCatalog.mockResolvedValue('{broken');
      const { service, httpMock } = setup(api);
      await service.load();
      expect(service.error()).not.toBeNull();
      const done = service.fetch();
      httpMock.expectOne(CATALOG_URL).flush(CATALOG_CSV);
      await done;
      expect(service.error()).toBeNull();
    });

    it('通信に失敗したら前の目録を残してエラーにする', async () => {
      const api = fakeDesktop();
      api.readCatalog.mockResolvedValue(SAVED);
      const { service, httpMock } = setup(api);
      await service.load();
      const done = service.fetch();
      httpMock.expectOne(CATALOG_URL).error(new ProgressEvent('error'));
      await done;
      expect(service.error()).toBe('目録を取得できません（ネットワークを確認してください）');
      expect(service.entries()).toHaveLength(1);
      expect(service.fetchedAt()).toBe('2026-10-01');
      expect(service.loading()).toBe(false);
    });

    it('HTML が返ったら前の目録を残し、保存しない', async () => {
      const api = fakeDesktop();
      api.readCatalog.mockResolvedValue(SAVED);
      const { service, httpMock } = setup(api);
      await service.load();
      const done = service.fetch();
      httpMock.expectOne(CATALOG_URL).flush('<!doctype html><html></html>');
      await done;
      expect(service.error()).toBe('目録の形式が想定と違います');
      expect(service.entries()).toHaveLength(1);
      expect(api.writeCatalog).not.toHaveBeenCalled();
    });

    it('冊数が足りない目録は前の目録を残し、保存しない', async () => {
      const api = fakeDesktop();
      api.readCatalog.mockResolvedValue(SAVED);
      const { service, httpMock } = setup(api, 4);
      await service.load();
      const done = service.fetch();
      httpMock.expectOne(CATALOG_URL).flush(CATALOG_CSV);
      await done;
      expect(service.error()).toBe('目録の形式が想定と違います');
      expect(service.entries()).toHaveLength(1);
      expect(service.fetchedAt()).toBe('2026-10-01');
      expect(api.writeCatalog).not.toHaveBeenCalled();
    });

    it('保存に失敗したら今回の結果を使い、エラーを出す', async () => {
      const api = fakeDesktop();
      api.writeCatalog.mockResolvedValue({
        ok: false,
        message: '目録を保存できませんでした（ENOSPC）',
      });
      const { service, httpMock } = setup(api);
      const done = service.fetch();
      httpMock.expectOne(CATALOG_URL).flush(CATALOG_CSV);
      await done;
      expect(service.entries()).toEqual(parseCatalog(CATALOG_CSV));
      expect(service.error()).toBe(
        '目録を保存できませんでした（ENOSPC）。今回の起動中だけ使います',
      );
    });

    it('取得中に呼んでも要求は 1 回だけ', async () => {
      const { service, httpMock } = setup(fakeDesktop());
      const first = service.fetch();
      const second = service.fetch();
      const reqs = httpMock.match(CATALOG_URL);
      expect(reqs).toHaveLength(1);
      reqs[0].flush(CATALOG_CSV);
      await Promise.all([first, second]);
    });

    it('ブラウザ版では保存せず、エラーも出さない', async () => {
      const { service, httpMock } = setup(null);
      const done = service.fetch();
      httpMock.expectOne(CATALOG_URL).flush(CATALOG_CSV);
      await done;
      expect(service.entries()).toEqual(parseCatalog(CATALOG_CSV));
      expect(service.fetchedAt()).toBe('2026-11-06');
      expect(service.error()).toBeNull();
    });
  });
});
