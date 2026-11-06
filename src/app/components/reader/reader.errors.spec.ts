import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { BookService } from '../../services/book.service';
import { ReadingLogService } from '../../services/reading-log.service';
import { ReaderComponent } from './reader.component';
import { WordLookupService } from '@pstudy/word-lookup.service';
import { DesktopBridgeService, GutenbergDesktop } from '../../services/desktop-bridge.service';
import { BOOK, provideFakeCatalog } from './reader.testing';

describe('ReaderComponent（エラー表示・デスクトップ版でないとき）', () => {
  async function create(
    readingLog: Partial<Record<'init' | 'changeLogPath', () => Promise<void>>>,
    api: Pick<GutenbergDesktop, 'saveFile' | 'onOpenBook'> | null,
  ) {
    TestBed.configureTestingModule({
      imports: [ReaderComponent],
      providers: [
        provideFakeCatalog(),
        { provide: BookService, useValue: { load: () => of(BOOK) } },
        {
          provide: ReadingLogService,
          useValue: {
            load: async () => ({ records: [], badLines: [] }),
            init: async () => {},
            logPath: () => null,
            changeLogPath: async () => {},
            ...readingLog,
          },
        },
        {
          provide: WordLookupService,
          useValue: {
            lookup: (word: string) =>
              of({ word, meaning: '訳', example: '', pronunciation: '', audioUrl: '' }),
          },
        },
        { provide: DesktopBridgeService, useValue: { api } },
      ],
    });
    const fixture = TestBed.createComponent(ReaderComponent);
    await fixture.whenStable();
    return fixture;
  }

  it('起動時に記録ファイルの設定を読めなければ理由を表示する', async () => {
    const fixture = await create(
      { init: async () => Promise.reject(new Error('設定を読めませんでした')) },
      null,
    );
    expect(fixture.componentInstance.message()).toBe('設定を読めませんでした');
  });

  it('「変更」で記録ファイルを選べなかったら理由を表示する', async () => {
    const fixture = await create(
      { changeLogPath: async () => Promise.reject(new Error('ダイアログを開けません')) },
      null,
    );
    const button = fixture.debugElement
      .queryAll(By.css('button'))
      .find((b) => b.nativeElement.textContent.trim() === '変更');
    button!.nativeElement.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.message()).toBe('ダイアログを開けません');
  });

  it('デスクトップ版でなければ P-Study 用 CSV を保存せず、案内を出す', async () => {
    const fixture = await create({}, null);
    const component = fixture.componentInstance;
    await component.lookupWord('apple');
    await component.savePStudy('SJIS');
    expect(component.message()).toBe('P-Study 用 CSV はデスクトップ版でのみ保存できます');
  });

  it('保存先を選ぶのをキャンセルしたら何も表示しない（前の案内を残す）', async () => {
    const saveFile = vi.fn<GutenbergDesktop['saveFile']>(async () => null);
    const fixture = await create({}, { saveFile, onOpenBook: vi.fn(() => () => {}) });
    const component = fixture.componentInstance;
    await component.lookupWord('apple');
    component.message.set('前の案内');
    await component.savePStudy('UTF8');
    expect(saveFile).toHaveBeenCalled();
    expect(component.message()).toBe('前の案内');
  });
});
