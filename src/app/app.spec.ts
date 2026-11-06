import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { App } from './app';
import { provideFakeCatalog } from './components/reader/reader.testing';

describe('App', () => {
  it('読書画面を 1 つ置く', async () => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideFakeCatalog()],
    });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('app-reader')).not.toBeNull();
  });
});
