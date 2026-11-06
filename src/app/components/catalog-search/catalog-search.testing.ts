import { signal } from '@angular/core';
import { vi } from 'vitest';
import { CatalogEntry, parseCatalog } from '../../services/catalog';
import { CATALOG_CSV } from '../../services/catalog.testing';

/** CatalogService の偽物。signal を書き換えて状態を作る */
export function createFakeCatalog() {
  return {
    entries: signal<CatalogEntry[]>([]),
    fetchedAt: signal<string | null>(null),
    loading: signal(false),
    error: signal<string | null>(null),
    load: vi.fn(async () => {}),
    fetch: vi.fn(async () => {}),
  };
}

export const SAMPLE_ENTRIES = parseCatalog(CATALOG_CSV);
