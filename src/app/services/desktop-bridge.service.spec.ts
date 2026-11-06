import { TestBed } from '@angular/core/testing';
import { DesktopBridgeService, GutenbergDesktop } from './desktop-bridge.service';

const fakeDesktop = (): GutenbergDesktop => ({
  getLogPath: async () => null,
  chooseLogPath: async () => null,
  readLog: async () => null,
  appendLog: async () => ({ ok: true }),
  saveFile: async () => null,
  readCatalog: async () => null,
  writeCatalog: async () => ({ ok: true }),
  openCatalogWindow: async () => undefined,
  openBookInReader: async () => ({ ok: true }),
  onOpenBook: () => () => undefined,
});

describe('DesktopBridgeService', () => {
  afterEach(() => {
    delete window.gutenbergDesktop;
  });

  it('デスクトップ版（preload が window.gutenbergDesktop を用意済み）なら api はそれ', () => {
    const desktop = fakeDesktop();
    window.gutenbergDesktop = desktop;
    expect(TestBed.inject(DesktopBridgeService).api).toBe(desktop);
  });

  it('ブラウザで動かしているとき（window.gutenbergDesktop がない）は api が null', () => {
    expect(TestBed.inject(DesktopBridgeService).api).toBeNull();
  });
});
