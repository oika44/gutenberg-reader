/**
 * Weblio の和英のページの見本（2026-11-06 に実物で確認した形）。
 * 要約の訳は .content-explanation に、別の辞書の訳は meta description の【単語】【英訳】【対訳】に入る。
 * description は HTML の属性の書き方のまま渡す（' は &#039; になる）。
 */
export function weblioPage(explanation: string, description = '英語で訳すと'): string {
  return [
    `<html><head><meta name="description" content="${description}"></head><body>`,
    '<div class="descriptionWrp">',
    `<span class="content-explanation  je">${explanation}</span>`,
    '</div></body></html>',
  ].join('\n');
}

/** 実物の「宝島」の説明文（要約は Takarashima Island と誤訳される） */
export const TAKARAJIMA_DESCRIPTION =
  '｢宝島｣は英語でどう表現する？【単語】a treasure island...【例文】A real treasure island, just like I thought....【その他の表現】This fort is the treasure island my brother and I dreamed of.... - 1000万語以上収録！英訳・英文・英単語の使い分けならWeblio英和・和英辞書';

/** 実物の「不思議の国のアリス」の説明文 */
export const ALICE_DESCRIPTION =
  '「不思議の国のアリス」は英語でどう表現する？【英訳】Alice&#039;s Adventures in Wonderland... - 1000万語以上収録！英訳・英文・英単語の使い分けならWeblio英和・和英辞書';

/** 実物の「白鯨」の説明文 */
export const HAKUGEI_DESCRIPTION =
  '「白鯨」は英語でどう表現する？【対訳】white whale, whiskers from a gray whale, Moby-Dick... - 1000万語以上収録！英訳・英文・英単語の使い分けならWeblio英和・和英辞書';

/** 実物の「若草物語」の説明文（【】の欄が無い） */
export const WAKAKUSA_DESCRIPTION =
  '若草物語を英語で訳すと Little Women『若草物語』（わかくさものがたり、英: Little Women、直訳: 小さな婦人たち）は、アメリカの作家ルイーザ・メイ・オルコットによる半ば自伝的な小説であり、児童文学';
