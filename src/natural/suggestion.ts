import { Option, String as EffectString } from "effect";

import { damerauLevenshteinDistance } from "./correction.ts";
import type { DamerauLevenshteinWorkspace } from "./correction.ts";

const completionCost = (
  input: string,
  target: string,
  targetStart: number,
  targetEnd: number,
  workspace: DamerauLevenshteinWorkspace,
) => {
  const targetLength = targetEnd - targetStart;
  if (input.length <= targetLength && target.startsWith(input, targetStart)) return 0;
  if (input.length < 3 || input.charCodeAt(0) !== target.charCodeAt(targetStart)) return undefined;

  const maximum = input.length >= 5 ? 2 : 1;
  let minimum = maximum + 1;
  let previousLength = -1;
  for (const length of [
    Math.max(1, input.length - 1),
    input.length,
    Math.min(targetLength, input.length + 1),
  ]) {
    if (length === previousLength) continue;
    previousLength = length;
    minimum = Math.min(
      minimum,
      damerauLevenshteinDistance(
        input,
        target.slice(targetStart, targetStart + length),
        maximum,
        workspace,
      ),
    );
  }
  return minimum <= maximum ? minimum : undefined;
};

const phraseScore = (
  input: string,
  inputWords: ReadonlyArray<string>,
  phrase: string,
  workspace: DamerauLevenshteinWorkspace,
) => {
  if (input === phrase) return 0;
  if (phrase.startsWith(input)) return 1;

  let cost = 0;
  let addedWords = 0;
  let phraseStart = 0;
  for (const inputWord of inputWords) {
    let phraseEnd = phrase.indexOf(" ", phraseStart);
    if (phraseEnd === -1) phraseEnd = phrase.length;
    let wordCost = completionCost(inputWord, phrase, phraseStart, phraseEnd, workspace);
    while (wordCost === undefined && addedWords < 3) {
      phraseStart = phraseEnd + 1;
      phraseEnd = phrase.indexOf(" ", phraseStart);
      if (phraseEnd === -1) phraseEnd = phrase.length;
      addedWords += 1;
      wordCost = completionCost(inputWord, phrase, phraseStart, phraseEnd, workspace);
    }
    if (wordCost === undefined) return undefined;
    cost += wordCost;
    phraseStart = phraseEnd + 1;
  }
  return 2 + cost + addedWords;
};

const completeYearPrefix = (input: string) => {
  const match = EffectString.match(/(?:^| )(\d{3,4})$/u)(input);
  if (Option.isNone(match)) return [];
  const prefix = match.value[1] ?? "";
  if (prefix.length === 4) {
    const year = Number(prefix);
    return year >= 1 && year <= 9998 ? [prefix] : [];
  }
  return Array.from({ length: 10 }, (_, digit) => `${prefix}${digit}`).filter((year) => {
    const value = Number(year);
    return value >= 1 && value <= 9998;
  });
};

export const fixedCalendarPeriodPhrases = (input: string, months: ReadonlyArray<string>) =>
  completeYearPrefix(input).flatMap((year) => [
    year,
    ...months.map((month) => `${month} ${year}`),
    ...[1, 2, 3, 4].map((quarter) => `q${quarter} ${year}`),
  ]);

export const prefixNaturalPhrases = (
  phrases: ReadonlyArray<string>,
  prefixes: ReadonlyArray<string>,
) => phrases.flatMap((phrase) => prefixes.map((prefix) => `${prefix}${phrase}`));

export const naturalCount = (input: string) => {
  const match = EffectString.match(/(?:^| )([1-9]\d*)(?: |$)/u)(input);
  if (Option.isNone(match)) return undefined;
  const value = Number(match.value[1]);
  return Number.isSafeInteger(value) ? value : undefined;
};

export const completeNaturalPhrases = (
  input: string,
  phrases: ReadonlyArray<string>,
  limit: number,
) => {
  const ranked: Array<{ readonly phrase: string; readonly score: number; readonly index: number }> =
    [];
  const inputWords = input.split(" ");
  const workspace: DamerauLevenshteinWorkspace = [[], [], []];
  let index = 0;
  for (const phrase of new Set(phrases)) {
    const score = phraseScore(input, inputWords, phrase, workspace);
    if (score !== undefined) ranked.push({ phrase, score, index });
    index += 1;
  }
  ranked.sort((left, right) => left.score - right.score || left.index - right.index);
  const maximumScore = (ranked[0]?.score ?? 2) <= 1 ? 1 : Number.POSITIVE_INFINITY;
  const matches: Array<string> = [];
  for (const entry of ranked) {
    if (entry.score > maximumScore || matches.length >= limit) break;
    matches.push(entry.phrase);
  }
  return matches;
};
