import { Option, String as EffectString } from "effect";

import { Correction, NaturalCorrectionCandidate } from "../language/model.ts";
import { naturalWords } from "./text.ts";

interface PartialCorrection {
  readonly words: ReadonlyArray<string>;
  readonly corrections: ReadonlyArray<Correction>;
  readonly cost: number;
  readonly offset: number;
}

const isProtectedToken = (word: string) =>
  Option.isSome(EffectString.match(/^\d+$/u)(word)) ||
  Option.isSome(EffectString.match(/^\d{4}-\d{2}-\d{2}$/u)(word)) ||
  word.length <= 3;

const damerauLevenshtein = (left: string, right: string) => {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(columns).fill(0));
  for (let row = 0; row < rows; row += 1) matrix[row][0] = row;
  for (let column = 0; column < columns; column += 1) matrix[0][column] = column;

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitution = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitution,
      );
      if (
        row > 1 &&
        column > 1 &&
        left[row - 1] === right[column - 2] &&
        left[row - 2] === right[column - 1]
      ) {
        matrix[row][column] = Math.min(matrix[row][column], matrix[row - 2][column - 2] + 1);
      }
    }
  }
  return matrix[left.length][right.length];
};

const replacementsFor = (word: string, vocabulary: ReadonlyArray<string>) => {
  if (vocabulary.includes(word)) return [{ word, distance: 0 }];
  if (isProtectedToken(word)) return [];
  const maximum = word.length >= 6 ? 2 : 1;
  const matches = vocabulary
    .map((candidate) => ({
      word: candidate,
      distance: damerauLevenshtein(word, candidate),
    }))
    .filter((candidate) => candidate.distance <= maximum);
  if (matches.length === 0) return [];
  const minimum = Math.min(...matches.map((candidate) => candidate.distance));
  return matches.filter((candidate) => candidate.distance === minimum).slice(0, 4);
};

export const correctWhitespaceSeparatedText = (
  input: string,
  vocabulary: ReadonlyArray<string>,
) => {
  const words = naturalWords(input);
  let partials: ReadonlyArray<PartialCorrection> = [
    { words: [], corrections: [], cost: 0, offset: 0 },
  ];

  for (const word of words) {
    const replacements = replacementsFor(word, vocabulary);
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
