import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { BookService } from '../../services/book.service';
import { ReadingRecord } from '../../services/reading-log';
import { ReadingLogService } from '../../services/reading-log.service';
import { MAX_HITS } from '../../services/text-search';
import { ReaderComponent } from './reader.component';
import { BOOK, provideFakeCatalog } from './reader.testing';

describe('ReaderComponent（本文の検索）', () => {
  let fixture: ComponentFixture<ReaderComponent>;
  let component: ReaderComponent;
  let bookLoad: ReturnType<typeof vi.fn>;

  const el = () => fixture.nativeElement as HTMLElement;
  const searchInput = () =>
    el().querySelector('input[aria-label="本文を検索"]') as HTMLInputElement;
  const hitButtons = () => Array.from(el().querySelectorAll<HTMLButtonElement>('.search-hit'));

  /** 検索欄に入力して Enter を押す */
  async function searchFor(query: string): Promise<void> {
    searchInput().value = query;
    searchInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    bookLoad = vi.fn(() => of(BOOK));
    TestBed.configureTestingModule({
      imports: [ReaderComponent],
      providers: [
        provideFakeCatalog(),
        { provide: BookService, useValue: { load: bookLoad } },
        {
          provide: ReadingLogService,
          useValue: {
            load: vi.fn(async () => ({ records: [] as ReadingRecord[], badLines: [] as number[] })),
            init: vi.fn(async () => {}),
            logPath: () => null,
          },
        },
      ],
    });
    fixture = TestBed.createComponent(ReaderComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  describe('本を開いたあと', () => {
    beforeEach(async () => {
      await component.openBook('1342');
      await fixture.whenStable();
      fixture.detectChanges();
    });

    it('Enter で検索し、行番号と一致した部分を強調した一覧を出す', async () => {
      await searchFor('truth');
      expect(el().querySelector('.search h2')?.textContent).toContain('2 件');
      const hits = hitButtons();
      expect(hits.map((b) => b.querySelector('.hit-no')?.textContent?.trim())).toEqual(['3', '10']);
      expect(hits[0].querySelector('mark')?.textContent).toBe('truth');
      expect(hits[0].textContent).toContain('It is a truth universally acknowledged,');
    });

    it('一覧の行を押すとその行までスクロールし、本文のその行に色を付ける。範囲は変えない', async () => {
      const viewport = fixture.debugElement.query(By.directive(CdkVirtualScrollViewport))
        .componentInstance as CdkVirtualScrollViewport;
      const scroll = vi.spyOn(viewport, 'scrollToIndex');
      await searchFor('truth');
      hitButtons()[1].click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(scroll).toHaveBeenCalledWith(9);
      expect(component.hitLine()).toBe(10);
      expect(component.startLine()).toBeNull();
      expect(component.endLine()).toBeNull();
    });

    it('色を付けた行は本文で .hit になる', async () => {
      await searchFor('Chapter');
      hitButtons()[0].click();
      await fixture.whenStable();
      fixture.detectChanges();
      const first = el().querySelector('.line') as HTMLElement;
      expect(first.classList).toContain('hit');
    });

    it('見つからなければその旨を出す', async () => {
      await searchFor('zebra');
      expect(hitButtons()).toHaveLength(0);
      expect(el().querySelector('.search')?.textContent).toContain('見つかりませんでした');
    });

    it('空の検索語なら一覧を消す', async () => {
      await searchFor('truth');
      await searchFor('  ');
      expect(component.searchResult()).toBeNull();
      expect(el().querySelector('.search')).toBeNull();
    });

    it('上限を超えたら本当の件数と、先頭だけを出していることを示す', async () => {
      const lines = Array.from({ length: MAX_HITS + 1 }, (_, i) => `word ${i}`);
      bookLoad.mockReturnValue(of({ ...BOOK, id: 1, lines }));
      await component.openBook('1');
      await fixture.whenStable();
      fixture.detectChanges();
      await searchFor('word');
      expect(el().querySelector('.search h2')?.textContent).toContain(
        `${MAX_HITS + 1} 件（先頭 ${MAX_HITS} 件を表示）`,
      );
      expect(hitButtons()).toHaveLength(MAX_HITS);
    });

    it('本を開き直すと検索結果と色を消す', async () => {
      await searchFor('truth');
      hitButtons()[0].click();
      await component.openBook('1342');
      await fixture.whenStable();
      fixture.detectChanges();
      expect(component.searchResult()).toBeNull();
      expect(component.hitLine()).toBeNull();
      expect(hitButtons()).toHaveLength(0);
    });
  });

  it('本を開いていなければ検索せず、その旨を出す', async () => {
    await searchFor('truth');
    expect(component.searchResult()).toBeNull();
    expect(component.message()).toBe('本を開いてから検索してください');
  });

  it('Ctrl+F で検索欄に移り、ブラウザの検索は出さない', () => {
    const event = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, cancelable: true });
    document.dispatchEvent(event);
    expect(document.activeElement).toBe(searchInput());
    expect(event.defaultPrevented).toBe(true);
  });

  it('Mac の ⌘F でも検索欄に移る', () => {
    const event = new KeyboardEvent('keydown', { key: 'f', metaKey: true, cancelable: true });
    document.dispatchEvent(event);
    expect(document.activeElement).toBe(searchInput());
  });
});
