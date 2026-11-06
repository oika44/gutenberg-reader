import { Component, InjectionToken, inject } from '@angular/core';
import { CatalogListComponent } from './components/catalog-list/catalog-list.component';
import { ReaderComponent } from './components/reader/reader.component';

/** 表示中のパス。`/catalog` なら目録の一覧、それ以外は読書画面を出す */
export const APP_PATH = new InjectionToken<string>('APP_PATH', {
  factory: () => location.pathname,
});

@Component({
  selector: 'app-root',
  imports: [ReaderComponent, CatalogListComponent],
  template: `
    @if (isCatalog) {
      <app-catalog-list />
    } @else {
      <app-reader />
    }
  `,
})
export class App {
  protected readonly isCatalog = inject(APP_PATH) === '/catalog';
}
