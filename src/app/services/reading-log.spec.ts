import {
  LOG_HEADER,
  ReadingRecord,
  findBookmark,
  formatLogLine,
  formatTimestamp,
  isDuplicate,
  parseLog,
} from './reading-log';

const rec: ReadingRecord = {
  recordedAt: '2026-11-03 15:30',
  bookId: 1342,
  title: 'Pride and Prejudice',
  author: 'Jane Austen',
  startLine: 1,
  endLine: 120,
  lines: 104,
  words: 1532,
  lookups: 7,
};

describe('formatLogLine', () => {
  it('仕様書の例と同じ行を作る', () => {
    expect(formatLogLine(rec)).toBe(
      '2026-11-03 15:30,1342,Pride and Prejudice,Jane Austen,1,120,104,1532,7',
    );
  });

  it('カンマや " を含む値を引用符で囲む', () => {
    expect(formatLogLine({ ...rec, title: 'Alice, "the" Girl' })).toContain(
      ',"Alice, ""the"" Girl",',
    );
  });

  it('値の中の改行は空白にして 1 行に収める', () => {
    expect(formatLogLine({ ...rec, title: 'A\r\nB' })).not.toMatch(/[\r\n]/);
  });
});

describe('formatTimestamp', () => {
  it('ローカル時刻を YYYY-MM-DD HH:mm にする', () => {
    expect(formatTimestamp(new Date(2026, 0, 5, 9, 7))).toBe('2026-01-05 09:07');
  });
});

describe('parseLog', () => {
  it('BOM・見出し・CRLF・引用符付きの値を読み、往復で同じ記録に戻る', () => {
    const text =
      '\uFEFF' + LOG_HEADER + '\r\n' + formatLogLine({ ...rec, title: 'A, "B"' }) + '\r\n';
    expect(parseLog(text)).toEqual({ records: [{ ...rec, title: 'A, "B"' }], badLines: [] });
  });

  it('列数や数値がおかしい行を飛ばして行番号を返す', () => {
    const text = [
      LOG_HEADER,
      formatLogLine(rec),
      'broken,line',
      formatLogLine({ ...rec, endLine: 200 }),
      '2026-11-03 15:30,abc,T,A,1,2,3,4,5',
    ].join('\r\n');
    const result = parseLog(text);
    expect(result.records.map((r) => r.endLine)).toEqual([120, 200]);
    expect(result.badLines).toEqual([3, 5]);
  });

  it('末尾に改行がない・空行があっても読める', () => {
    expect(parseLog(LOG_HEADER + '\n\n' + formatLogLine(rec)).records).toHaveLength(1);
  });

  it.each([
    ['負の数', '2026-11-03 15:30,1342,T,A,-1,2,3,4,5'],
    ['小数', '2026-11-03 15:30,1342,T,A,1.5,2,3,4,5'],
    ['空の数値', '2026-11-03 15:30,1342,T,A,,2,3,4,5'],
    ['列が多い', '2026-11-03 15:30,1342,T,A,1,2,3,4,5,6'],
  ])('%s の行は読めない行にする', (_label, line) => {
    expect(parseLog(LOG_HEADER + '\r\n' + line)).toEqual({ records: [], badLines: [2] });
  });

  it('BOM なしの見出しも見出しとして飛ばす', () => {
    expect(parseLog(LOG_HEADER).badLines).toEqual([]);
  });

  it('空のファイルは記録なし', () => {
    expect(parseLog('')).toEqual({ records: [], badLines: [] });
  });
});

describe('findBookmark', () => {
  it('同じ本の最後の記録の次の行', () => {
    const records = [
      rec,
      { ...rec, bookId: 11, endLine: 50 },
      { ...rec, startLine: 121, endLine: 300 },
    ];
    expect(findBookmark(records, 1342)).toBe(301);
    expect(findBookmark(records, 84)).toBeNull();
  });
});

describe('isDuplicate', () => {
  it('同じ本・同じ範囲だけ true', () => {
    expect(isDuplicate([rec], 1342, 1, 120)).toBe(true);
    expect(isDuplicate([rec], 1342, 1, 121)).toBe(false);
    expect(isDuplicate([rec], 11, 1, 120)).toBe(false);
  });
});
