import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { Book, BookService } from '../../services/book.service';
import { ReadingRecord } from '../../services/reading-log';
import { ReadingLogService } from '../../services/reading-log.service';
import { ReaderComponent } from './reader.component';
import { DictionaryResult, WordLookupService } from '@pstudy/word-lookup.service';
import { DesktopBridgeService, GutenbergDesktop } from '../../services/desktop-bridge.service';
import { BOOK, provideFakeCatalog } from './reader.testing';

describe('ReaderComponent（レビュー指摘の修正）', () => {
  beforeAll(() => {
    // jsdom には scrollTo がない（仮想スクロールのしおり位置への移動で呼ばれる）
    Element.prototype.scrollTo ??= () => {};
  });

  let fixture: ComponentFixture<ReaderComponent>;
  let component: ReaderComponent;
  let append: ReturnType<typeof vi.fn<(r: ReadingRecord) => Promise<void>>>;
  let logLoad: ReturnType<
    typeof vi.fn<() => Promise<{ records: ReadingRecord[]; badLines: number[] }>>
  >;
  let bookLoad: ReturnType<typeof vi.fn<(id: number) => Observable<Book>>>;
  let saveFile: ReturnType<typeof vi.fn<GutenbergDesktop['saveFile']>>;
  let lookup: ReturnType<typeof vi.fn<(word: string) => Observable<DictionaryResult>>>;

  beforeEach(async () => {
    append = vi.fn(async () => {});
    logLoad = vi.fn(async () => ({ records: [] as ReadingRecord[], badLines: [] as number[] }));
    bookLoad = vi.fn((id: number) => of({ ...BOOK, id }));
    saveFile = vi.fn<GutenbergDesktop['saveFile']>(async () => ({ ok: true, path: '/x.csv' }));
    lookup = vi.fn((word: string) =>
      of({ word, meaning: '訳', example: '', pronunciation: '', audioUrl: '' }),
    );
    TestBed.configureTestingModule({
      imports: [ReaderComponent],
      providers: [
        provideFakeCatalog(),
        { provide: BookService, useValue: { load: bookLoad } },
        {
          provide: ReadingLogService,
          useValue: { load: logLoad, init: async () => {}, logPath: () => null, append },
        },
        { provide: WordLookupService, useValue: { lookup } },
        {
          provide: DesktopBridgeService,
          useValue: { api: { saveFile, onOpenBook: vi.fn(() => () => {}) } },
        },
      ],
    });
    fixture = TestBed.createComponent(ReaderComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('「記録する」の連打では 1 回しか追記しない', async () => {
    let finish!: () => void;
    append.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
    await component.openBook('1342');
    component.clickLine(3);
    component.clickLine(7);
    const first = component.record();
    const second = component.record();
    await Promise.resolve();
    await Promise.resolve();
    expect(component.canRecord()).toBe(false);
    finish();
    await Promise.all([first, second]);
    expect(append).toHaveBeenCalledTimes(1);
  });

  it('記録ファイルを読めなくても本は開き、理由を表示する', async () => {
    logLoad.mockRejectedValue(new Error('EACCES'));
    await component.openBook('1342');
    expect(component.book()).not.toBeNull();
    expect(component.startLine()).toBeNull();
    expect(component.message()).toContain('記録ファイルを読めませんでした');
    expect(component.message()).toContain('EACCES');
  });

  it('P-Study 用 CSV の保存で例外が起きたら理由を表示する', async () => {
    saveFile.mockRejectedValue(new Error('IPC が失敗しました'));
    await component.lookupWord('apple');
    await component.savePStudy('SJIS');
    expect(component.message()).toContain('IPC が失敗しました');
  });

  it('別の本を開いたら調べた単語数を 0 に戻す。同じ本を開き直したら残す', async () => {
    await component.openBook('1342');
    await component.lookupWord('apple');
    await component.openBook('1342');
    expect(component.lookupCount()).toBe(1);
    await component.openBook('84');
    expect(component.lookupCount()).toBe(0);
  });

  it('行番号のダブルクリックでは単語を調べない', async () => {
    await component.openBook('1342');
    fixture.detectChanges();
    await fixture.whenStable();
    const lineNo: HTMLElement = fixture.nativeElement.querySelector('.line-no');
    expect(lineNo).not.toBeNull();
    vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => '1' } as Selection);
    lineNo.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await fixture.whenStable();
    expect(lookup).not.toHaveBeenCalled();
  });

  it('本文のダブルクリックでは選んだ単語を調べる', async () => {
    await component.openBook('1342');
    fixture.detectChanges();
    await fixture.whenStable();
    const text: HTMLElement = fixture.nativeElement.querySelector('.line-text');
    vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'Chapter' } as Selection);
    text.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await fixture.whenStable();
    expect(lookup).toHaveBeenCalledWith('Chapter');
  });
});
