import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { By } from '@angular/platform-browser';
import { Observable, of, throwError } from 'rxjs';
import { Book, BookFetchError, BookService } from '../../services/book.service';
import { ReadingRecord } from '../../services/reading-log';
import { ReadingLogService } from '../../services/reading-log.service';
import { countRange } from '../../services/text-count';
import { ReaderComponent } from './reader.component';
import { LINES, BOOK, record, provideFakeCatalog } from './reader.testing';

describe('ReaderComponent（本を開く・範囲指定）', () => {
  let fixture: ComponentFixture<ReaderComponent>;
  let component: ReaderComponent;
  let bookLoad: ReturnType<typeof vi.fn<(id: number) => Observable<Book>>>;
  let logLoad: ReturnType<
    typeof vi.fn<() => Promise<{ records: ReadingRecord[]; badLines: number[] }>>
  >;

  beforeEach(async () => {
    bookLoad = vi.fn(() => of(BOOK));
    logLoad = vi.fn(async () => ({ records: [] as ReadingRecord[], badLines: [] as number[] }));
    TestBed.configureTestingModule({
      imports: [ReaderComponent],
      providers: [
        provideFakeCatalog(),
        { provide: BookService, useValue: { load: bookLoad } },
        {
          provide: ReadingLogService,
          useValue: { load: logLoad, init: vi.fn(async () => {}), logPath: () => null },
        },
      ],
    });
    fixture = TestBed.createComponent(ReaderComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('目録の結果を押すと、その番号の本を開く', async () => {
    const input = fixture.nativeElement.querySelector(
      'input[aria-label="本の番号か URL"]',
    ) as HTMLInputElement;
    const search = fixture.nativeElement.querySelector(
      'input[aria-label="題名・著者で検索（英語の本）"]',
    ) as HTMLInputElement;
    search.value = 'pride';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
    const result = fixture.nativeElement.querySelector('.catalog-result') as HTMLButtonElement;
    expect(result.textContent).toContain('#1342');
    result.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(bookLoad).toHaveBeenCalledWith(1342);
    expect(input.value).toBe('1342');
    expect(fixture.nativeElement.querySelector('.book-title').textContent).toContain(
      'Pride and Prejudice',
    );
  });

  it('番号でも URL でもない入力は案内を出し、取得しない', async () => {
    await component.openBook('abc');
    expect(component.message()).toBe('本の番号か URL を入力してください');
    expect(bookLoad).not.toHaveBeenCalled();
  });

  it('本を開く。記録がなければ開始行は未定', async () => {
    await component.openBook('1342');
    expect(bookLoad).toHaveBeenCalledWith(1342);
    expect(component.book()).toEqual(BOOK);
    expect(component.startLine()).toBeNull();
    expect(component.message()).toBe('');
  });

  it('取得に失敗したらエラーを表示し、本は開かない', async () => {
    bookLoad.mockReturnValue(throwError(() => new BookFetchError(99999999)));
    await component.openBook('99999999');
    expect(component.message()).toBe('本を取得できませんでした（番号99999999）');
    expect(component.book()).toBeNull();
  });

  it('目印がない本は全体を表示している旨を出す', async () => {
    bookLoad.mockReturnValue(of({ ...BOOK, markersFound: false }));
    await component.openBook('1342');
    expect(component.message()).toBe('本文の範囲を判別できなかったため全体を表示しています');
  });

  it('しおり: 前回の終了行の次の行を開始行にして、そこまでスクロールする', async () => {
    logLoad.mockResolvedValue({ records: [record(4)], badLines: [] });
    const viewport = fixture.debugElement.query(By.directive(CdkVirtualScrollViewport))
      .componentInstance as CdkVirtualScrollViewport;
    const scroll = vi.spyOn(viewport, 'scrollToIndex');
    await component.openBook('1342');
    await fixture.whenStable();
    expect(component.startLine()).toBe(5);
    expect(scroll).toHaveBeenCalledWith(4);
  });

  it('しおりが本の行数を超えたら開始行を決めず、記録済みと知らせる', async () => {
    logLoad.mockResolvedValue({ records: [record(10)], badLines: [] });
    await component.openBook('1342');
    expect(component.startLine()).toBeNull();
    expect(component.message()).toBe('最後まで記録済みです');
  });

  it('記録ファイルの読めない行を警告する', async () => {
    logLoad.mockResolvedValue({ records: [], badLines: [3] });
    await component.openBook('1342');
    expect(component.message()).toContain('記録ファイルの3行目を読めませんでした');
  });

  describe('clickLine', () => {
    beforeEach(async () => {
      await component.openBook('1342');
    });

    it('1 回目で開始行、2 回目で終了行。集計を出す', () => {
      component.clickLine(3);
      expect(component.stats()).toBeNull();
      component.clickLine(7);
      expect([component.startLine(), component.endLine()]).toEqual([3, 7]);
      expect(component.stats()).toEqual(countRange(LINES, 3, 7));
    });

    it('開始行より前をクリックしたら開始行にし直す', () => {
      component.clickLine(3);
      component.clickLine(1);
      expect([component.startLine(), component.endLine()]).toEqual([1, null]);
    });

    it('両方決まっていたら新しい開始行にして終了行を未定に戻す', () => {
      component.clickLine(3);
      component.clickLine(7);
      component.clickLine(5);
      expect([component.startLine(), component.endLine()]).toEqual([5, null]);
    });

    it('開始行と同じ行で終了してもよい（1 行の範囲）', () => {
      component.clickLine(3);
      component.clickLine(3);
      expect(component.stats()).toEqual({ lines: 1, words: 6 });
    });
  });
});
