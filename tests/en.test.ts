import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { formatFilter } from "../src/filter/codec.ts";
import { EnglishLanguageLayer } from "../src/locales/en.ts";
import { formatNatural, parseNatural } from "../src/natural/api.ts";

const parseEnglish = (input: string, typoMode: "strict" | "tolerant" = "strict") =>
  parseNatural(input, { locale: "en", typoMode }).pipe(Effect.provide(EnglishLanguageLayer));

describe("English date ranges", () => {
  it.effect("parses year to date as an inclusive current endpoint", () =>
    Effect.gen(function* () {
      const result = yield* parseEnglish("year to date");
      expect(formatFilter(result.range)).toEqual({ gte: "now/y", lte: "now" });
      expect(result.quality).toBe("exact");
    }),
  );

  it.effect("parses a fixed month as a half-open calendar period", () =>
    Effect.gen(function* () {
      const result = yield* parseEnglish("January 2025");
      expect(formatFilter(result.range)).toEqual({
        gte: "2025-01-01",
        lt: "2025-02-01",
      });
    }),
  );

  it.effect("uses leap-year month and day boundaries", () =>
    Effect.gen(function* () {
      const month = yield* parseEnglish("February 2024");
      const day = yield* parseEnglish("2024-02-29");
      expect(formatFilter(month.range)).toEqual({
        gte: "2024-02-01",
        lt: "2024-03-01",
      });
      expect(formatFilter(day.range)).toEqual({
        gte: "2024-02-29",
        lt: "2024-03-01",
      });
    }),
  );

  it.effect("keeps a named month relative to the current year", () =>
    Effect.gen(function* () {
      const result = yield* parseEnglish("January of last year");
      expect(formatFilter(result.range)).toEqual({
        gte: "now-1y/y",
        lt: "now-1y/y+1M",
      });
    }),
  );

  it.effect("supports each open-boundary meaning", () =>
    Effect.gen(function* () {
      const since = yield* parseEnglish("since January 2025");
      const before = yield* parseEnglish("before January 2025");
      const through = yield* parseEnglish("through January 2025");
      const after = yield* parseEnglish("after January 2025");
      expect(formatFilter(since.range)).toEqual({ gte: "2025-01-01" });
      expect(formatFilter(before.range)).toEqual({ lt: "2025-01-01" });
      expect(formatFilter(through.range)).toEqual({ lt: "2025-02-01" });
      expect(formatFilter(after.range)).toEqual({ gte: "2025-02-01" });
    }),
  );

  it.effect("uses both full periods in a from-to range", () =>
    Effect.gen(function* () {
      const result = yield* parseEnglish("from February 2024 to March 2024");
      expect(formatFilter(result.range)).toEqual({
        gte: "2024-02-01",
        lt: "2024-04-01",
      });
    }),
  );

  it.effect("renders parsed ranges to canonical English", () =>
    Effect.gen(function* () {
      const complete = yield* parseEnglish("JANUARY   2025");
      const open = yield* parseEnglish("since January 2025");
      const renderedComplete = yield* formatNatural(complete.range, {
        locale: "en",
      }).pipe(Effect.provide(EnglishLanguageLayer));
      const renderedOpen = yield* formatNatural(open.range, {
        locale: "en",
      }).pipe(Effect.provide(EnglishLanguageLayer));
      expect(renderedComplete).toBe("January 2025");
      expect(renderedOpen).toBe("since January 2025");
    }),
  );

  it.effect("corrects bounded lexical typos only in tolerant mode", () =>
    Effect.gen(function* () {
      const result = yield* parseEnglish("januray of last yaer", "tolerant");
      expect(result.quality).toBe("corrected");
      expect(result.corrections).toMatchObject([
        { original: "januray", replacement: "january", distance: 1 },
        { original: "yaer", replacement: "year", distance: 1 },
      ]);
      expect(formatFilter(result.range)).toEqual({
        gte: "now-1y/y",
        lt: "now-1y/y+1M",
      });
    }),
  );

  it.effect("does not run typo correction in strict mode", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(parseEnglish("januray 2025"));
      expect(error._tag).toBe("NaturalLanguageParseError");
    }),
  );

  it.effect("never corrects years or short ambiguous month words", () =>
    Effect.gen(function* () {
      const badYear = yield* Effect.flip(parseEnglish("January 202", "tolerant"));
      const shortMonth = yield* Effect.flip(parseEnglish("mey 2025", "tolerant"));
      expect(badYear._tag).toBe("NaturalLanguageParseError");
      expect(shortMonth._tag).toBe("NaturalLanguageParseError");
    }),
  );

  it.effect("rejects extraction from a larger sentence", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(parseEnglish("show results since January 2025"));
      expect(error._tag).toBe("NaturalLanguageParseError");
    }),
  );
});
