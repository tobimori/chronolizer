import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { formatFilter, parseFilter } from "../src/filter/codec.ts";
import { EnglishLanguageLayer } from "../src/locales/en.ts";
import { formatNatural, parseNatural } from "../src/natural/api.ts";

const parseEnglish = (input: string, typoMode: "strict" | "tolerant" = "strict") =>
  parseNatural(input, { locale: "en", typoMode }).pipe(Effect.provide(EnglishLanguageLayer));

describe("English date ranges", () => {
  it.effect(
    "covers every relative calendar period",
    Effect.fn(function* () {
      const cases = [
        ["today", "now/d", "now/d+1d"],
        ["yesterday", "now-1d/d", "now-1d/d+1d"],
        ["tomorrow", "now+1d/d", "now+1d/d+1d"],
        ["last week", "now-1w/w", "now-1w/w+1w"],
        ["this week", "now/w", "now/w+1w"],
        ["next week", "now+1w/w", "now+1w/w+1w"],
        ["last month", "now-1M/M", "now-1M/M+1M"],
        ["this month", "now/M", "now/M+1M"],
        ["next month", "now+1M/M", "now+1M/M+1M"],
        ["last quarter", "now-1q/q", "now-1q/q+1q"],
        ["this quarter", "now/q", "now/q+1q"],
        ["next quarter", "now+1q/q", "now+1q/q+1q"],
        ["last year", "now-1y/y", "now-1y/y+1y"],
        ["this year", "now/y", "now/y+1y"],
        ["next year", "now+1y/y", "now+1y/y+1y"],
      ] as const;
      for (const [input, gte, lt] of cases) {
        const result = yield* parseEnglish(input);
        expect(formatFilter(result.range), input).toEqual({ gte, lt });
      }
    }),
  );

  it.effect(
    "covers every period-to-date unit",
    Effect.fn(function* () {
      const cases = [
        ["day to date", "now/d"],
        ["week to date", "now/w"],
        ["month to date", "now/M"],
        ["quarter to date", "now/q"],
        ["year to date", "now/y"],
      ] as const;
      for (const [input, gte] of cases) {
        const result = yield* parseEnglish(input);
        expect(formatFilter(result.range), input).toEqual({ gte, lte: "now" });
      }
    }),
  );

  it.effect(
    "treats English counted-month variants as the same trailing range",
    Effect.fn(function* () {
      for (const input of ["last 3 months", "previous 3 months", "3 months"]) {
        const result = yield* parseEnglish(input);
        expect(formatFilter(result.range), input).toEqual({ gte: "now-3M", lte: "now" });
        expect(yield* formatNatural(result.range, { locale: "en" })).toBe("last 3 months");
      }
    }, Effect.provide(EnglishLanguageLayer)),
  );

  it.effect(
    "maps every English counted trailing unit",
    Effect.fn(function* () {
      const cases = [
        ["last 2 days", "now-2d"],
        ["last 2 weeks", "now-2w"],
        ["last 2 months", "now-2M"],
        ["last 2 quarters", "now-2q"],
        ["last 2 years", "now-2y"],
      ] as const;
      for (const [input, gte] of cases) {
        const result = yield* parseEnglish(input);
        expect(formatFilter(result.range), input).toEqual({ gte, lte: "now" });
      }
    }),
  );

  it.effect(
    "maps every English month and the December year boundary",
    Effect.fn(function* () {
      const months = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ] as const;
      for (const [index, month] of months.entries()) {
        const monthNumber = String(index + 1).padStart(2, "0");
        const nextMonth = index === 11 ? "01" : String(index + 2).padStart(2, "0");
        const nextYear = index === 11 ? "2026" : "2025";
        const result = yield* parseEnglish(`${month} 2025`);
        expect(formatFilter(result.range), month).toEqual({
          gte: `2025-${monthNumber}-01`,
          lt: `${nextYear}-${nextMonth}-01`,
        });
      }
    }),
  );

  it.effect(
    "parses year to date as an inclusive current endpoint",
    Effect.fn(function* () {
      const result = yield* parseEnglish("year to date");
      expect(formatFilter(result.range)).toEqual({ gte: "now/y", lte: "now" });
      expect(result.quality).toBe("exact");
    }),
  );

  it.effect(
    "parses a fixed month as a half-open calendar period",
    Effect.fn(function* () {
      const result = yield* parseEnglish("January 2025");
      expect(formatFilter(result.range)).toEqual({
        gte: "2025-01-01",
        lt: "2025-02-01",
      });
    }),
  );

  it.effect(
    "uses leap-year month and day boundaries",
    Effect.fn(function* () {
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

  it.effect(
    "keeps named months relative to the selected year",
    Effect.fn(function* () {
      const cases = [
        ["January of last year", "now-1y/y", "now-1y/y+1M"],
        ["June of this year", "now/y+5M", "now/y+6M"],
        ["December of next year", "now+1y/y+11M", "now+1y/y+12M"],
      ] as const;
      for (const [input, gte, lt] of cases) {
        const result = yield* parseEnglish(input);
        expect(formatFilter(result.range), input).toEqual({ gte, lt });
      }
    }),
  );

  it.effect(
    "supports each open-boundary meaning",
    Effect.fn(function* () {
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

  it.effect(
    "uses and renders both full periods in a from-to range",
    Effect.fn(function* () {
      const result = yield* parseEnglish("from February 2024 to March 2024");
      expect(formatFilter(result.range)).toEqual({
        gte: "2024-02-01",
        lt: "2024-04-01",
      });
      const rendered = yield* formatNatural(result.range, { locale: "en" }).pipe(
        Effect.provide(EnglishLanguageLayer),
      );
      expect(rendered).toBe("from February 2024 to March 2024");

      const relative = yield* parseEnglish("from May to December");
      expect(formatFilter(relative.range)).toEqual({
        gte: "now/y+4M",
        lt: "now/y+12M",
      });
    }),
  );

  it.effect(
    "renders parsed ranges to canonical English",
    Effect.fn(function* () {
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

  it.effect(
    "corrects bounded lexical typos only in tolerant mode",
    Effect.fn(function* () {
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

  it.effect(
    "does not run typo correction in strict mode",
    Effect.fn(function* () {
      const error = yield* Effect.flip(parseEnglish("januray 2025"));
      expect(error._tag).toBe("NaturalLanguageParseError");
    }),
  );

  it.effect(
    "never corrects years or short ambiguous month words",
    Effect.fn(function* () {
      const badYear = yield* Effect.flip(parseEnglish("January 202", "tolerant"));
      const badDate = yield* Effect.flip(parseEnglish("2025-02-29", "tolerant"));
      const shortMonth = yield* Effect.flip(parseEnglish("mey 2025", "tolerant"));
      expect(badYear._tag).toBe("NaturalLanguageParseError");
      expect(badDate._tag).toBe("NaturalLanguageParseError");
      expect(shortMonth._tag).toBe("NaturalLanguageParseError");
    }),
  );

  it.effect(
    "normalizes Unicode width, case, and whitespace",
    Effect.fn(function* () {
      const result = yield* parseEnglish("  ＪＡＮＵＡＲＹ　２０２５  ");
      expect(formatFilter(result.range)).toEqual({
        gte: "2025-01-01",
        lt: "2025-02-01",
      });
    }),
  );

  it.effect(
    "rejects impossible, incomplete, and out-of-scope input",
    Effect.fn(function* () {
      const inputs = [
        "",
        "2025-02-29",
        "1900-02-29",
        "2025-04-31",
        "9999-12-31",
        "January 2025 extra",
        "Jan 2025",
        "past month",
        "0 months",
        "1 months",
        "2 month",
        "show results since January 2025",
      ];
      for (const input of inputs) {
        const error = yield* Effect.flip(parseEnglish(input));
        expect(error._tag, input).toBe("NaturalLanguageParseError");
      }
    }),
  );

  it.effect(
    "fails to render a range with no supported natural form",
    Effect.fn(function* () {
      const range = yield* parseFilter({ gte: "now+2d", lt: "now+3d" });
      const error = yield* Effect.flip(
        formatNatural(range, { locale: "en" }).pipe(Effect.provide(EnglishLanguageLayer)),
      );
      expect(error._tag).toBe("NaturalLanguageRenderError");
    }),
  );

  it.effect(
    "round-trips canonical relative and fixed periods",
    Effect.fn(function* () {
      const phrases = [
        "today",
        "last week",
        "next quarter",
        "this year",
        "March 2025",
        "December of next year",
        "2024-02-29",
        "2025",
        "through January 2025",
        "from 2024-02-29 to 2024-03-01",
      ];
      for (const phrase of phrases) {
        const parsed = yield* parseEnglish(phrase);
        const rendered = yield* formatNatural(parsed.range, { locale: "en" }).pipe(
          Effect.provide(EnglishLanguageLayer),
        );
        const reparsed = yield* parseEnglish(rendered);
        expect(formatFilter(reparsed.range), phrase).toEqual(formatFilter(parsed.range));
      }
    }),
  );
});
