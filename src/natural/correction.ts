import { Correction, NaturalCorrectionCandidate } from "../language/model.ts";
import { naturalWords } from "./text.ts";

interface PartialCorrection {
  readonly text: string;
  readonly corrections: ReadonlyArray<Correction>;
  readonly cost: number;
  readonly offset: number;
}

const isProtectedValue = (word: string) => /^(?:\d+|\d{4}-\d{2}-\d{2})$/u.test(word);

export type DamerauLevenshteinWorkspace = readonly [
  first: Array<number>,
  second: Array<number>,
  third: Array<number>,
];

export const damerauLevenshteinDistance = (
  left: string,
  right: string,
  maximum: number = Math.max(left.length, right.length),
  workspace: DamerauLevenshteinWorkspace = [[], [], []],
) => {
  const outside = maximum + 1;
  if (Math.abs(left.length - right.length) > maximum) return outside;

  const width = right.length + 1;
  let [previousPrevious, previous, current] = workspace;
  for (const row of workspace) {
    row.length = width;
    row.fill(outside);
  }
  for (let column = 0; column <= Math.min(right.length, maximum); column += 1) {
    previous[column] = column;
  }

  for (let row = 1; row <= left.length; row += 1) {
    current.fill(outside);
    if (row <= maximum) current[0] = row;
    const firstColumn = Math.max(1, row - maximum);
    const lastColumn = Math.min(right.length, row + maximum);
    let rowMinimum = row <= maximum ? row : outside;
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      const substitution = left.charCodeAt(row - 1) === right.charCodeAt(column - 1) ? 0 : 1;
      let distance = Math.min(
        (previous[column] ?? outside) + 1,
        (current[column - 1] ?? outside) + 1,
        (previous[column - 1] ?? outside) + substitution,
      );
      if (
        row > 1 &&
        column > 1 &&
        left.charCodeAt(row - 1) === right.charCodeAt(column - 2) &&
        left.charCodeAt(row - 2) === right.charCodeAt(column - 1)
      ) {
        distance = Math.min(distance, (previousPrevious[column - 2] ?? outside) + 1);
      }
      current[column] = distance;
      rowMinimum = Math.min(rowMinimum, distance);
    }
    if (rowMinimum > maximum) return outside;
    const reusable = previousPrevious;
    previousPrevious = previous;
    previous = current;
    current = reusable;
  }
  return previous[right.length] ?? outside;
};

export const damerauLevenshteinDistanceWithin = (
  left: string,
  right: string,
  maximum: number,
  workspace?: DamerauLevenshteinWorkspace,
) => {
  const distance = damerauLevenshteinDistance(left, right, maximum, workspace);
  return distance <= maximum ? distance : undefined;
};

const segmentedReplacements = (word: string, vocabulary: ReadonlySet<string>) => {
  const segmentations: Array<Array<ReadonlyArray<string>>> = Array.from(
    { length: word.length + 1 },
    () => [],
  );
  const initial = segmentations[0];
  if (initial !== undefined) initial.push([]);

  for (let start = 0; start < word.length; start += 1) {
    const prefixes = segmentations[start] ?? [];
    if (prefixes.length === 0) continue;
    for (let end = start + 1; end <= word.length; end += 1) {
      const part = word.slice(start, end);
      if (!vocabulary.has(part)) continue;
      const target = segmentations[end];
      if (target === undefined) continue;
      for (const prefix of prefixes) {
        if (target.length >= 4) break;
        target.push([...prefix, part]);
      }
    }
  }

  return (segmentations[word.length] ?? [])
    .filter((parts) => parts.length > 1)
    .map((parts) => ({ word: parts.join(" "), distance: parts.length - 1 }));
};

const vocabularySets = new WeakMap<ReadonlyArray<string>, ReadonlySet<string>>();

const vocabularySet = (vocabulary: ReadonlyArray<string>) => {
  const cached = vocabularySets.get(vocabulary);
  if (cached !== undefined) return cached;
  const words = new Set(vocabulary);
  vocabularySets.set(vocabulary, words);
  return words;
};

const replacementsFor = (
  word: string,
  vocabulary: ReadonlySet<string>,
  segmentationVocabulary: ReadonlySet<string>,
  workspace: DamerauLevenshteinWorkspace,
) => {
  if (vocabulary.has(word) || isProtectedValue(word)) return [{ word, distance: 0 }];

  const segmented = segmentedReplacements(word, segmentationVocabulary);
  if (word.length <= 3) return segmented;

  const maximum = word.length >= 6 ? 2 : 1;
  let minimum = Number.POSITIVE_INFINITY;
  const matches: Array<{ readonly word: string; readonly distance: number }> = [];
  const addMatch = (replacement: string, distance: number) => {
    if (distance > minimum) return;
    if (distance < minimum) {
      minimum = distance;
      matches.length = 0;
    }
    if (matches.length < 4) matches.push({ word: replacement, distance });
  };
  for (const replacement of segmented) addMatch(replacement.word, replacement.distance);
  for (const candidate of vocabulary) {
    if (Math.abs(candidate.length - word.length) > maximum) continue;
    const distance = damerauLevenshteinDistance(word, candidate, maximum, workspace);
    if (distance <= maximum) addMatch(candidate, distance);
  }
  return matches;
};

const emptySegmentationVocabulary: ReadonlySet<string> = new Set();

export const correctWhitespaceSeparatedText = (
  input: string,
  vocabulary: ReadonlyArray<string>,
  segmentationVocabulary: ReadonlySet<string> = emptySegmentationVocabulary,
) => {
  const words = naturalWords(input);
  const wordsInVocabulary = vocabularySet(vocabulary);
  const workspace: DamerauLevenshteinWorkspace = [[], [], []];
  let partials: ReadonlyArray<PartialCorrection> = [
    { text: "", corrections: [], cost: 0, offset: 0 },
  ];

  for (const word of words) {
    const replacements = replacementsFor(
      word,
      wordsInVocabulary,
      segmentationVocabulary,
      workspace,
    );
    if (replacements.length === 0) return [];
    const next: Array<PartialCorrection> = [];
    for (const partial of partials) {
      for (const replacement of replacements) {
        const correction =
          replacement.distance === 0
            ? partial.corrections
            : [
                ...partial.corrections,
                Correction.make({
                  original: word,
                  replacement: replacement.word,
                  distance: replacement.distance,
                  offset: partial.offset,
                }),
              ];
        next.push({
          text:
            partial.text.length === 0 ? replacement.word : `${partial.text} ${replacement.word}`,
          corrections: correction,
          cost: partial.cost + replacement.distance,
          offset: partial.offset + word.length + 1,
        });
      }
    }
    partials = next.slice(0, 32);
  }

  return partials
    .filter((partial) => partial.corrections.length > 0)
    .map((partial) =>
      NaturalCorrectionCandidate.make({
        text: partial.text,
        corrections: partial.corrections,
        cost: partial.cost,
      }),
    );
};
