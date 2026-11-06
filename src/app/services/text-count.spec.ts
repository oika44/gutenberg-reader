import { countRange, countWords } from './text-count';

describe('countWords', () => {
  it.each([
    ['The quick brown fox', 4],
    ["don't stop", 2],
    ['don’t stop', 2],
    ['a well-known man', 3],
    ['in 1813 there', 3],
    ['*** -- ***', 0],
    ['', 0],
    ['“Hello,” she said.', 3],
  ])('%s → %i 語', (text, n) => expect(countWords(text)).toBe(n));
});

describe('countRange', () => {
  const lines = ['It is a truth', '', '   ', 'universally acknowledged,', 'that a single man'];

  it('両端を含み、空白だけの行を数えない', () => {
    expect(countRange(lines, 1, 4)).toEqual({ lines: 2, words: 6 });
  });

  it('1 行だけの範囲', () => {
    expect(countRange(lines, 5, 5)).toEqual({ lines: 1, words: 4 });
  });

  it('終了行が本の行数を超えても、ある行までを数える', () => {
    expect(countRange(lines, 4, 99)).toEqual({ lines: 2, words: 6 });
  });

  it('空行だけの範囲は 0 行・0 語', () => {
    expect(countRange(lines, 2, 3)).toEqual({ lines: 0, words: 0 });
  });
});
