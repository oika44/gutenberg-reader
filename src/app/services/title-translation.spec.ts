import { parseCatalog } from './catalog';
import { CATALOG_CSV } from './catalog.testing';
import { hasJapanese, parseTranslations, searchByTranslations } from './title-translation';
import {
  ALICE_DESCRIPTION,
  HAKUGEI_DESCRIPTION,
  TAKARAJIMA_DESCRIPTION,
  WAKAKUSA_DESCRIPTION,
  weblioPage,
} from './title-translation.testing';

describe('hasJapanese', () => {
  it.each([['高慢と偏見'], ['ひらがな'], ['カタカナ'], ['pride と prejudice'], ['ジキル博士']])(
    '%s は日本語を含む',
    (text) => expect(hasJapanese(text)).toBe(true),
  );

  it.each([['pride'], ['Pride and Prejudice 1342'], [''], ['café'], ['   ']])(
    '%j は日本語を含まない',
    (text) => expect(hasJapanese(text)).toBe(false),
  );
});

describe('parseTranslations', () => {
  it('訳を 1 つ取り出す', () => {
    expect(parseTranslations(weblioPage('\n    Pride and Prejudice\n  '))).toEqual([
      'Pride and Prejudice',
    ]);
  });

  it('「、」で区切り、かっこ書きを外し、大文字・小文字の違いだけの重複を 1 つにする', () => {
    expect(
      parseTranslations(
        weblioPage(
          'Alice in Wonderland (1933 film)、Alice in Wonderland (1903 film)、alice in wonderland',
        ),
      ),
    ).toEqual(['Alice in Wonderland']);
  });

  it('候補が複数あれば並びのとおりに返す', () => {
    expect(
      parseTranslations(weblioPage('Little Women (1994 film)、Little Women、Moby Dick')),
    ).toEqual(['Little Women', 'Moby Dick']);
  });

  it('説明文の【単語】も候補にし、先頭の a・an・the を外す。【例文】は使わない（宝島）', () => {
    expect(parseTranslations(weblioPage('Takarashima Island', TAKARAJIMA_DESCRIPTION))).toEqual([
      'Takarashima Island',
      'treasure island',
    ]);
  });

  it("説明文の【英訳】の &#039; を ' に戻す（不思議の国のアリス）", () => {
    expect(
      parseTranslations(
        weblioPage(
          'Alice in Wonderland (1933 film)、Alice in Wonderland (1903 film)',
          ALICE_DESCRIPTION,
        ),
      ),
    ).toEqual(['Alice in Wonderland', "Alice's Adventures in Wonderland"]);
  });

  it('説明文の【対訳】を「, 」で区切り、要約の候補のあとに並べる（白鯨）', () => {
    expect(parseTranslations(weblioPage('Moby Dick', HAKUGEI_DESCRIPTION))).toEqual([
      'Moby Dick',
      'white whale',
      'whiskers from a gray whale',
      'Moby-Dick',
    ]);
  });

  it('説明文に【】の欄が無ければ要約の候補だけ（若草物語）', () => {
    expect(
      parseTranslations(weblioPage('Little Women (1994 film)、Little Women', WAKAKUSA_DESCRIPTION)),
    ).toEqual(['Little Women']);
  });

  it('要約が無くても説明文の候補を返す', () => {
    expect(parseTranslations(weblioPage('', TAKARAJIMA_DESCRIPTION))).toEqual(['treasure island']);
  });

  it('要約の候補でも先頭の The を外し、外したあとで重複をまとめる', () => {
    expect(
      parseTranslations(
        weblioPage(
          'The War of the Worlds',
          '「宇宙戦争」は英語でどう表現する？【英訳】War of the Worlds... - 1000万語',
        ),
      ),
    ).toEqual(['War of the Worlds']);
  });

  it.each([['<html><body>見つかりません</body></html>'], [''], [weblioPage('  ')]])(
    '訳が無いページ（%#）なら空の配列',
    (html) => expect(parseTranslations(html)).toEqual([]),
  );
});

describe('searchByTranslations', () => {
  const entries = parseCatalog(CATALOG_CSV);

  it('候補ごとに検索し、見つかった本を候補の順に重複なしで合わせる', () => {
    expect(
      searchByTranslations(entries, ['Complete Works', 'Pride and Prejudice', 'Shakespeare']).map(
        (e) => e.id,
      ),
    ).toEqual([100, 1342]);
  });

  it('「宝島」の説明文の候補（treasure island）で Treasure Island が見つかる', () => {
    const withTreasure = [
      ...entries,
      {
        id: 120,
        title: 'Treasure Island',
        author: 'Stevenson, Robert Louis, 1850-1894',
        categories: [],
      },
    ];
    const candidates = parseTranslations(weblioPage('Takarashima Island', TAKARAJIMA_DESCRIPTION));
    expect(searchByTranslations(withTreasure, candidates).map((e) => e.id)).toEqual([120]);
  });

  it('どの候補でも見つからなければ空の配列', () => {
    expect(searchByTranslations(entries, ['Takarashima Island'])).toEqual([]);
  });

  it('合わせた結果を limit 件で打ち切る', () => {
    expect(searchByTranslations(entries, ['Pride', 'Works'], 1).map((e) => e.id)).toEqual([1342]);
  });
});
