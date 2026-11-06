import { TestBed } from '@angular/core/testing';
import { DesktopBridgeService, GutenbergDesktop } from './desktop-bridge.service';
import { LOG_HEADER, ReadingRecord, formatLogLine } from './reading-log';
import {
  DesktopUnavailableError,
  LogPathNotSetError,
  LogWriteError,
  ReadingLogService,
} from './reading-log.service';

const rec: ReadingRecord = {
  recordedAt: '2026-11-03 15:30',
  bookId: 1342,
  title: 'Pride and Prejudice',
  author: 'Jane Austen',
  startLine: 1,
  endLine: 120,
  lines: 104,
  words: 1532,
  lookups: 7,
};

function fakeDesktop(logPath: string | null = '/home/u/log.csv') {
  return {
    getLogPath: vi.fn(async () => logPath),
    chooseLogPath: vi.fn(async (): Promise<string | null> => '/home/u/new.csv'),
    readLog: vi.fn(async (): Promise<string | null> => null),
    appendLog: vi.fn(async () => ({ ok: true }) as const),
    saveFile: vi.fn(async () => null),
    openCatalogWindow: vi.fn(async () => undefined),
    openBookInReader: vi.fn(async () => ({ ok: true as const })),
    onOpenBook: vi.fn(() => () => undefined),
    readCatalog: vi.fn(async (): Promise<string | null> => null),
    writeCatalog: vi.fn(async () => ({ ok: true }) as const),
  } satisfies GutenbergDesktop;
}

function setup(api: GutenbergDesktop | null) {
  TestBed.configureTestingModule({
    providers: [{ provide: DesktopBridgeService, useValue: { api } }],
  });
  return TestBed.inject(ReadingLogService);
}

describe('ReadingLogService', () => {
  it('init で設定済みのパスを読み込む', async () => {
    const service = setup(fakeDesktop());
    await service.init();
    expect(service.logPath()).toBe('/home/u/log.csv');
  });

  it('append: パスが設定済みなら BOM 付き見出しと記録行で追記する', async () => {
    const api = fakeDesktop();
    const service = setup(api);
    await service.init();
    await service.append(rec);
    expect(api.chooseLogPath).not.toHaveBeenCalled();
    expect(api.appendLog).toHaveBeenCalledExactlyOnceWith(
      '/home/u/log.csv',
      '\uFEFF' + LOG_HEADER,
      formatLogLine(rec),
    );
  });

  it('append: パスが未設定なら選ばせてから追記し、logPath も更新する', async () => {
    const api = fakeDesktop(null);
    const service = setup(api);
    await service.init();
    await service.append(rec);
    expect(api.appendLog).toHaveBeenCalledWith(
      '/home/u/new.csv',
      expect.any(String),
      expect.any(String),
    );
    expect(service.logPath()).toBe('/home/u/new.csv');
  });

  it('append: 選ぶのをキャンセルしたら LogPathNotSetError で、追記しない', async () => {
    const api = fakeDesktop(null);
    api.chooseLogPath.mockResolvedValue(null);
    const service = setup(api);
    await service.init();
    await expect(service.append(rec)).rejects.toBeInstanceOf(LogPathNotSetError);
    expect(api.appendLog).not.toHaveBeenCalled();
  });

  it('append: 書き込みに失敗したら LogWriteError（メッセージを含む）', async () => {
    const api = fakeDesktop();
    api.appendLog.mockResolvedValue({
      ok: false,
      message: '書き込めませんでした（EBUSY）',
    } as never);
    const service = setup(api);
    await service.init();
    const error = await service.append(rec).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LogWriteError);
    expect((error as Error).message).toContain('EBUSY');
  });

  it('changeLogPath: 選ばれたパスにする。キャンセルなら変えない', async () => {
    const api = fakeDesktop();
    const service = setup(api);
    await service.init();
    await service.changeLogPath();
    expect(service.logPath()).toBe('/home/u/new.csv');
    api.chooseLogPath.mockResolvedValue(null);
    await service.changeLogPath();
    expect(service.logPath()).toBe('/home/u/new.csv');
  });

  it('load: ファイルが無ければ空', async () => {
    const service = setup(fakeDesktop());
    await service.init();
    expect(await service.load()).toEqual({ records: [], badLines: [] });
  });

  it('load: 内容を parseLog で読む', async () => {
    const api = fakeDesktop();
    api.readLog.mockResolvedValue(LOG_HEADER + '\r\n' + formatLogLine(rec) + '\r\nbroken');
    const service = setup(api);
    await service.init();
    expect(await service.load()).toEqual({ records: [rec], badLines: [3] });
    expect(api.readLog).toHaveBeenCalledWith('/home/u/log.csv');
  });

  it('load: パス未設定なら読まずに空', async () => {
    const api = fakeDesktop(null);
    const service = setup(api);
    await service.init();
    expect(await service.load()).toEqual({ records: [], badLines: [] });
    expect(api.readLog).not.toHaveBeenCalled();
  });

  it('デスクトップ版でなければ load は空、append は DesktopUnavailableError', async () => {
    const service = setup(null);
    await service.init();
    expect(await service.load()).toEqual({ records: [], badLines: [] });
    await expect(service.append(rec)).rejects.toBeInstanceOf(DesktopUnavailableError);
  });
});
