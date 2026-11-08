import { MAX_HITS, searchLines } from './text-search';

describe('searchLines', () => {
  const lines = ['It is a truth', '', 'universally acknowledged,', 'TRUTH and truth', 'a man'];

  it('含む行を 1 から数えた行番号で返し、一致した部分を分けて返す', () => {
    const result = searchLines(lines, 'acknow');
    expect(result.total).toBe(1);
    expect(result.hits).toEqual([
      {
        line: 3,
        parts: [
          { text: 'universally ', match: false },
          { text: 'acknow', match: true },
          { text: 'ledged,', match: false },
        ],
      },
    ]);
  });

  it('大文字と小文字を区別せず、元の表記のまま返す', () => {
    const result = searchLines(lines, 'Truth');
    expect(result.hits.map((h) => h.line)).toEqual([1, 4]);
    expect(result.hits[0].parts).toEqual([
      { text: 'It is a ', match: false },
      { text: 'truth', match: true },
    ]);
  });

  it('1 行に何度も出るときは 1 件にまとめ、すべてを一致として分ける', () => {
    const result = searchLines(lines, 'truth');
    expect(result.total).toBe(2);
    expect(result.hits[1].parts).toEqual([
      { text: 'TRUTH', match: true },
      { text: ' and ', match: false },
      { text: 'truth', match: true },
    ]);
  });

  it('前後の空白を除いて探す', () => {
    expect(searchLines(lines, '  a man ').hits.map((h) => h.line)).toEqual([5]);
  });

  it('正規表現の記号は文字として探す', () => {
    expect(searchLines(['a.b', 'axb', '(x)*'], '.').hits.map((h) => h.line)).toEqual([1]);
    expect(searchLines(['a.b', 'axb', '(x)*'], '(x)*').hits.map((h) => h.line)).toEqual([3]);
  });

  it.each(['', '   '])('検索語が「%s」なら何も返さない', (query) => {
    expect(searchLines(lines, query)).toEqual({ hits: [], total: 0 });
  });

  it('見つからなければ 0 件', () => {
    expect(searchLines(lines, 'zebra')).toEqual({ hits: [], total: 0 });
  });

  it('上限を超えた分は返さず、本当の件数は total で返す', () => {
    const many = Array.from({ length: MAX_HITS + 3 }, (_, i) => `line ${i}`);
    const result = searchLines(many, 'line');
    expect(result.hits).toHaveLength(MAX_HITS);
    expect(result.total).toBe(MAX_HITS + 3);
    expect(result.hits.at(-1)?.line).toBe(MAX_HITS);
  });
});
