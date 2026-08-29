import { Option, String as EffectString } from "effect";

import { Correction, NaturalCorrectionCandidate } from "../language/model.ts";
import { naturalWords } from "./text.ts";

interface PartialCorrection {
  readonly words: ReadonlyArray<string>;
  readonly corrections: ReadonlyArray<Correction>;
  readonly cost: number;
  readonly offset: number;
}

const isProtectedValue = (word: string) =>
  Option.isSome(EffectString.match(/^\d+$/u)(word)) ||
  Option.isSome(EffectString.match(/^\d{4}-\d{2}-\d{2}$/u)(word));

export const damerauLevenshteinDistance = (left: string, right: string) => {
  const fallback = left.length + right.length;
  let previousPrevious: ReadonlyArray<number> | undefined;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      const substitution = left.charAt(row - 1) === right.charAt(column - 1) ? 0 : 1;
      const distance = Math.min(
        (previous[column] ?? fallback) + 1,
        (current[column - 1] ?? fallback) + 1,
        (previous[column - 1] ?? fallback) + substitution,
      );
      const transposed =
        previousPrevious !== undefined &&
        row > 1 &&
        column > 1 &&
        left.charAt(row - 1) === right.charAt(column - 2) &&
        left.charAt(row - 2) === right.charAt(column - 1)
          ? (previousPrevious[column - 2] ?? fallback) + 1
          : fallback;
      current.push(Math.min(distance, transposed));
    }
    previousPrevious = previous;
    previous = current;
  }
  return previous[right.length] ?? fallback;
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

const replacementsFor = (
  word: string,
  vocabulary: ReadonlyArray<string>,
  segmentationVocabulary: ReadonlySet<string>,
) => {
  if (vocabulary.includes(word) || isProtectedValue(word)) return [{ word, distance: 0 }];

  const segmented = segmentedReplacements(word, segmentationVocabulary);
  if (word.length <= 3) return segmented;

  const maximum = word.length >= 6 ? 2 : 1;
  const fuzzy = vocabulary
    .filter((candidate) => Math.abs(candidate.length - word.length) <= maximum)
    .map((candidate) => ({
      word: candidate,
      distance: damerauLevenshteinDistance(word, candidate),
    }))
    .filter((candidate) => candidate.distance <= maximum);
  const matches = [...segmented, ...fuzzy];
  if (matches.length === 0) return [];
  const minimum = Math.min(...matches.map((candidate) => candidate.distance));
  return matches.filter((candidate) => candidate.distance === minimum).slice(0, 4);
};

const emptySegmentationVocabulary: ReadonlySet<string> = new Set();

export const correctWhitespaceSeparatedText = (
  input: string,
  vocabulary: ReadonlyArray<string>,
  segmentationVocabulary: ReadonlySet<string> = emptySegmentationVocabulary,
) => {
  const words = naturalWords(input);
  let partials: ReadonlyArray<PartialCorrection> = [
    { words: [], corrections: [], cost: 0, offset: 0 },
  ];

  for (const word of words) {
    const replacements = replacementsFor(word, vocabulary, segmentationVocabulary);
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
          words: [...partial.words, replacement.word],
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
        text: partial.words.join(" "),
        corrections: partial.corrections,
        cost: partial.cost,
      }),
    );
};
