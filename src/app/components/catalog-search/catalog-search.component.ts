import { Component, computed, inject, output, signal } from '@angular/core';
import { searchCatalog } from '../../services/catalog';
import { CatalogService } from '../../services/catalog.service';
import { hasJapanese, searchByTranslations } from '../../services/title-translation';
import { TitleTranslationService } from '../../services/title-translation.service';
import { CatalogStatusComponent } from '../catalog-status/catalog-status.component';

/** 日本語の題名の英訳の状態。source は英訳したときの入力 */
type Translation =
  | { source: string; status: 'pending' }
  | { source: string; status: 'done'; candidates: string[] }
  | { source: string; status: 'error'; message: string };

/** 題名・著者で本を探す。日本語の題名は Enter で英訳してから探す。選んだ本の番号を bookSelected で知らせる */
@Component({
  selector: 'app-catalog-search',
  imports: [CatalogStatusComponent],
  templateUrl: './catalog-search.component.html',
  styleUrl: './catalog-search.component.css',
})
export class CatalogSearchComponent {
  protected readonly catalog = inject(CatalogService);
  private readonly titleTranslation = inject(TitleTranslationService);
  readonly bookSelected = output<number>();
  readonly query = signal('');
  /** 今の入力に対する英訳（入力を変えたら null に戻す） */
  readonly translation = signal<Translation | null>(null);
  readonly japanese = computed(() => hasJapanese(this.query()));
  /** 日本語なら英訳が済むまで一覧を出さない */
  readonly showResults = computed(() => {
    if (this.query().trim() === '') return false;
    if (!this.japanese()) return true;
    const t = this.translation();
    return t?.status === 'done' && t.candidates.length > 0;
  });
  readonly results = computed(() => {
    if (!this.japanese()) return searchCatalog(this.catalog.entries(), this.query());
    const t = this.translation();
    return t?.status === 'done' ? searchByTranslations(this.catalog.entries(), t.candidates) : [];
  });

  constructor() {
    void this.catalog.load();
  }

  onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.translation.set(null);
  }

  /** Enter で日本語の題名を英訳する。英訳の途中で入力が変わったら、届いた英訳は捨てる */
  async translate(): Promise<void> {
    const source = this.query().trim();
    if (!hasJapanese(source)) return;
    const pending: Translation = { source, status: 'pending' };
    this.translation.set(pending);
    try {
      const candidates = await this.titleTranslation.translate(source);
      if (this.translation() === pending)
        this.translation.set({ source, status: 'done', candidates });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (this.translation() === pending)
        this.translation.set({ source, status: 'error', message });
    }
  }

  select(id: number): void {
    this.bookSelected.emit(id);
    this.query.set('');
    this.translation.set(null);
  }
}
