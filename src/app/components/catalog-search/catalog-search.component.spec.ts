import { TestBed } from '@angular/core/testing';
import { CatalogService } from '../../services/catalog.service';
import {
  TitleTranslationError,
  TitleTranslationService,
} from '../../services/title-translation.service';
import { CatalogSearchComponent } from './catalog-search.component';
import { SAMPLE_ENTRIES, createFakeCatalog } from './catalog-search.testing';

describe('CatalogSearchComponent', () => {
  function create(withCatalog = false) {
    const fake = createFakeCatalog();
    const translate = vi.fn<TitleTranslationService['translate']>(async () => []);
    if (withCatalog) {
      fake.entries.set(SAMPLE_ENTRIES);
      fake.fetchedAt.set('2026-11-06');
    }
    TestBed.configureTestingModule({
      imports: [CatalogSearchComponent],
      providers: [
        { provide: CatalogService, useValue: fake },
        { provide: TitleTranslationService, useValue: { translate } },
      ],
    });
    const fixture = TestBed.createComponent(CatalogSearchComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const input = () => el.querySelector('input') as HTMLInputElement;
    const buttons = () => Array.from(el.querySelectorAll('button'));
    const type = (value: string) => {
      input().value = value;
      input().dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    /** Enter を押し、英訳の結果が画面に出るまで待つ */
    const pressEnter = async () => {
      input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return { fake, translate, fixture, el, input, buttons, type, pressEnter };
  }

  it('生成時に load を 1 回呼ぶ', () => {
    const { fake } = create();
    expect(fake.load).toHaveBeenCalledTimes(1);
  });

  it('目録が空なら「目録を取得」を出し、押すと fetch を呼ぶ。検索欄は disabled', () => {
    const { fake, fixture, input, buttons } = create();
    const btn = buttons().find((b) => b.textContent?.includes('目録を取得'));
    expect(btn).toBeTruthy();
    expect(input().disabled).toBe(true);
    btn!.click();
    fixture.detectChanges();
    expect(fake.fetch).toHaveBeenCalledTimes(1);
  });

  it('loading 中は案内を出し、ボタンを disabled にする', () => {
    const { fake, fixture, el, buttons } = create();
    fake.loading.set(true);
    fixture.detectChanges();
    expect(el.textContent).toContain('目録を取得しています…');
    expect(buttons().find((b) => b.textContent?.includes('目録を取得'))!.disabled).toBe(true);
  });

  it('目録があれば取得日と冊数、「更新」ボタンを出す', () => {
    const { el, buttons, input } = create(true);
    expect(el.textContent).toContain('目録: 2026-11-06 取得（3 冊）');
    expect(buttons().some((b) => b.textContent?.includes('更新'))).toBe(true);
    expect(input().disabled).toBe(false);
  });

  it('更新ボタンを押すと fetch を呼ぶ', () => {
    const { fake, buttons } = create(true);
    buttons()
      .find((b) => b.textContent?.includes('更新'))!
      .click();
    expect(fake.fetch).toHaveBeenCalledTimes(1);
  });

  it('検索欄の placeholder と aria-label が決まっている', () => {
    const { input } = create(true);
    expect(input().placeholder).toBe('題名・著者で検索（日本語の題名は Enter で英訳）');
    expect(input().getAttribute('aria-label')).toBe('題名・著者で検索（英語の本）');
  });

  it('pride で検索すると題名・著者・番号を出す', () => {
    const { el, type } = create(true);
    type('pride');
    expect(el.textContent).toContain('Pride and Prejudice');
    expect(el.textContent).toContain('Austen, Jane, 1775-1817');
    expect(el.textContent).toContain('#1342');
  });

  it('当てはまる本がなければ「見つかりません」を出す', () => {
    const { el, type } = create(true);
    type('zzzzzz');
    expect(el.textContent).toContain('見つかりません');
  });

  it('入力が空なら一覧も「見つかりません」も出さない', () => {
    const { el } = create(true);
    expect(el.querySelector('.catalog-result')).toBeNull();
    expect(el.textContent).not.toContain('見つかりません');
  });

  it('結果を押すと bookSelected に番号を出し、検索欄を空にして一覧を閉じる', () => {
    const { fixture, el, input, type } = create(true);
    const selected: number[] = [];
    fixture.componentInstance.bookSelected.subscribe((id) => selected.push(id));
    type('pride');
    (el.querySelector('.catalog-result') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(selected).toEqual([1342]);
    expect(input().value).toBe('');
    expect(el.querySelector('.catalog-result')).toBeNull();
  });

  it('error があれば role="status" で出す', () => {
    const { fake, fixture, el } = create(true);
    fake.error.set('取得に失敗しました');
    fixture.detectChanges();
    const status = el.querySelector('[role="status"]');
    expect(status?.textContent).toContain('取得に失敗しました');
  });

  describe('日本語の題名', () => {
    it('Enter を押す前は案内だけを出し、英訳も一覧も出さない', () => {
      const { el, translate, type } = create(true);
      type('高慢と偏見');
      expect(el.textContent).toContain('Enter で英語に訳して検索します');
      expect(el.textContent).not.toContain('見つかりません');
      expect(el.querySelector('.catalog-result')).toBeNull();
      expect(translate).not.toHaveBeenCalled();
    });

    it('Enter を押すと英訳で検索し、結果と使った訳語を出す', async () => {
      const { el, translate, type, pressEnter } = create(true);
      translate.mockResolvedValue(['Pride and Prejudice']);
      type('高慢と偏見');
      await pressEnter();
      expect(translate).toHaveBeenCalledWith('高慢と偏見');
      expect(el.textContent).toContain('「高慢と偏見」→ Pride and Prejudice で検索しました');
      expect(el.querySelector('.catalog-result')?.textContent).toContain('#1342');
      expect(el.textContent).not.toContain('Enter で英語に訳して検索します');
    });

    it('候補が複数なら「、」で並べて出し、どれかで見つかった本を出す', async () => {
      const { el, translate, type, pressEnter } = create(true);
      translate.mockResolvedValue(['Takarashima Island', 'Complete Works']);
      type('全集');
      await pressEnter();
      expect(el.textContent).toContain(
        '「全集」→ Takarashima Island、Complete Works で検索しました',
      );
      expect(el.querySelector('.catalog-result')?.textContent).toContain('#100');
    });

    it('英訳はあるが目録に無ければ、訳語と「見つかりません」を出す', async () => {
      const { el, translate, type, pressEnter } = create(true);
      translate.mockResolvedValue(['Takarashima Island']);
      type('宝島');
      await pressEnter();
      expect(el.textContent).toContain('「宝島」→ Takarashima Island で検索しました');
      expect(el.textContent).toContain('見つかりません');
    });

    it('英訳が見つからなければ、英語で入れ直すよう案内する', async () => {
      const { el, type, pressEnter } = create(true);
      type('ほげほげ');
      await pressEnter();
      expect(el.textContent).toContain(
        '「ほげほげ」の英訳が見つかりません。英語の題名で入れてください',
      );
    });

    it('通信に失敗したら理由を出す', async () => {
      const { el, translate, type, pressEnter } = create(true);
      translate.mockRejectedValue(
        new TitleTranslationError('Weblio に接続できません（ネットワークを確認してください）'),
      );
      type('白鯨');
      await pressEnter();
      expect(el.textContent).toContain('Weblio に接続できません（ネットワークを確認してください）');
    });

    it('英訳したあとで入力を変えたら、英訳の結果を取り消す', async () => {
      const { el, translate, type, pressEnter } = create(true);
      translate.mockResolvedValue(['Pride and Prejudice']);
      type('高慢と偏見');
      await pressEnter();
      type('高慢');
      expect(el.querySelector('.catalog-result')).toBeNull();
      expect(el.textContent).not.toContain('で検索しました');
      expect(el.textContent).toContain('Enter で英語に訳して検索します');
    });

    it('英訳の途中で入力を変えたら、遅れて届いた英訳は使わない', async () => {
      const { el, translate, fixture, input, type } = create(true);
      let resolve: (value: string[]) => void = () => undefined;
      translate.mockReturnValue(new Promise((r) => (resolve = r)));
      type('高慢と偏見');
      input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      type('白鯨');
      resolve(['Pride and Prejudice']);
      await fixture.whenStable();
      fixture.detectChanges();
      expect(el.textContent).not.toContain('で検索しました');
      expect(el.textContent).toContain('Enter で英語に訳して検索します');
      expect(el.querySelector('.catalog-result')).toBeNull();
    });

    it('英訳している間は「英訳しています…」を出す', async () => {
      const { el, translate, fixture, input, type } = create(true);
      let resolve: (value: string[]) => void = () => undefined;
      translate.mockReturnValue(new Promise((r) => (resolve = r)));
      type('白鯨');
      input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      fixture.detectChanges();
      expect(el.textContent).toContain('「白鯨」を英訳しています…');
      resolve([]);
      await fixture.whenStable();
    });

    it('英語の入力で Enter を押しても英訳しない', async () => {
      const { translate, type, pressEnter } = create(true);
      type('pride');
      await pressEnter();
      expect(translate).not.toHaveBeenCalled();
    });
  });
});
