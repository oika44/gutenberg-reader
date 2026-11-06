import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WordLookupService } from '@pstudy/word-lookup.service';
import { PStudyBuilderService } from '@pstudy/pstudy-builder.service';

describe('pstudy-dict の共有部品', () => {
  it('WordLookupService が同じ Angular の HttpClient で /weblio/ に問い合わせる', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(WordLookupService);
    service.lookup('apple').subscribe();
    TestBed.inject(HttpTestingController).expectOne('/weblio/apple');
  });

  it('PStudyBuilderService に単語を追加できる', () => {
    const builder = TestBed.inject(PStudyBuilderService);
    expect(builder.addEntry('apple', 'りんご')).toBe(true);
    expect(builder.count()).toBe(1);
  });
});
