import { CatalogSearchComponent } from '../catalog-search/catalog-search.component';
import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  DictionaryResult,
  WordLookupService,
  WordNotFoundError,
} from '@pstudy/word-lookup.service';
import { CsvEncoding, PStudyBuilderService } from '@pstudy/pstudy-builder.service';
import { Book, BookService, parseBookId } from '../../services/book.service';
import { DesktopBridgeService } from '../../services/desktop-bridge.service';
import { normalizeSelectedWord } from '../../services/selected-word';
import { findBookmark, formatTimestamp, isDuplicate } from '../../services/reading-log';
import { ReadingLogService } from '../../services/reading-log.service';
import { RangeStats, countRange } from '../../services/text-count';
import { weblioErrorReason } from '../../services/weblio-error';

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** 本文 1 行の高さ (px)。仮想スクロールの itemSize と CSS で揃える */
export const LINE_HEIGHT = 24;

@Component({
  selector: 'app-reader',
  imports: [ScrollingModule, CatalogSearchComponent],
  templateUrl: './reader.component.html',
  styleUrl: './reader.component.css',
})
export class ReaderComponent {
  private readonly bookService = inject(BookService);
  private readonly readingLog = inject(ReadingLogService);
  private readonly wordLookup = inject(WordLookupService);
  private readonly desktop = inject(DesktopBridgeService).api;
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly builder = inject(PStudyBuilderService);
  private readonly viewport = viewChild.required(CdkVirtualScrollViewport);
  private readonly bookInput = viewChild.required<ElementRef<HTMLInputElement>>('bookInput');

  protected readonly lineHeight = LINE_HEIGHT;
  /** 目録の一覧ウインドウを開けるのはデスクトップ版だけ */
  protected readonly hasCatalogWindow = typeof this.desktop?.openCatalogWindow === 'function';

  readonly book = signal<Book | null>(null);
  readonly startLine = signal<number | null>(null);
  readonly endLine = signal<number | null>(null);
  readonly message = signal('');
  readonly loading = signal(false);
  /** 記録の書き込み中。連打で同じ行を 2 回追記しないため */
  readonly saving = signal(false);
  readonly lastResult = signal<DictionaryResult | null>(null);
  /** Weblio に問い合わせ中の単語 */
  readonly lookingUp = signal<string | null>(null);
  /** 前回の記録以降に調べた単語（小文字） */
  readonly lookedUp = signal<ReadonlySet<string>>(new Set());
  readonly lookupCount = computed(() => this.lookedUp().size);
  readonly logPath = this.readingLog.logPath;

  readonly stats = computed<RangeStats | null>(() => {
    const book = this.book();
    const start = this.startLine();
    const end = this.endLine();
    return book && start !== null && end !== null ? countRange(book.lines, start, end) : null;
  });

  /** 本・開始行・終了行がそろったときだけ記録できる */
  readonly canRecord = computed(
    () =>
      !this.saving() &&
      this.book() !== null &&
      this.startLine() !== null &&
      this.endLine() !== null,
  );

  constructor() {
    this.readingLog.init().catch((err: unknown) => this.showError(err));
    // 目録の一覧ウインドウで「開く」を押されたら、その本を開く（ブラウザ版には一覧ウインドウがない）
    if (this.desktop) {
      const unsubscribe = this.desktop.onOpenBook((id) =>
        this.selectFromCatalog(this.bookInput().nativeElement, id),
      );
      this.destroyRef.onDestroy(unsubscribe);
    }
  }

  /** 目録で選んだ本を、番号の入力欄に入れて開く */
  selectFromCatalog(bookInput: HTMLInputElement, id: number): void {
    bookInput.value = String(id);
    void this.openBook(String(id));
  }

  protected async openCatalogWindow(): Promise<void> {
    try {
      await this.desktop?.openCatalogWindow();
    } catch (err) {
      this.message.set(`目録の一覧を開けませんでした（${errorText(err)}）`);
    }
  }

  async openBook(input: string): Promise<void> {
    const id = parseBookId(input);
    if (id === null) {
      this.message.set('本の番号か URL を入力してください');
      return;
    }
    this.loading.set(true);
    this.message.set('');
    try {
      const book = await firstValueFrom(this.bookService.load(id));
      const notices: string[] = [];
      // 記録ファイルを読めなくても本は開く（しおりは使わない）
      const { records, badLines } = await this.readingLog.load().catch((err: unknown) => {
        notices.push(`記録ファイルを読めませんでした（${errorText(err)}）`);
        return { records: [], badLines: [] as number[] };
      });
      if (!book.markersFound) {
        notices.push('本文の範囲を判別できなかったため全体を表示しています');
      }
      if (badLines.length > 0) {
        notices.push(`記録ファイルの${badLines.join('・')}行目を読めませんでした`);
      }

      // 調べた単語数は「その本で前回の記録以降」のものなので、別の本に切り替えたら 0 に戻す
      if (this.book()?.id !== id) this.lookedUp.set(new Set());
      this.book.set(book);
      this.endLine.set(null);
      const bookmark = findBookmark(records, id);
      if (bookmark !== null && bookmark > book.lines.length) {
        this.startLine.set(null);
        notices.push('最後まで記録済みです');
      } else {
        this.startLine.set(bookmark);
      }
      const target = (bookmark ?? 1) - 1;
      afterNextRender(
        () => this.viewport().scrollToIndex(Math.min(target, book.lines.length - 1)),
        { injector: this.injector },
      );
      this.message.set(notices.join('　'));
    } catch (err) {
      this.showError(err);
    } finally {
      this.loading.set(false);
    }
  }

  /** ダブルクリックした単語を Weblio で調べる。前回の記録以降に調べた単語を（重複を除いて）数える */
  async lookupWord(raw: string): Promise<void> {
    const word = normalizeSelectedWord(raw);
    if (word === null) return;
    this.lookingUp.set(word);
    try {
      const result = await firstValueFrom(this.wordLookup.lookup(word));
      this.lastResult.set(result);
      this.builder.addEntry(result.word, result.meaning, result);
      this.countLookup(word);
      this.message.set('');
    } catch (err) {
      if (err instanceof WordNotFoundError) {
        // 調べたことには変わりないので数える
        this.countLookup(word);
      }
      this.lastResult.set(null);
      this.message.set(
        err instanceof HttpErrorResponse
          ? `「${word}」を調べられませんでした。${weblioErrorReason(err)}`
          : errorText(err),
      );
    } finally {
      this.lookingUp.set(null);
    }
  }

  async savePStudy(encoding: CsvEncoding): Promise<void> {
    if (!this.desktop) {
      this.message.set('P-Study 用 CSV はデスクトップ版でのみ保存できます');
      return;
    }
    try {
      const blob = this.builder.exportCsv(encoding);
      const data = new Uint8Array(await blob.arrayBuffer());
      const result = await this.desktop.saveFile('pstudy_words.csv', data);
      if (result === null) return;
      this.message.set(
        result.ok ? `P-Study 用 CSV を保存しました: ${result.path}` : result.message,
      );
    } catch (err) {
      this.showError(err);
    }
  }

  /** 読んだ範囲を記録 CSV に 1 行追記する。失敗したら入力をそのまま残す */
  async record(): Promise<void> {
    const book = this.book();
    const start = this.startLine();
    const end = this.endLine();
    const stats = this.stats();
    if (!book || start === null || end === null || !stats || this.saving()) return;
    this.saving.set(true);
    try {
      const { records } = await this.readingLog.load();
      if (
        isDuplicate(records, book.id, start, end) &&
        !window.confirm(`${start}〜${end} 行目はすでに記録されています。もう一度記録しますか？`)
      ) {
        return;
      }
      await this.readingLog.append({
        recordedAt: formatTimestamp(new Date()),
        bookId: book.id,
        title: book.title,
        author: book.author,
        startLine: start,
        endLine: end,
        lines: stats.lines,
        words: stats.words,
        lookups: this.lookupCount(),
      });
      this.lookedUp.set(new Set());
      this.startLine.set(end + 1 <= book.lines.length ? end + 1 : null);
      this.endLine.set(null);
      this.message.set(
        `記録しました（${start}〜${end} 行目・${stats.lines} 行・${stats.words} 語）`,
      );
    } catch (err) {
      this.showError(err);
    } finally {
      this.saving.set(false);
    }
  }

  /** 本文のダブルクリック。行番号のダブルクリック（範囲指定の操作）では調べない */
  protected onTextDblClick(event: MouseEvent): void {
    if (event.target instanceof Element && event.target.closest('.line-no')) return;
    void this.lookupWord(this.selectedText());
  }

  protected async changeLogPath(): Promise<void> {
    await this.readingLog.changeLogPath().catch((err: unknown) => this.showError(err));
  }

  private showError(err: unknown): void {
    this.message.set(errorText(err));
  }

  protected removeEntry(index: number): void {
    this.builder.removeEntry(index);
  }

  private countLookup(word: string): void {
    this.lookedUp.update((set) => new Set(set).add(word.toLowerCase()));
  }

  /** 行番号のクリック: 1 回目で開始行、2 回目で終了行を決める */
  clickLine(n: number): void {
    const start = this.startLine();
    if (start === null || this.endLine() !== null || n < start) {
      this.startLine.set(n);
      this.endLine.set(null);
    } else {
      this.endLine.set(n);
    }
  }

  protected selectedText(): string {
    return window.getSelection()?.toString() ?? '';
  }

  protected inRange(n: number): boolean {
    const start = this.startLine();
    if (start === null) return false;
    return n >= start && n <= (this.endLine() ?? start);
  }
}
