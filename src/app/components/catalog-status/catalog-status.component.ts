import { Component, inject } from '@angular/core';
import { CatalogService } from '../../services/catalog.service';

/** 目録の取得・更新ボタンと、取得日・冊数・取得中・エラーの表示。読み込みは親が行う */
@Component({
  selector: 'app-catalog-status',
  templateUrl: './catalog-status.component.html',
  styleUrl: './catalog-status.component.css',
})
export class CatalogStatusComponent {
  protected readonly catalog = inject(CatalogService);
}
