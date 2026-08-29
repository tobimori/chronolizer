import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { formatFilter } from "../src/filter/codec.ts";
import { DutchLanguageLayer } from "../src/locales/nl.ts";
import {
  formatNatural,
  NaturalLanguageParseError,
  parseNatural,
  suggestNatural,
} from "../src/index.ts";

const parseDutch = (input: string, typoMode: "strict" | "tolerant" = "strict") =>
  parseNatural(input, { locale: "nl", typoMode }).pipe(Effect.provide(DutchLanguageLayer));

const suggestDutch = (input: string, limit = 10, allowFuture = true) =>
  suggestNatural(input, { locale: "nl", limit, allowFuture }).pipe(
    Effect.provide(DutchLanguageLayer),
  );

describe("Dutch date ranges", () => {
  it.effect.each([
    ["vandaag", "now/d", "now/d+1d"],
    ["gisteren", "now-1d/d", "now-1d/d+1d"],
    ["morgen", "now+1d/d", "now+1d/d+1d"],
    ["vorige week", "now-1w/w", "now-1w/w+1w"],
    ["deze week", "now/w", "now/w+1w"],
    ["volgende week", "now+1w/w", "now+1w/w+1w"],
    ["vorige maand", "now-1M/M", "now-1M/M+1M"],
    ["deze maand", "now/M", "now/M+1M"],
    ["volgende maand", "now+1M/M", "now+1M/M+1M"],
    ["vorig kwartaal", "now-1q/q", "now-1q/q+1q"],
    ["dit kwartaal", "now/q", "now/q+1q"],
    ["volgend kwartaal", "now+1q/q", "now+1q/q+1q"],
    ["vorig jaar", "now-1y/y", "now-1y/y+1y"],
    ["dit jaar", "now/y", "now/y+1y"],
    ["volgend jaar", "now+1y/y", "now+1y/y+1y"],
  ] as const)(
    "parses Dutch relative calendar period %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseDutch(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    "jaar tot nu toe",
    "dit jaar tot nu toe",
    "sinds het begin van het jaar",
    "vanaf het begin van het jaar",
    "sinds jaarbegin",
    "vanaf jaarbegin",
    "sinds het begin van dit jaar",
  ])(
    "canonicalizes Dutch year-to-date variant %j",
    Effect.fn(function* (input) {
      const result = yield* parseDutch(input);
      expect(formatFilter(result.range)).toEqual({ gte: "now/y", lte: "now" });
      expect(yield* formatNatural(result.range, { locale: "nl" })).toBe("jaar tot nu toe");
    }, Effect.provide(DutchLanguageLayer)),
  );

  it.effect.each([
    "de afgelopen 3 maanden",
    "afgelopen 3 maanden",
    "de laatste 3 maanden",
    "3 afgelopen maanden",
    "sinds 3 maanden",
    "gedurende 3 maanden",
    "3 maanden",
  ])(
    "canonicalizes Dutch counted-month variant %j",
    Effect.fn(function* (input) {
      const result = yield* parseDutch(input);
      expect(formatFilter(result.range)).toEqual({ gte: "now-3M", lte: "now" });
      expect(yield* formatNatural(result.range, { locale: "nl" })).toBe("de afgelopen 3 maanden");
    }, Effect.provide(DutchLanguageLayer)),
  );

  it.effect.each([
    ["afgelopen 2 dagen", "now-2d"],
    ["afgelopen 2 weken", "now-2w"],
    ["afgelopen 2 maanden", "now-2M"],
    ["afgelopen 2 kwartalen", "now-2q"],
    ["afgelopen 2 jaar", "now-2y"],
  ] as const)(
    "maps Dutch trailing unit in %s",
    Effect.fn(function* (testCase) {
      const [input, gte] = testCase;
      expect(formatFilter((yield* parseDutch(input)).range)).toEqual({ gte, lte: "now" });
    }),
  );

  it.effect.each([
    ["komende 2 dagen", "now+2d"],
    ["volgende 2 weken", "now+2w"],
    ["de komende 2 maanden", "now+2M"],
    ["aankomende 2 kwartalen", "now+2q"],
    ["volgende 2 jaar", "now+2y"],
  ] as const)(
    "maps Dutch future rolling unit in %s",
    Effect.fn(function* (testCase) {
      const [input, lte] = testCase;
      expect(formatFilter((yield* parseDutch(input)).range)).toEqual({ gte: "now", lte });
    }),
  );

  it.effect.each([
    ["30 maanden geleden", "now-30M/M", "now-30M/M+1M", "30 maanden geleden"],
    ["over 2 weken", "now+2w/w", "now+2w/w+1w", "over 2 weken"],
    ["binnen 3 jaar", "now+3y/y", "now+3y/y+1y", "over 3 jaar"],
    ["2 dagen later", "now+2d/d", "now+2d/d+1d", "over 2 dagen"],
    ["1 dag geleden", "now-1d/d", "now-1d/d+1d", "gisteren"],
  ] as const)(
    "maps Dutch calendar offset %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt, canonical] = testCase;
      const result = yield* parseDutch(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
      expect(yield* formatNatural(result.range, { locale: "nl" })).toBe(canonical);
    }, Effect.provide(DutchLanguageLayer)),
  );

  it.effect.each([
    ["januari 2025", "2025-01-01", "2025-02-01"],
    ["februari 2025", "2025-02-01", "2025-03-01"],
    ["maart 2025", "2025-03-01", "2025-04-01"],
    ["april 2025", "2025-04-01", "2025-05-01"],
    ["mei 2025", "2025-05-01", "2025-06-01"],
    ["juni 2025", "2025-06-01", "2025-07-01"],
    ["juli 2025", "2025-07-01", "2025-08-01"],
    ["augustus 2025", "2025-08-01", "2025-09-01"],
    ["september 2025", "2025-09-01", "2025-10-01"],
    ["oktober 2025", "2025-10-01", "2025-11-01"],
    ["november 2025", "2025-11-01", "2025-12-01"],
    ["december 2025", "2025-12-01", "2026-01-01"],
  ] as const)(
    "maps fixed Dutch month %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseDutch(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["K1 2025", "2025-01-01", "2025-04-01", "K1 2025"],
    ["Q2 van 2025", "2025-04-01", "2025-07-01", "K2 2025"],
    ["derde kwartaal van 2025", "2025-07-01", "2025-10-01", "K3 2025"],
    ["4e kwartaal 2025", "2025-10-01", "2026-01-01", "K4 2025"],
  ] as const)(
    "maps Dutch quarter expression %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt, canonical] = testCase;
      const result = yield* parseDutch(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
      expect(yield* formatNatural(result.range, { locale: "nl" })).toBe(canonical);
    }, Effect.provide(DutchLanguageLayer)),
  );

  it.effect.each([
    ["K1 vorig jaar", "now-1y/y", "now-1y/y+1q"],
    ["K2 dit jaar", "now/y+3M", "now/y+3M+1q"],
    ["K4 volgend jaar", "now+1y/y+9M", "now+1y/y+9M+1q"],
  ] as const)(
    "maps Dutch quarter in a relative year %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseDutch(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["1 januari 2025", "2025-01-01", "2025-01-02"],
    ["de 31e van dec. 2025", "2025-12-31", "2026-01-01"],
    ["29/2/2024", "2024-02-29", "2024-03-01"],
    ["1.3.2025", "2025-03-01", "2025-03-02"],
  ] as const)(
    "maps Dutch absolute date %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseDutch(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["eergisteren", "now-2d/d", "now-2d/d+1d"],
    ["overmorgen", "now+2d/d", "now+2d/d+1d"],
    ["de maand voor de vorige", "now-2M/M", "now-2M/M+1M"],
    ["het jaar na het volgende", "now+2y/y", "now+2y/y+1y"],
  ] as const)(
    "maps outer Dutch relative period %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseDutch(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["januari vorig jaar", "now-1y/y", "now-1y/y+1M"],
    ["dit jaar maart", "now/y+2M", "now/y+3M"],
    ["december van volgend jaar", "now+1y/y+11M", "now+1y/y+12M"],
  ] as const)(
    "maps Dutch month in a relative year %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseDutch(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["vanaf januari 2025", { gte: "2025-01-01" }],
    ["sinds januari 2025", { gte: "2025-01-01" }],
    ["voor januari 2025", { lt: "2025-01-01" }],
    ["tot januari 2025", { lt: "2025-02-01" }],
    ["tot en met januari 2025", { lt: "2025-02-01" }],
    ["tot voor januari 2025", { lt: "2025-01-01" }],
    ["na januari 2025", { gte: "2025-02-01" }],
    ["vanaf nu", { gte: "now" }],
    ["tot nu toe", { lte: "now" }],
  ] as const)(
    "maps Dutch open boundary %s",
    Effect.fn(function* (testCase) {
      const [input, filter] = testCase;
      expect(formatFilter((yield* parseDutch(input)).range)).toEqual(filter);
    }),
  );

  it.effect.each([
    "van januari 2025 tot en met maart 2025",
    "van januari 2025 tot maart 2025",
    "tussen januari 2025 en maart 2025",
    "januari 2025 - maart 2025",
  ])(
    "maps Dutch joined range %j",
    Effect.fn(function* (input) {
      const result = yield* parseDutch(input);
      expect(formatFilter(result.range)).toEqual({ gte: "2025-01-01", lt: "2025-04-01" });
      expect(yield* formatNatural(result.range, { locale: "nl" })).toBe("K1 2025");
    }, Effect.provide(DutchLanguageLayer)),
  );

  it.effect.each([
    ["jan. 2025", "2025-01-01", "2025-02-01"],
    ["mrt 2025", "2025-03-01", "2025-04-01"],
    ["sept. 2025", "2025-09-01", "2025-10-01"],
    ["okt. 2025", "2025-10-01", "2025-11-01"],
  ] as const)(
    "maps Dutch abbreviated month %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseDutch(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["begin van dit jaar", "now/y", "now/y+1d"],
    ["begin volgende maand", "now+1M/M", "now+1M/M+1d"],
    ["eind van vorig jaar", "now-1y/y+1y-1d", "now-1y/y+1y"],
  ] as const)(
    "maps Dutch period edge %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseDutch(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["vanaf januari 2025 tot nu toe", { gte: "2025-01-01", lte: "now" }],
    ["vanaf nu tot en met maart 2025", { gte: "now", lt: "2025-04-01" }],
    ["tussen vandaag en maart 2025", { gte: "now", lt: "2025-04-01" }],
  ] as const)(
    "maps Dutch now-bounded range %s",
    Effect.fn(function* (testCase) {
      const [input, filter] = testCase;
      expect(formatFilter((yield* parseDutch(input)).range)).toEqual(filter);
    }),
  );

  it.effect.each([
    ["rest van de maand", "now/M+1M"],
    ["rest van de week", "now/w+1w"],
    ["wat over is van het jaar", "now/y+1y"],
  ] as const)(
    "maps Dutch remaining period %s",
    Effect.fn(function* (testCase) {
      const [input, lt] = testCase;
      expect(formatFilter((yield* parseDutch(input)).range)).toEqual({ gte: "now", lt });
    }),
  );

  it.effect.each(["31 april 2025", "29/2/2025", "13/13/2025", "januari 20"])(
    "rejects invalid Dutch absolute period %j",
    Effect.fn(function* (input) {
      const error = yield* Effect.flip(parseDutch(input));
      expect(error).toBeInstanceOf(NaturalLanguageParseError);
    }),
  );

  it.effect(
    "corrects a Dutch typo only in tolerant mode",
    Effect.fn(function* () {
      expect((yield* parseDutch("janurai 2025", "tolerant")).quality).toBe("corrected");
      const error = yield* Effect.flip(parseDutch("janurai 2025"));
      expect(error).toBeInstanceOf(NaturalLanguageParseError);
    }),
  );

  it.effect.each([
    ["volgende m", "volgende maand"],
    ["janu", "Januari"],
    ["afgelopen 3 maan", "de afgelopen 3 maanden"],
    ["vanaf jan", "vanaf Januari"],
  ] as const)(
    "suggests Dutch completion for %j",
    Effect.fn(function* (testCase) {
      const [input, expected] = testCase;
      const [suggestion] = yield* suggestDutch(input);
      if (suggestion === undefined) return expect.fail("Expected a suggestion");
      expect(suggestion.text).toBe(expected);
    }),
  );

  it.effect(
    "completes a partial Dutch year",
    Effect.fn(function* () {
      const suggestions = yield* suggestDutch("januari 202", 2);
      expect(suggestions.map((entry) => entry.text)).toEqual(["Januari 2020", "Januari 2021"]);
    }),
  );

  it.effect(
    "filters positive Dutch suggestions",
    Effect.fn(function* () {
      expect(yield* suggestDutch("volgende m", 10, false)).toEqual([]);
    }),
  );
});
