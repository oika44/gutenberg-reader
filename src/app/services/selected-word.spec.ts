import { normalizeSelectedWord } from './selected-word';

describe('normalizeSelectedWord', () => {
  it.each([
    ['“Hello,”', 'Hello'],
    ['Mr.', 'Mr'],
    ["don't", "don't"],
    ['well-known', 'well-known'],
    [' apple\n', 'apple'],
  ])('%s → %s', (input, word) => expect(normalizeSelectedWord(input)).toBe(word));

  it.each(['  ', 'two words', '—', ''])('%j → null', (input) =>
    expect(normalizeSelectedWord(input)).toBeNull(),
  );
});
