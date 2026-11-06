import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subject, of, throwError } from 'rxjs';
import { BookService } from '../../services/book.service';
import { ReadingLogService } from '../../services/reading-log.service';
import { ReaderComponent } from './reader.component';
import {
  DictionaryResult,
  WordLookupService,
  WordNotFoundError,
} from '@pstudy/word-lookup.service';
import { PStudyBuilderService } from '@pstudy/pstudy-builder.service';
import { DesktopBridgeService, GutenbergDesktop } from '../../services/desktop-bridge.service';
import { BOOK, provideFakeCatalog } from './reader.testing';

describe('ReaderComponent（単語を調べる・P-Study 用 CSV）', () => {
  let component: ReaderComponent;
  let lookup: ReturnType<typeof vi.fn<(word: string) => Observable<DictionaryResult>>>;
  let saveFile: ReturnType<typeof vi.fn<GutenbergDesktop['saveFile']>>;

  const result = (word: string): DictionaryResult => ({
    word,
    meaning: 'りんご',
    example: '',
    pronunciation: '/ǽpl/',
    audioUrl: '',
  });

  beforeEach(async () => {
    lookup = vi.fn((word: string) => of(result(word)));
    saveFile = vi.fn<GutenbergDesktop['saveFile']>(async () => ({ ok: true, path: '/x.csv' }));
    TestBed.configureTestingModule({
      imports: [ReaderComponent],
      providers: [
        provideFakeCatalog(),
        { provide: BookService, useValue: { load: () => of(BOOK) } },
        {
          provide: ReadingLogService,
          useValue: {
            load: async () => ({ records: [], badLines: [] }),
            init: async () => {},
            logPath: () => null,
          },
        },
        { provide: WordLookupService, useValue: { lookup } },
        {
          provide: DesktopBridgeService,
          useValue: { api: { saveFile, onOpenBook: vi.fn(() => () => {}) } },
        },
      ],
    });
    const fixture = TestBed.createComponent(ReaderComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('調べた単語を表示し、P-Study リストに入れ、1 と数える', async () => {
    await component.lookupWord('“Apple,”');
    expect(lookup).toHaveBeenCalledWith('Apple');
    expect(component.lastResult()?.meaning).toBe('りんご');
    expect(TestBed.inject(PStudyBuilderService).count()).toBe(1);
    expect(component.lookupCount()).toBe(1);
  });

  it('同じ単語（大文字・小文字違い）は 1 回と数え、リストにも 1 件だけ', async () => {
    await component.lookupWord('Apple');
    await component.lookupWord('apple');
    expect(component.lookupCount()).toBe(1);
    expect(TestBed.inject(PStudyBuilderService).count()).toBe(1);
  });

  it('見つからない単語は数えるが、リストには入れない', async () => {
    lookup.mockReturnValue(throwError(() => new WordNotFoundError('qwzx')));
    await component.lookupWord('qwzx');
    expect(component.message()).toBe('「qwzx」は見つかりませんでした');
    expect(component.lookupCount()).toBe(1);
    expect(TestBed.inject(PStudyBuilderService).count()).toBe(0);
  });

  it('通信の失敗は数えない', async () => {
    lookup.mockReturnValue(throwError(() => new Error('通信に失敗しました')));
    await component.lookupWord('apple');
    expect(component.message()).toContain('通信に失敗しました');
    expect(component.lookupCount()).toBe(0);
  });

  it('空白や記号だけの選択では調べない', async () => {
    await component.lookupWord('  ');
    await component.lookupWord('—');
    expect(lookup).not.toHaveBeenCalled();
  });

  it('P-Study 用 CSV を保存する', async () => {
    await component.lookupWord('apple');
    await component.savePStudy('SJIS');
    expect(saveFile).toHaveBeenCalledWith('pstudy_words.csv', expect.any(Uint8Array));
  });

  it('P-Study 用 CSV を保存できなければ理由を出す', async () => {
    saveFile.mockResolvedValue({ ok: false, message: '書き込めませんでした（EACCES）' });
    await component.lookupWord('apple');
    await component.savePStudy('UTF8');
    expect(component.message()).toBe('書き込めませんでした（EACCES）');
  });
});

describe('ReaderComponent（単語を調べているときの表示）', () => {
  let component: ReaderComponent;
  let lookup: ReturnType<typeof vi.fn<(word: string) => Observable<DictionaryResult>>>;

  beforeEach(async () => {
    lookup = vi.fn();
    TestBed.configureTestingModule({
      imports: [ReaderComponent],
      providers: [
        provideFakeCatalog(),
        { provide: BookService, useValue: { load: () => of(BOOK) } },
        {
          provide: ReadingLogService,
          useValue: {
            load: async () => ({ records: [], badLines: [] }),
            init: async () => {},
            logPath: () => null,
          },
        },
        { provide: WordLookupService, useValue: { lookup } },
      ],
    });
    const fixture = TestBed.createComponent(ReaderComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('調べている間は対象の単語を lookingUp に出し、終わったら消す', async () => {
    const response = new Subject<DictionaryResult>();
    lookup.mockReturnValue(response);
    const done = component.lookupWord('apple');
    expect(component.lookingUp()).toBe('apple');
    response.next({
      word: 'apple',
      meaning: 'りんご',
      example: '',
      pronunciation: '',
      audioUrl: '',
    });
    response.complete();
    await done;
    expect(component.lookingUp()).toBeNull();
  });

  it.each([0, 502])(
    'Weblio に接続できない（status %i）ときは日本語で理由を出し、数えない',
    async (status) => {
      lookup.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({ status, url: '/weblio/apple', error: '接続できませんでした' }),
        ),
      );
      await component.lookupWord('apple');
      expect(component.message()).toBe(
        '「apple」を調べられませんでした。Weblio に接続できません（ネットワークを確認してください）',
      );
      expect(component.lookupCount()).toBe(0);
      expect(component.lookingUp()).toBeNull();
    },
  );
});
