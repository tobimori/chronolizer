import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { formatFilter } from "../src/filter/codec.ts";
import { TurkishLanguageLayer } from "../src/locales/tr.ts";
import {
  formatNatural,
  NaturalLanguageParseError,
  parseNatural,
  suggestNatural,
} from "../src/index.ts";

const parseTurkish = (input: string, typoMode: "strict" | "tolerant" = "strict") =>
  parseNatural(input, { locale: "tr", typoMode }).pipe(Effect.provide(TurkishLanguageLayer));

const suggestTurkish = (input: string, limit = 10, allowFuture = true) =>
  suggestNatural(input, { locale: "tr", limit, allowFuture }).pipe(
    Effect.provide(TurkishLanguageLayer),
  );

describe("Turkish date ranges", () => {
  it.effect.each([
    ["bugün", "now/d", "now/d+1d"],
    ["dün", "now-1d/d", "now-1d/d+1d"],
    ["yarın", "now+1d/d", "now+1d/d+1d"],
    ["geçen hafta", "now-1w/w", "now-1w/w+1w"],
    ["bu hafta", "now/w", "now/w+1w"],
    ["gelecek hafta", "now+1w/w", "now+1w/w+1w"],
    ["geçen ay", "now-1M/M", "now-1M/M+1M"],
    ["bu ay", "now/M", "now/M+1M"],
    ["gelecek ay", "now+1M/M", "now+1M/M+1M"],
    ["geçen çeyrek", "now-1q/q", "now-1q/q+1q"],
    ["bu çeyrek", "now/q", "now/q+1q"],
    ["gelecek çeyrek", "now+1q/q", "now+1q/q+1q"],
    ["geçen yıl", "now-1y/y", "now-1y/y+1y"],
    ["bu yıl", "now/y", "now/y+1y"],
    ["gelecek yıl", "now+1y/y", "now+1y/y+1y"],
  ] as const)(
    "parses Turkish relative calendar period %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseTurkish(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    "yılbaşından bugüne",
    "yılbaşından bu yana",
    "yılın başından bugüne",
    "bu yıl şimdiye kadar",
  ])(
    "canonicalizes Turkish year-to-date variant %j",
    Effect.fn(function* (input) {
      const result = yield* parseTurkish(input);
      expect(formatFilter(result.range)).toEqual({ gte: "now/y", lte: "now" });
      expect(yield* formatNatural(result.range, { locale: "tr" })).toBe("yılbaşından bugüne");
    }, Effect.provide(TurkishLanguageLayer)),
  );

  it.effect.each([
    "son 3 ay",
    "geçen 3 ay",
    "önceki 3 ay",
    "geçtiğimiz 3 ay",
    "3 son ay",
    "3 ay boyunca",
    "3 ay",
  ])(
    "canonicalizes Turkish counted-month variant %j",
    Effect.fn(function* (input) {
      const result = yield* parseTurkish(input);
      expect(formatFilter(result.range)).toEqual({ gte: "now-3M", lte: "now" });
      expect(yield* formatNatural(result.range, { locale: "tr" })).toBe("son 3 ay");
    }, Effect.provide(TurkishLanguageLayer)),
  );

  it.effect.each([
    ["son bir ay", "now-1M", "son bir ay"],
    ["bir hafta boyunca", "now-1w", "son bir hafta"],
    ["geçtiğimiz bir yıl", "now-1y", "son bir yıl"],
  ] as const)(
    "distinguishes rolling Turkish singular period %s",
    Effect.fn(function* (testCase) {
      const [input, gte, canonical] = testCase;
      const result = yield* parseTurkish(input);
      expect(formatFilter(result.range)).toEqual({ gte, lte: "now" });
      expect(yield* formatNatural(result.range, { locale: "tr" })).toBe(canonical);
    }, Effect.provide(TurkishLanguageLayer)),
  );

  it.effect.each([
    ["önümüzdeki bir ay", "now+1M"],
    ["bugünden itibaren bir hafta boyunca", "now+1w"],
  ] as const)(
    "maps rolling Turkish singular future %s",
    Effect.fn(function* (testCase) {
      const [input, lte] = testCase;
      expect(formatFilter((yield* parseTurkish(input)).range)).toEqual({ gte: "now", lte });
    }),
  );

  it.effect.each([
    ["son 2 gün", "now-2d"],
    ["son 2 hafta", "now-2w"],
    ["son 2 ay", "now-2M"],
    ["son 2 çeyrek", "now-2q"],
    ["son 2 yıl", "now-2y"],
  ] as const)(
    "maps Turkish trailing unit in %s",
    Effect.fn(function* (testCase) {
      const [input, gte] = testCase;
      expect(formatFilter((yield* parseTurkish(input)).range)).toEqual({ gte, lte: "now" });
    }),
  );

  it.effect.each([
    ["gelecek 2 gün", "now+2d"],
    ["önümüzdeki 2 hafta", "now+2w"],
    ["gelecek 2 ay", "now+2M"],
    ["sonraki 2 çeyrek", "now+2q"],
    ["gelecek 2 yıl", "now+2y"],
  ] as const)(
    "maps Turkish future rolling unit in %s",
    Effect.fn(function* (testCase) {
      const [input, lte] = testCase;
      expect(formatFilter((yield* parseTurkish(input)).range)).toEqual({ gte: "now", lte });
    }),
  );

  it.effect.each([
    ["30 ay önce", "now-30M/M", "now-30M/M+1M", "30 ay önce"],
    ["2 hafta sonra", "now+2w/w", "now+2w/w+1w", "2 hafta sonra"],
    ["3 yıl içinde", "now+3y/y", "now+3y/y+1y", "3 yıl sonra"],
    ["1 gün önce", "now-1d/d", "now-1d/d+1d", "dün"],
    ["bir ay önce", "now-1M/M", "now-1M/M+1M", "geçen ay"],
    ["bir hafta sonra", "now+1w/w", "now+1w/w+1w", "gelecek hafta"],
  ] as const)(
    "maps Turkish calendar offset %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt, canonical] = testCase;
      const result = yield* parseTurkish(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
      expect(yield* formatNatural(result.range, { locale: "tr" })).toBe(canonical);
    }, Effect.provide(TurkishLanguageLayer)),
  );

  it.effect.each([
    ["ocak 2025", "2025-01-01", "2025-02-01"],
    ["şubat 2025", "2025-02-01", "2025-03-01"],
    ["mart 2025", "2025-03-01", "2025-04-01"],
    ["nisan 2025", "2025-04-01", "2025-05-01"],
    ["mayıs 2025", "2025-05-01", "2025-06-01"],
    ["haziran 2025", "2025-06-01", "2025-07-01"],
    ["temmuz 2025", "2025-07-01", "2025-08-01"],
    ["ağustos 2025", "2025-08-01", "2025-09-01"],
    ["eylül 2025", "2025-09-01", "2025-10-01"],
    ["ekim 2025", "2025-10-01", "2025-11-01"],
    ["kasım 2025", "2025-11-01", "2025-12-01"],
    ["aralık 2025", "2025-12-01", "2026-01-01"],
  ] as const)(
    "maps fixed Turkish month %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseTurkish(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["Ç1 2025", "2025-01-01", "2025-04-01", "Ç1 2025"],
    ["Q2 2025", "2025-04-01", "2025-07-01", "Ç2 2025"],
    ["üçüncü çeyrek 2025", "2025-07-01", "2025-10-01", "Ç3 2025"],
    ["4. çeyrek 2025", "2025-10-01", "2026-01-01", "Ç4 2025"],
  ] as const)(
    "maps Turkish quarter expression %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt, canonical] = testCase;
      const result = yield* parseTurkish(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
      expect(yield* formatNatural(result.range, { locale: "tr" })).toBe(canonical);
    }, Effect.provide(TurkishLanguageLayer)),
  );

  it.effect.each([
    ["ç1 geçen yıl", "now-1y/y", "now-1y/y+1q"],
    ["bu yıl ç2", "now/y+3M", "now/y+3M+1q"],
    ["ç4 gelecek yıl", "now+1y/y+9M", "now+1y/y+9M+1q"],
  ] as const)(
    "maps Turkish quarter in a relative year %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseTurkish(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["1 ocak 2025", "2025-01-01", "2025-01-02"],
    ["31 ara. 2025", "2025-12-31", "2026-01-01"],
    ["29.2.2024", "2024-02-29", "2024-03-01"],
    ["1/3/2025", "2025-03-01", "2025-03-02"],
  ] as const)(
    "maps Turkish absolute date %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseTurkish(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each(["12 ocak", "12. ocak"])(
    "maps current-year Turkish date %j",
    Effect.fn(function* (input) {
      const result = yield* parseTurkish(input);
      expect(formatFilter(result.range)).toEqual({ gte: "now/y+11d", lt: "now/y+12d" });
      expect(yield* formatNatural(result.range, { locale: "tr" })).toBe("12 ocak");
    }, Effect.provide(TurkishLanguageLayer)),
  );

  it.effect.each([
    ["evvelsi gün", "now-2d/d", "now-2d/d+1d"],
    ["öbür gün", "now+2d/d", "now+2d/d+1d"],
    ["geçen aydan önceki ay", "now-2M/M", "now-2M/M+1M"],
    ["gelecek yıldan sonraki yıl", "now+2y/y", "now+2y/y+1y"],
  ] as const)(
    "maps outer Turkish relative period %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseTurkish(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["ocak geçen yıl", "now-1y/y", "now-1y/y+1M"],
    ["bu yıl mart", "now/y+2M", "now/y+3M"],
    ["aralık gelecek yıl", "now+1y/y+11M", "now+1y/y+12M"],
  ] as const)(
    "maps Turkish month in a relative year %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseTurkish(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["ocak 2025'ten itibaren", { gte: "2025-01-01" }],
    ["ocak 2025'ten önce", { lt: "2025-01-01" }],
    ["ocak 2025'e kadar", { lt: "2025-02-01" }],
    ["ocak 2025 sonuna kadar", { lt: "2025-02-01" }],
    ["ocak 2025'ten sonra", { gte: "2025-02-01" }],
    ["bugünden itibaren", { gte: "now" }],
    ["şimdiye kadar", { lte: "now" }],
  ] as const)(
    "maps Turkish open boundary %s",
    Effect.fn(function* (testCase) {
      const [input, filter] = testCase;
      expect(formatFilter((yield* parseTurkish(input)).range)).toEqual(filter);
    }),
  );

  it.effect.each([
    "ocak 2025 ile mart 2025 arası",
    "ocak 2025 ve mart 2025 arası",
    "ocak 2025 - mart 2025",
  ])(
    "maps Turkish joined range %j",
    Effect.fn(function* (input) {
      const result = yield* parseTurkish(input);
      expect(formatFilter(result.range)).toEqual({ gte: "2025-01-01", lt: "2025-04-01" });
      expect(yield* formatNatural(result.range, { locale: "tr" })).toBe("Ç1 2025");
    }, Effect.provide(TurkishLanguageLayer)),
  );

  it.effect.each([
    ["2 ekim'den 22 ekim'e kadar", "now/y+9M+1d", "now/y+9M+22d"],
    ["2 nisan'dan 7'sine kadar", "now/y+3M+1d", "now/y+3M+7d"],
    ["2–7 nisan", "now/y+3M+1d", "now/y+3M+7d"],
  ] as const)(
    "maps elided Turkish date range %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseTurkish(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["oca. 2025", "2025-01-01", "2025-02-01"],
    ["şub 2025", "2025-02-01", "2025-03-01"],
    ["ağu 2025", "2025-08-01", "2025-09-01"],
    ["ara 2025", "2025-12-01", "2026-01-01"],
  ] as const)(
    "maps Turkish abbreviated month %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseTurkish(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["bu yılın başı", "now/y", "now/y+1d"],
    ["gelecek ayın başı", "now+1M/M", "now+1M/M+1d"],
    ["geçen yılın sonu", "now-1y/y+1y-1d", "now-1y/y+1y"],
  ] as const)(
    "maps Turkish period edge %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseTurkish(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["ocak 2025 ile bugün arası", { gte: "2025-01-01", lte: "now" }],
    ["bugün ile mart 2025 arası", { gte: "now", lt: "2025-04-01" }],
  ] as const)(
    "maps Turkish now-bounded range %s",
    Effect.fn(function* (testCase) {
      const [input, filter] = testCase;
      expect(formatFilter((yield* parseTurkish(input)).range)).toEqual(filter);
    }),
  );

  it.effect(
    "uses a Turkish calendar offset as a range endpoint",
    Effect.fn(function* () {
      const result = yield* parseTurkish("geçen hafta - 2 hafta sonra");
      expect(formatFilter(result.range)).toEqual({
        gte: "now-1w/w",
        lt: "now+2w/w+1w",
      });
    }),
  );

  it.effect.each([
    ["ayın geri kalanı", "now/M+1M"],
    ["haftanın geri kalanı", "now/w+1w"],
    ["yılın geri kalanı", "now/y+1y"],
  ] as const)(
    "maps Turkish remaining period %s",
    Effect.fn(function* (testCase) {
      const [input, lt] = testCase;
      expect(formatFilter((yield* parseTurkish(input)).range)).toEqual({ gte: "now", lt });
    }),
  );

  it.effect.each(["31 nisan 2025", "29.2.2025", "13.13.2025", "ocak 20"])(
    "rejects invalid Turkish absolute period %j",
    Effect.fn(function* (input) {
      const error = yield* Effect.flip(parseTurkish(input));
      expect(error).toBeInstanceOf(NaturalLanguageParseError);
    }),
  );

  it.effect(
    "uses Turkish dotted and dotless casing",
    Effect.fn(function* () {
      expect(formatFilter((yield* parseTurkish("MAYIS 2025")).range)).toEqual({
        gte: "2025-05-01",
        lt: "2025-06-01",
      });
    }),
  );

  it.effect(
    "corrects a Turkish typo only in tolerant mode",
    Effect.fn(function* () {
      expect((yield* parseTurkish("ocakk 2025", "tolerant")).quality).toBe("corrected");
      const error = yield* Effect.flip(parseTurkish("ocakk 2025"));
      expect(error).toBeInstanceOf(NaturalLanguageParseError);
    }),
  );

  it.effect.each([
    ["gelecek a", "gelecek ay"],
    ["oca", "Ocak"],
    ["son 3 a", "son 3 ay"],
    ["itibaren oca", "itibaren Ocak"],
  ] as const)(
    "suggests Turkish completion for %j",
    Effect.fn(function* (testCase) {
      const [input, expected] = testCase;
      const [suggestion] = yield* suggestTurkish(input);
      if (suggestion === undefined) return expect.fail("Expected a suggestion");
      expect(suggestion.text).toBe(expected);
    }),
  );

  it.effect(
    "completes a partial Turkish year",
    Effect.fn(function* () {
      const suggestions = yield* suggestTurkish("ocak 202", 2);
      expect(suggestions.map((entry) => entry.text)).toEqual(["Ocak 2020", "Ocak 2021"]);
    }),
  );

  it.effect(
    "filters positive Turkish suggestions",
    Effect.fn(function* () {
      expect(yield* suggestTurkish("gelecek a", 10, false)).toEqual([]);
    }),
  );
});
