/** 範囲の集計結果 */
export interface RangeStats {
  /** 空白文字だけの行を除いた行数 */
  lines: number;
  words: number;
}

/** 英単語。don't・don’t・well-known のように ' ’ - でつながった語は 1 語と数える */
const WORD = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g;

export function countWords(text: string): number {
  return text.match(WORD)?.length ?? 0;
}

/** start〜end 行（1 始まり・両端を含む）の行数と語数を数える */
export function countRange(lines: readonly string[], start: number, end: number): RangeStats {
  let lineCount = 0;
  let words = 0;
  for (const line of lines.slice(start - 1, end)) {
    if (line.trim() === '') continue;
    lineCount++;
    words += countWords(line);
  }
  return { lines: lineCount, words };
}
