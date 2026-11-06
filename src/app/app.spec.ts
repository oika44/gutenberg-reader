import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { App, APP_PATH } from './app';
import { DesktopBridgeService } from './services/desktop-bridge.service';
import { provideFakeCatalog } from './components/reader/reader.testing';

describe('App', () => {
  async function create(path: string) {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient(),
        provideFakeCatalog(),
        { provide: APP_PATH, useValue: path },
        { provide: DesktopBridgeService, useValue: { api: null } },
      ],
    });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('/ では読書画面を 1 つ置く', async () => {
    const el = await create('/');
    expect(el.querySelector('app-reader')).not.toBeNull();
    expect(el.querySelector('app-catalog-list')).toBeNull();
  });

  it('/catalog では目録の一覧を置き、読書画面は置かない', async () => {
    const el = await create('/catalog');
    expect(el.querySelector('app-catalog-list')).not.toBeNull();
    expect(el.querySelector('app-reader')).toBeNull();
  });
});
