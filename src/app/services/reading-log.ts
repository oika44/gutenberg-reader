/** 読書記録 CSV の 1 行 */
export interface ReadingRecord {
  /** ローカル時刻の YYYY-MM-DD HH:mm */
  recordedAt: string;
  bookId: number;
  title: string;
  author: string;
  startLine: number;
  endLine: number;
  /** 空行を除いた行数 */
  lines: number;
  words: number;
  /** 調べた単語数 */
  lookups: number;
}

export const LOG_HEADER = '記録日時,本番号,題名,著者,開始行,終了行,行数,語数,調べた単語数';

const COLUMN_COUNT = 9;

const pad = (n: number) => String(n).padStart(2, '0');

export function formatTimestamp(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** カンマ・" を含む値は " で囲む。改行は 1 行 1 記録を崩すので空白にする */
function csvField(value: string | number): string {
  const v = String(value).replace(/\r?\n/g, ' ');
  return /[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function formatLogLine(r: ReadingRecord): string {
  return [
    r.recordedAt,
    r.bookId,
    r.title,
    r.author,
    r.startLine,
    r.endLine,
    r.lines,
    r.words,
    r.lookups,
  ]
    .map(csvField)
    .join(',');
}

/** CSV の 1 行を値に分ける（" で囲まれた中のカンマと "" を扱う） */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        current += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      fields.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  fields.push(current);
  return fields;
}

function toRecord(fields: string[]): ReadingRecord | null {
  if (fields.length !== COLUMN_COUNT) return null;
  const [recordedAt, bookId, title, author, ...rest] = fields;
  const nums = [bookId, ...rest].map((v) => (/^\d+$/.test(v.trim()) ? Number(v) : NaN));
  if (nums.some(Number.isNaN)) return null;
  const [id, startLine, endLine, lines, words, lookups] = nums;
  return { recordedAt, bookId: id, title, author, startLine, endLine, lines, words, lookups };
}

/** 記録 CSV を読む。読めない行は飛ばし、その行番号（ファイル上の 1 始まり）を badLines に入れる */
export function parseLog(text: string): { records: ReadingRecord[]; badLines: number[] } {
  const records: ReadingRecord[] = [];
  const badLines: number[] = [];
  text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .forEach((line, i) => {
      if (line.trim() === '' || line === LOG_HEADER) return;
      const record = toRecord(splitCsvLine(line));
      if (record) records.push(record);
      else badLines.push(i + 1);
    });
  return { records, badLines };
}

/** 同じ本の最後の記録の次の行。記録がなければ null */
export function findBookmark(records: readonly ReadingRecord[], bookId: number): number | null {
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].bookId === bookId) return records[i].endLine + 1;
  }
  return null;
}

export function isDuplicate(
  records: readonly ReadingRecord[],
  bookId: number,
  startLine: number,
  endLine: number,
): boolean {
  return records.some(
    (r) => r.bookId === bookId && r.startLine === startLine && r.endLine === endLine,
  );
}
