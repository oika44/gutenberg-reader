import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { Book, BookService } from '../../services/book.service';
import { DesktopBridgeService, GutenbergDesktop } from '../../services/desktop-bridge.service';
import { ReadingLogService } from '../../services/reading-log.service';
import { ReaderComponent } from './reader.component';
import { BOOK, provideFakeCatalog } from './reader.testing';

describe('ReaderComponent（目録の一覧ウインドウ）', () => {
  let bookLoad: ReturnType<typeof vi.fn<(id: number) => Observable<Book>>>;

  async function create(
    api: Partial<GutenbergDesktop> | null,
  ): Promise<ComponentFixture<ReaderComponent>> {
    bookLoad = vi.fn((id: number) => of({ ...BOOK, id }));
    TestBed.configureTestingModule({
      imports: [ReaderComponent],
      providers: [
        provideFakeCatalog(),
        { provide: BookService, useValue: { load: bookLoad } },
        {
          provide: ReadingLogService,
          useValue: {
            load: async () => ({ records: [], badLines: [] }),
            init: async () => {},
            logPath: () => null,
          },
        },
        { provide: DesktopBridgeService, useValue: { api } },
      ],
    });
    const fixture = TestBed.createComponent(ReaderComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const findButton = (fixture: ComponentFixture<ReaderComponent>) =>
    Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((b) => b.textContent?.trim() === '目録の一覧');

  it('「目録の一覧」を押すと一覧ウインドウを 1 回開く', async () => {
    const openCatalogWindow = vi.fn(async () => {});
    const fixture = await create({ openCatalogWindow, onOpenBook: vi.fn(() => () => {}) });
    findButton(fixture)!.click();
    await fixture.whenStable();
    expect(openCatalogWindow).toHaveBeenCalledTimes(1);
  });

  it('一覧ウインドウを開けなければ理由を表示する', async () => {
    const openCatalogWindow = vi.fn(async () => Promise.reject(new Error('開けない')));
    const fixture = await create({ openCatalogWindow, onOpenBook: vi.fn(() => () => {}) });
    findButton(fixture)!.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.message()).toBe('目録の一覧を開けませんでした（開けない）');
  });

  it('ブラウザ版（api が null）では「目録の一覧」を出さない', async () => {
    const fixture = await create(null);
    expect(findButton(fixture)).toBeUndefined();
  });

  it('生成時に onOpenBook を 1 回登録し、呼ばれたら番号を入れて本を開く', async () => {
    const onOpenBook = vi.fn<GutenbergDesktop['onOpenBook']>(() => () => {});
    const fixture = await create({ openCatalogWindow: async () => {}, onOpenBook });
    expect(onOpenBook).toHaveBeenCalledTimes(1);
    onOpenBook.mock.calls[0][0](1342);
    await fixture.whenStable();
    const input = fixture.nativeElement.querySelector(
      'input[aria-label="本の番号か URL"]',
    ) as HTMLInputElement;
    expect(input.value).toBe('1342');
    expect(bookLoad).toHaveBeenCalledWith(1342);
  });

  it('破棄すると onOpenBook の解除の関数を 1 回呼ぶ', async () => {
    const unsubscribe = vi.fn();
    const fixture = await create({
      openCatalogWindow: async () => {},
      onOpenBook: vi.fn(() => unsubscribe),
    });
    expect(unsubscribe).not.toHaveBeenCalled();
    fixture.destroy();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
