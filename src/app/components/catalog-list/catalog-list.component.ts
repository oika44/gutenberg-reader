import { ScrollingModule } from '@angular/cdk/scrolling';
import { Component, computed, inject, signal } from '@angular/core';
import { CatalogEntry } from '../../services/catalog';
import { CatalogService } from '../../services/catalog.service';
import {
  CatalogSort,
  countCategories,
  filterCatalog,
  hasAnyCategory,
  sortCatalog,
} from '../../services/catalog-list';
import { DesktopBridgeService } from '../../services/desktop-bridge.service';
import { CatalogStatusComponent } from '../catalog-status/catalog-status.component';

/** 一覧の 1 行の高さ（px）。CSS の .catalog-row の height とそろえる */
export const CATALOG_ROW_HEIGHT = 56;

/** 目録の一覧画面。語・分類で絞り、並べ替え、選んだ本を読書画面で開く */
@Component({
  selector: 'app-catalog-list',
  imports: [ScrollingModule, CatalogStatusComponent],
  templateUrl: './catalog-list.component.html',
  styleUrl: './catalog-list.component.css',
})
export class CatalogListComponent {
  protected readonly catalog = inject(CatalogService);
  private readonly bridge = inject(DesktopBridgeService);
  protected readonly rowHeight = CATALOG_ROW_HEIGHT;
  protected readonly trackById = (_index: number, entry: CatalogEntry) => entry.id;

  readonly query = signal('');
  readonly sort = signal<CatalogSort>('id');
  /** 利用者が選んだ分類。目録の更新で無くなっていることがある */
  private readonly selectedCategory = signal<string | null>(null);
  readonly categories = computed(() => countCategories(this.catalog.entries()));
  /** 実際に使う分類。選んだ分類が目録に無ければ null（すべて） */
  readonly category = computed(() => {
    const selected = this.selectedCategory();
    return this.categories().some((c) => c.name === selected) ? selected : null;
  });
  readonly rows = computed(() =>
    sortCatalog(filterCatalog(this.catalog.entries(), this.query(), this.category()), this.sort()),
  );
  readonly needsRefresh = computed(
    () => this.catalog.entries().length > 0 && !hasAnyCategory(this.catalog.entries()),
  );
  readonly message = signal<string | null>(null);

  constructor() {
    void this.catalog.load();
  }

  onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  onCategory(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedCategory.set(value === '' ? null : value);
  }

  onSort(event: Event): void {
    this.sort.set((event.target as HTMLSelectElement).value as CatalogSort);
  }

  /** 読書画面で本を開く。失敗は message に出す */
  async open(id: number): Promise<void> {
    const api = this.bridge.api;
    if (api === null) {
      this.message.set('デスクトップ版でのみ開けます');
      return;
    }
    try {
      const result = await api.openBookInReader(id);
      this.message.set(result.ok ? null : result.message);
    } catch (err) {
      this.message.set(err instanceof Error ? err.message : String(err));
    }
  }
}
