import { TestBed } from '@angular/core/testing';
import { CatalogEntry } from '../../services/catalog';
import { CatalogService } from '../../services/catalog.service';
import { DesktopBridgeService } from '../../services/desktop-bridge.service';
import { createFakeCatalog } from '../catalog-search/catalog-search.testing';
import { CatalogListComponent } from './catalog-list.component';

const entries: CatalogEntry[] = [
  { id: 3, title: 'b Tale', author: 'Zed', categories: ['Novels'] },
  { id: 1, title: 'A Tale', author: 'amy', categories: ['Novels', 'Poetry'] },
  { id: 2, title: 'c Poems', author: 'Bob', categories: ['Poetry'] },
  { id: 4, title: 'Old', author: 'Old', categories: [] },
];

type OpenResult = { ok: true } | { ok: false; message: string };

describe('CatalogListComponent', () => {
  function create(options: { withEntries?: boolean; noApi?: boolean } = {}) {
    const { withEntries = true, noApi = false } = options;
    const fake = createFakeCatalog();
    if (withEntries) {
      fake.entries.set(entries);
      fake.fetchedAt.set('2026-11-06');
    }
    const openBookInReader = vi.fn<(id: number) => Promise<OpenResult>>(async () => ({
      ok: true,
    }));
    TestBed.configureTestingModule({
      imports: [CatalogListComponent],
      providers: [
        { provide: CatalogService, useValue: fake },
        {
          provide: DesktopBridgeService,
          useValue: { api: noApi ? null : { openBookInReader } },
        },
      ],
    });
    const fixture = TestBed.createComponent(CatalogListComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const component = fixture.componentInstance;
    const ids = () => component.rows().map((e) => e.id);
    const text = () => el.textContent ?? '';
    const count = () => el.querySelector('.count')?.textContent?.trim();
    const select = (label: string, value: string) => {
      const s = el.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;
      s.value = value;
      s.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    };
    const type = (value: string) => {
      const input = el.querySelector(
        'input[aria-label="題名・著者で絞り込む"]',
      ) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    return { fake, fixture, el, component, openBookInReader, ids, text, count, select, type };
  }

  it('生成時に load を 1 回呼ぶ', () => {
    const { fake } = create();
    expect(fake.load).toHaveBeenCalledTimes(1);
  });

  it('目録が空なら「目録を取得」を出す', () => {
    const { el } = create({ withEntries: false });
    const status = el.querySelector('app-catalog-status') as HTMLElement;
    expect(status.textContent).toContain('目録を取得');
  });

  it('件数と分類の選択肢を出す', () => {
    const { count, el } = create();
    expect(count()).toBe('4 冊');
    const options = Array.from(el.querySelectorAll('select[aria-label="分類"] option')).map((o) =>
      o.textContent?.trim(),
    );
    expect(options).toEqual(['すべて', 'Novels（2）', 'Poetry（2）']);
  });

  it('語で絞ると番号順に並び、件数が変わる', () => {
    const { ids, count, type } = create();
    type('tale');
    expect(ids()).toEqual([1, 3]);
    expect(count()).toBe('2 冊');
  });

  it('分類で絞れる', () => {
    const { ids, select, component } = create();
    select('分類', 'Poetry');
    expect(component.category()).toBe('Poetry');
    expect(ids()).toEqual([1, 2]);
  });

  it('並べ替えの選択で順が変わる', () => {
    const { ids, select } = create();
    expect(ids()).toEqual([1, 2, 3, 4]);
    select('並べ替え', 'title');
    expect(ids()).toEqual([1, 3, 2, 4]);
    select('並べ替え', 'author');
    expect(ids()).toEqual([1, 2, 4, 3]);
    select('並べ替え', 'id');
    expect(ids()).toEqual([1, 2, 3, 4]);
  });

  it('一致が無ければ 0 冊と「見つかりません」を出す', () => {
    const { count, text, type } = create();
    type('zzz');
    expect(count()).toBe('0 冊');
    expect(text()).toContain('見つかりません');
  });

  it('目録が空のときは「見つかりません」を出さない', () => {
    const { text } = create({ withEntries: false });
    expect(text()).not.toContain('見つかりません');
  });

  it('選んだ分類が目録から無くなったら「すべて」に戻す', () => {
    const { fake, fixture, component, select, el } = create();
    select('分類', 'Poetry');
    fake.entries.set([entries[0]]);
    fixture.detectChanges();
    expect(component.category()).toBeNull();
    expect(component.rows().map((e) => e.id)).toEqual([3]);
    const s = el.querySelector('select[aria-label="分類"]') as HTMLSelectElement;
    expect(s.value).toBe('');
  });

  it('全部の本の分類が空なら更新を促す', () => {
    const { fake, fixture, text } = create();
    fake.entries.set(entries.map((e) => ({ ...e, categories: [] })));
    fixture.detectChanges();
    expect(text()).toContain('分類を使うには目録を更新してください');
  });

  it('分類があるときは更新を促さない', () => {
    const { text } = create();
    expect(text()).not.toContain('分類を使うには目録を更新してください');
  });

  describe('open', () => {
    it('openBookInReader を呼ぶ', async () => {
      const { component, openBookInReader } = create();
      await component.open(1342);
      expect(openBookInReader).toHaveBeenCalledWith(1342);
      expect(component.message()).toBeNull();
    });

    it('失敗の文を role="status" で出し、次に成功したら消す', async () => {
      const { component, openBookInReader, fixture, el } = create();
      openBookInReader.mockResolvedValueOnce({ ok: false, message: '読書画面が開いていません' });
      await component.open(1);
      fixture.detectChanges();
      expect(el.querySelector('[role="status"].message')?.textContent).toContain(
        '読書画面が開いていません',
      );
      await component.open(1);
      fixture.detectChanges();
      expect(component.message()).toBeNull();
      expect(el.querySelector('[role="status"].message')).toBeNull();
    });

    it('例外が出たらその理由を出す', async () => {
      const { component, openBookInReader, fixture, el } = create();
      openBookInReader.mockRejectedValueOnce(new Error('壊れた'));
      await component.open(1);
      fixture.detectChanges();
      expect(el.querySelector('[role="status"].message')?.textContent).toContain('壊れた');
    });

    it('ブラウザ版では開けないと案内する', async () => {
      const { component } = create({ noApi: true });
      await component.open(1);
      expect(component.message()).toBe('デスクトップ版でのみ開けます');
    });
  });
});
