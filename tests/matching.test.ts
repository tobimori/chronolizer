import { describe, expect, it } from "@effect/vitest";

import {
  damerauLevenshteinDistance,
  damerauLevenshteinDistanceWithin,
} from "../src/natural/correction.ts";
import { completeNaturalPhrases } from "../src/natural/suggestion.ts";

describe("natural-language matching", () => {
  it.each([
    ["", "", 0],
    ["year", "year", 0],
    ["yaer", "year", 1],
    ["janury", "january", 1],
    ["january", "janury", 1],
    ["january", "february", 4],
  ] as const)("measures Damerau-Levenshtein distance from %j to %j", (left, right, distance) => {
    expect(damerauLevenshteinDistance(left, right)).toBe(distance);
  });

  it.each([
    ["", "", 0, 0],
    ["a", "", 1, 1],
    ["year", "year", 0, 0],
    ["yaer", "year", 1, 1],
    ["janury", "january", 1, 1],
    ["january", "february", 2, undefined],
  ] as const)(
    "stops bounded edit-distance work for %j and %j at %d",
    (left, right, maximum, distance) => {
      expect(damerauLevenshteinDistanceWithin(left, right, maximum)).toBe(distance);
    },
  );

  it("ranks exact, prefix, and fuzzy-prefix matches deterministically", () => {
    const phrases = ["last month", "last monday", "last month to date"];
    expect(completeNaturalPhrases("last month", phrases, 3)).toEqual([
      "last month",
      "last month to date",
    ]);
    expect(completeNaturalPhrases("last m", phrases, 3)).toEqual(phrases);
    expect(completeNaturalPhrases("las mnth", phrases, 3)).toEqual([
      "last month",
      "last month to date",
    ]);
  });

  it("does not fuzzy-match short or first-character errors", () => {
    expect(completeNaturalPhrases("ls m", ["last month"], 1)).toEqual([]);
    expect(completeNaturalPhrases("xast m", ["last month"], 1)).toEqual([]);
  });
});
