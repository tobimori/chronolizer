import { Array as EffectArray, Option, String as EffectString } from "effect";

import { damerauLevenshteinDistance } from "./correction.ts";

const fuzzyPrefixDistance = (input: string, target: string) => {
  const lengths = EffectArray.dedupe([
    Math.max(1, input.length - 1),
    input.length,
    Math.min(target.length, input.length + 1),
  ]);
  return Math.min(
    ...lengths.map((length) => damerauLevenshteinDistance(input, target.slice(0, length))),
  );
};

const completionCost = (input: string, target: string) => {
  if (input === target || target.startsWith(input)) return 0;
  if (input.length < 3 || input[0] !== target[0]) return undefined;
  const maximum = input.length >= 5 ? 2 : 1;
  const distance = fuzzyPrefixDistance(input, target);
  return distance <= maximum ? distance : undefined;
};

const phraseScore = (input: string, phrase: string) => {
  if (input === phrase) return 0;
  if (phrase.startsWith(input)) return 1;

  const inputWords = input.split(" ");
  const phraseWords = phrase.split(" ");
  if (inputWords.length > phraseWords.length) return undefined;

  let cost = 0;
  let addedWords = 0;
  let phraseIndex = 0;
  for (const inputWord of inputWords) {
    let wordCost = completionCost(inputWord, phraseWords[phraseIndex] ?? "");
    while (wordCost === undefined && addedWords < 3) {
      phraseIndex += 1;
      addedWords += 1;
      wordCost = completionCost(inputWord, phraseWords[phraseIndex] ?? "");
    }
    if (wordCost === undefined) return undefined;
    cost += wordCost;
    phraseIndex += 1;
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
  for (const [index, phrase] of EffectArray.dedupe(phrases).entries()) {
    const score = phraseScore(input, phrase);
    if (score !== undefined) ranked.push({ phrase, score, index });
  }
  const sorted = ranked.sort((left, right) => left.score - right.score || left.index - right.index);
  const matches = sorted.some((entry) => entry.score <= 1)
    ? sorted.filter((entry) => entry.score <= 1)
    : sorted;
  return matches.slice(0, limit).map((entry) => entry.phrase);
};
