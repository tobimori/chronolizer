import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { formatFilter } from "../src/filter/codec.ts";
import { PolishLanguageLayer } from "../src/locales/pl.ts";
import {
  formatNatural,
  NaturalLanguageParseError,
  parseNatural,
  suggestNatural,
} from "../src/index.ts";

const parsePolish = (input: string, typoMode: "strict" | "tolerant" = "strict") =>
  parseNatural(input, { locale: "pl", typoMode }).pipe(Effect.provide(PolishLanguageLayer));

const suggestPolish = (input: string, limit = 10, allowFuture = true) =>
  suggestNatural(input, { locale: "pl", limit, allowFuture }).pipe(
    Effect.provide(PolishLanguageLayer),
  );

describe("Polish date ranges", () => {
  it.effect.each([
    ["dzisiaj", "now/d", "now/d+1d"],
    ["wczoraj", "now-1d/d", "now-1d/d+1d"],
    ["jutro", "now+1d/d", "now+1d/d+1d"],
    ["poprzedni tydzień", "now-1w/w", "now-1w/w+1w"],
    ["ten tydzień", "now/w", "now/w+1w"],
    ["następny tydzień", "now+1w/w", "now+1w/w+1w"],
    ["poprzedni miesiąc", "now-1M/M", "now-1M/M+1M"],
    ["ten miesiąc", "now/M", "now/M+1M"],
    ["następny miesiąc", "now+1M/M", "now+1M/M+1M"],
    ["poprzedni kwartał", "now-1q/q", "now-1q/q+1q"],
    ["ten kwartał", "now/q", "now/q+1q"],
    ["następny kwartał", "now+1q/q", "now+1q/q+1q"],
    ["poprzedni rok", "now-1y/y", "now-1y/y+1y"],
    ["ten rok", "now/y", "now/y+1y"],
    ["następny rok", "now+1y/y", "now+1y/y+1y"],
  ] as const)(
    "parses Polish relative calendar period %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parsePolish(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    "rok do dziś",
    "od początku roku",
    "od początku roku do dziś",
    "w tym roku do dziś",
  ])(
    "canonicalizes Polish year-to-date variant %j",
    Effect.fn(function* (input) {
      const result = yield* parsePolish(input);
      expect(formatFilter(result.range)).toEqual({ gte: "now/y", lte: "now" });
      expect(yield* formatNatural(result.range, { locale: "pl" })).toBe("rok do dziś");
    }, Effect.provide(PolishLanguageLayer)),
  );

  it.effect.each([
    "ostatnie 3 miesiące",
    "minione 3 miesiące",
    "ostatnich 5 miesięcy",
    "5 miesięcy",
  ])(
    "canonicalizes Polish counted-month variant %j",
    Effect.fn(function* (input) {
      const result = yield* parsePolish(input);
      const amount = input.includes("5") ? 5 : 3;
      expect(formatFilter(result.range)).toEqual({ gte: `now-${amount}M`, lte: "now" });
      const noun = amount === 5 ? "miesięcy" : "miesiące";
      const modifier = amount === 5 ? "ostatnich" : "ostatnie";
      expect(yield* formatNatural(result.range, { locale: "pl" })).toBe(
        `${modifier} ${amount} ${noun}`,
      );
    }, Effect.provide(PolishLanguageLayer)),
  );

  it.effect.each([
    ["ostatni 1 dzień", "now-1d", "ostatni 1 dzień"],
    ["ostatnie 3 tygodnie", "now-3w", "ostatnie 3 tygodnie"],
    ["ostatnich 5 miesięcy", "now-5M", "ostatnich 5 miesięcy"],
    ["ostatnich 12 kwartałów", "now-12q", "ostatnich 12 kwartałów"],
    ["ostatnie 2 lata", "now-2y", "ostatnie 2 lata"],
  ] as const)(
    "maps Polish trailing unit in %s",
    Effect.fn(function* (testCase) {
      const [input, gte, canonical] = testCase;
      const result = yield* parsePolish(input);
      expect(formatFilter(result.range)).toEqual({ gte, lte: "now" });
      expect(yield* formatNatural(result.range, { locale: "pl" })).toBe(canonical);
    }, Effect.provide(PolishLanguageLayer)),
  );

  it.effect.each([
    ["następne 2 dni", "now+2d"],
    ["kolejne 3 tygodnie", "now+3w"],
    ["następnych 5 miesięcy", "now+5M"],
    ["kolejnych 12 kwartałów", "now+12q"],
    ["następne 3 lata", "now+3y"],
  ] as const)(
    "maps Polish future rolling unit in %s",
    Effect.fn(function* (testCase) {
      const [input, lte] = testCase;
      expect(formatFilter((yield* parsePolish(input)).range)).toEqual({ gte: "now", lte });
    }),
  );

  it.effect.each([
    ["30 miesięcy temu", "now-30M/M", "now-30M/M+1M", "30 miesięcy temu"],
    ["za 2 tygodnie", "now+2w/w", "now+2w/w+1w", "za 2 tygodnie"],
    ["za 5 lat", "now+5y/y", "now+5y/y+1y", "za 5 lat"],
    ["1 dzień temu", "now-1d/d", "now-1d/d+1d", "wczoraj"],
  ] as const)(
    "maps Polish calendar offset %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt, canonical] = testCase;
      const result = yield* parsePolish(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
      expect(yield* formatNatural(result.range, { locale: "pl" })).toBe(canonical);
    }, Effect.provide(PolishLanguageLayer)),
  );

  it.effect.each([
    ["styczeń 2025", "2025-01-01", "2025-02-01"],
    ["luty 2025", "2025-02-01", "2025-03-01"],
    ["marzec 2025", "2025-03-01", "2025-04-01"],
    ["kwiecień 2025", "2025-04-01", "2025-05-01"],
    ["maj 2025", "2025-05-01", "2025-06-01"],
    ["czerwiec 2025", "2025-06-01", "2025-07-01"],
    ["lipiec 2025", "2025-07-01", "2025-08-01"],
    ["sierpień 2025", "2025-08-01", "2025-09-01"],
    ["wrzesień 2025", "2025-09-01", "2025-10-01"],
    ["październik 2025", "2025-10-01", "2025-11-01"],
    ["listopad 2025", "2025-11-01", "2025-12-01"],
    ["grudzień 2025", "2025-12-01", "2026-01-01"],
  ] as const)(
    "maps fixed Polish month %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parsePolish(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["Q1 2025", "2025-01-01", "2025-04-01", "Q1 2025"],
    ["2. kwartał 2025", "2025-04-01", "2025-07-01", "Q2 2025"],
    ["trzeci kwartał 2025", "2025-07-01", "2025-10-01", "Q3 2025"],
    ["czwarty kwartał 2025", "2025-10-01", "2026-01-01", "Q4 2025"],
  ] as const)(
    "maps Polish quarter expression %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt, canonical] = testCase;
      const result = yield* parsePolish(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
      expect(yield* formatNatural(result.range, { locale: "pl" })).toBe(canonical);
    }, Effect.provide(PolishLanguageLayer)),
  );

  it.effect.each([
    ["Q1 poprzedniego roku", "now-1y/y", "now-1y/y+1q"],
    ["Q2 tego roku", "now/y+3M", "now/y+3M+1q"],
    ["Q4 następnego roku", "now+1y/y+9M", "now+1y/y+9M+1q"],
  ] as const)(
    "maps Polish quarter in a relative year %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parsePolish(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["1 stycznia 2025", "2025-01-01", "2025-01-02"],
    ["31 grudnia 2025", "2025-12-31", "2026-01-01"],
    ["29. 2. 2024", "2024-02-29", "2024-03-01"],
    ["1/3/2025", "2025-03-01", "2025-03-02"],
  ] as const)(
    "maps Polish absolute date %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parsePolish(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each(["12 stycznia", "12. stycznia"])(
    "maps current-year Polish date %j",
    Effect.fn(function* (input) {
      const result = yield* parsePolish(input);
      expect(formatFilter(result.range)).toEqual({ gte: "now/y+11d", lt: "now/y+12d" });
      expect(yield* formatNatural(result.range, { locale: "pl" })).toBe("12. stycznia");
    }, Effect.provide(PolishLanguageLayer)),
  );

  it.effect.each([
    ["przedwczoraj", "now-2d/d", "now-2d/d+1d"],
    ["pojutrze", "now+2d/d", "now+2d/d+1d"],
    ["przedostatni miesiąc", "now-2M/M", "now-2M/M+1M"],
    ["rok po następnym", "now+2y/y", "now+2y/y+1y"],
  ] as const)(
    "maps outer Polish relative period %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parsePolish(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["styczeń poprzedniego roku", "now-1y/y", "now-1y/y+1M"],
    ["marzec tego roku", "now/y+2M", "now/y+3M"],
    ["grudzień następnego roku", "now+1y/y+11M", "now+1y/y+12M"],
  ] as const)(
    "maps Polish month in a relative year %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parsePolish(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["od stycznia 2025", { gte: "2025-01-01" }],
    ["począwszy od stycznia 2025", { gte: "2025-01-01" }],
    ["przed styczniem 2025", { lt: "2025-01-01" }],
    ["do stycznia 2025", { lt: "2025-02-01" }],
    ["do stycznia 2025 włącznie", { lt: "2025-02-01" }],
    ["po styczniu 2025", { gte: "2025-02-01" }],
    ["od teraz", { gte: "now" }],
    ["do dziś", { lte: "now" }],
  ] as const)(
    "maps Polish open boundary %s",
    Effect.fn(function* (testCase) {
      const [input, filter] = testCase;
      expect(formatFilter((yield* parsePolish(input)).range)).toEqual(filter);
    }),
  );

  it.effect.each([
    ["od stycznia 2025", "od stycznia 2025"],
    ["przed styczniem 2025", "przed styczniem 2025"],
    ["do stycznia 2025", "przed lutym 2025"],
    ["po styczniu 2025", "od lutego 2025"],
  ] as const)(
    "renders Polish month boundary %s with the required case",
    Effect.fn(function* (testCase) {
      const [input, expected] = testCase;
      const range = (yield* parsePolish(input)).range;
      expect(yield* formatNatural(range, { locale: "pl" })).toBe(expected);
    }, Effect.provide(PolishLanguageLayer)),
  );

  it.effect.each([
    "od stycznia 2025 do marca 2025",
    "między styczniem 2025 a marcem 2025",
    "styczeń 2025 - marzec 2025",
  ])(
    "maps Polish joined range %j",
    Effect.fn(function* (input) {
      const result = yield* parsePolish(input);
      expect(formatFilter(result.range)).toEqual({ gte: "2025-01-01", lt: "2025-04-01" });
      expect(yield* formatNatural(result.range, { locale: "pl" })).toBe("Q1 2025");
    }, Effect.provide(PolishLanguageLayer)),
  );

  it.effect.each([
    ["sty. 2025", "2025-01-01", "2025-02-01"],
    ["mar 2025", "2025-03-01", "2025-04-01"],
    ["paź 2025", "2025-10-01", "2025-11-01"],
    ["gru 2025", "2025-12-01", "2026-01-01"],
  ] as const)(
    "maps Polish abbreviated month %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parsePolish(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["początek tego roku", "now/y", "now/y+1d"],
    ["początek następnego miesiąca", "now+1M/M", "now+1M/M+1d"],
    ["koniec poprzedniego roku", "now-1y/y+1y-1d", "now-1y/y+1y"],
  ] as const)(
    "maps Polish period edge %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parsePolish(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["od stycznia 2025 do dziś", { gte: "2025-01-01", lte: "now" }],
    ["od dziś do marca 2025", { gte: "now", lt: "2025-04-01" }],
  ] as const)(
    "maps Polish now-bounded range %s",
    Effect.fn(function* (testCase) {
      const [input, filter] = testCase;
      expect(formatFilter((yield* parsePolish(input)).range)).toEqual(filter);
    }),
  );

  it.effect.each([
    ["reszta miesiąca", "now/M+1M"],
    ["reszta tygodnia", "now/w+1w"],
    ["reszta roku", "now/y+1y"],
  ] as const)(
    "maps Polish remaining period %s",
    Effect.fn(function* (testCase) {
      const [input, lt] = testCase;
      expect(formatFilter((yield* parsePolish(input)).range)).toEqual({ gte: "now", lt });
    }),
  );

  it.effect.each(["31 kwietnia 2025", "29. 2. 2025", "13.13.2025", "styczeń 20"])(
    "rejects invalid Polish absolute period %j",
    Effect.fn(function* (input) {
      expect(yield* Effect.flip(parsePolish(input))).toBeInstanceOf(NaturalLanguageParseError);
    }),
  );

  it.effect(
    "corrects a Polish typo only in tolerant mode",
    Effect.fn(function* () {
      expect((yield* parsePolish("styczen 2025", "tolerant")).quality).toBe("corrected");
      expect(yield* Effect.flip(parsePolish("styczen 2025"))).toBeInstanceOf(
        NaturalLanguageParseError,
      );
    }),
  );

  it.effect.each([
    ["następny m", "następny miesiąc"],
    ["sty", "Styczeń"],
    ["ostatnie 3 mies", "ostatnie 3 miesiące"],
    ["od sty", "od Styczeń"],
  ] as const)(
    "suggests Polish completion for %j",
    Effect.fn(function* (testCase) {
      const [input, expected] = testCase;
      const [suggestion] = yield* suggestPolish(input);
      if (suggestion === undefined) return expect.fail("Expected a suggestion");
      expect(suggestion.text).toBe(expected);
    }),
  );

  it.effect(
    "completes a partial Polish year",
    Effect.fn(function* () {
      expect((yield* suggestPolish("styczeń 202", 2)).map((entry) => entry.text)).toEqual([
        "Styczeń 2020",
        "Styczeń 2021",
      ]);
    }),
  );

  it.effect(
    "filters positive Polish suggestions",
    Effect.fn(function* () {
      expect(yield* suggestPolish("następny m", 10, false)).toEqual([]);
    }),
  );
});
