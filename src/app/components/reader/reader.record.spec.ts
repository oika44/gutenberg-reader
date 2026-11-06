import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { BookService } from '../../services/book.service';
import { ReadingRecord } from '../../services/reading-log';
import {
  LogPathNotSetError,
  LogWriteError,
  ReadingLogService,
} from '../../services/reading-log.service';
import { countRange } from '../../services/text-count';
import { ReaderComponent } from './reader.component';
import { WordLookupService } from '@pstudy/word-lookup.service';
import { LINES, BOOK, provideFakeCatalog } from './reader.testing';

describe('ReaderComponent（記録する）', () => {
  let component: ReaderComponent;
  let append: ReturnType<typeof vi.fn<(r: ReadingRecord) => Promise<void>>>;
  let records: ReadingRecord[];

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 3, 15, 30));
    records = [];
    append = vi.fn(async () => {});
    TestBed.configureTestingModule({
      imports: [ReaderComponent],
      providers: [
        provideFakeCatalog(),
        { provide: BookService, useValue: { load: () => of(BOOK) } },
        {
          provide: ReadingLogService,
          useValue: {
            load: async () => ({ records, badLines: [] }),
            init: vi.fn(async () => {}),
            logPath: () => '/home/u/log.csv',
            changeLogPath: vi.fn(async () => {}),
            append,
          },
        },
        {
          provide: WordLookupService,
          useValue: {
            lookup: (word: string) =>
              of({ word, meaning: '訳', example: '', pronunciation: '', audioUrl: '' }),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(ReaderComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
    await component.openBook('1342');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('起動時に記録ファイルの設定を読み込む', () => {
    expect(TestBed.inject(ReadingLogService).init).toHaveBeenCalled();
  });

  it('終了行が決まるまでは記録できない', () => {
    expect(component.canRecord()).toBe(false);
    component.clickLine(3);
    expect(component.canRecord()).toBe(false);
    component.clickLine(7);
    expect(component.canRecord()).toBe(true);
  });

  it('記録すると 1 行追記し、調べた単語数を 0 に、次の開始行を終了行の次にする', async () => {
    component.clickLine(3);
    component.clickLine(7);
    await component.lookupWord('truth');
    await component.lookupWord('fortune');
    await component.record();
    expect(append).toHaveBeenCalledExactlyOnceWith({
      recordedAt: '2026-11-03 15:30',
      bookId: 1342,
      title: 'Pride and Prejudice',
      author: 'Jane Austen',
      startLine: 3,
      endLine: 7,
      ...countRange(LINES, 3, 7),
      lookups: 2,
    });
    expect(component.lookupCount()).toBe(0);
    expect(component.startLine()).toBe(8);
    expect(component.endLine()).toBeNull();
  });

  it('最後の行まで記録したら開始行は未定にする', async () => {
    component.clickLine(9);
    component.clickLine(10);
    await component.record();
    expect(component.startLine()).toBeNull();
  });

  it('同じ範囲が記録済みで、確認でやめたら追記しない', async () => {
    records = [
      {
        ...countRange(LINES, 3, 7),
        recordedAt: '',
        bookId: 1342,
        title: '',
        author: '',
        startLine: 3,
        endLine: 7,
        lookups: 0,
      },
    ];
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    component.clickLine(3);
    component.clickLine(7);
    await component.record();
    expect(confirm).toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
    expect(component.endLine()).toBe(7);
  });

  it('同じ範囲が記録済みでも、確認で OK なら追記する', async () => {
    records = [
      {
        ...countRange(LINES, 3, 7),
        recordedAt: '',
        bookId: 1342,
        title: '',
        author: '',
        startLine: 3,
        endLine: 7,
        lookups: 0,
      },
    ];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    component.clickLine(3);
    component.clickLine(7);
    await component.record();
    expect(append).toHaveBeenCalled();
  });

  it('書き込みに失敗したら理由を出し、範囲と調べた単語数を残す', async () => {
    append.mockRejectedValue(new LogWriteError('書き込めませんでした（EBUSY）'));
    component.clickLine(3);
    component.clickLine(7);
    await component.lookupWord('truth');
    await component.record();
    expect(component.message()).toBe('書き込めませんでした（EBUSY）');
    expect([component.startLine(), component.endLine(), component.lookupCount()]).toEqual([
      3, 7, 1,
    ]);
  });

  it('記録ファイルを選ばなかったら記録せず、入力を残す', async () => {
    append.mockRejectedValue(new LogPathNotSetError());
    component.clickLine(3);
    component.clickLine(7);
    await component.record();
    expect(component.message()).toBe('記録ファイルが選ばれていないため記録しませんでした');
    expect(component.endLine()).toBe(7);
  });
});
