import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { formatFilter, parseFilter } from "../src/filter/codec.ts";
import { EnglishLanguageLayer } from "../src/locales/en.ts";
import { formatNatural, parseNatural, suggestNatural } from "../src/index.ts";

const parseEnglish = (input: string, typoMode: "strict" | "tolerant" = "strict") =>
  parseNatural(input, { locale: "en", typoMode }).pipe(Effect.provide(EnglishLanguageLayer));

const parseEnglishWithoutFuture = (input: string) =>
  parseNatural(input, { locale: "en", allowFuture: false }).pipe(
    Effect.provide(EnglishLanguageLayer),
  );

const suggestEnglish = (input: string, limit = 10, allowFuture = true) =>
  suggestNatural(input, { locale: "en", limit, allowFuture }).pipe(
    Effect.provide(EnglishLanguageLayer),
  );

describe("English date ranges", () => {
  it.effect.each([
    ["last m", "last month", { gte: "now-1M/M", lt: "now-1M/M+1M" }],
    ["las m", "last month", { gte: "now-1M/M", lt: "now-1M/M+1M" }],
    ["jan", "January", { gte: "now/y", lt: "now/y+1M" }],
    ["jaun", "January", { gte: "now/y", lt: "now/y+1M" }],
    ["last 3 mon", "last 3 months", { gte: "now-3M", lte: "now" }],
    ["since jan", "since January", { gte: "now/y" }],
    ["rest of m", "rest of month", { gte: "now", lt: "now/M+1M" }],
    ["in 3 y", "in 3 years", { gte: "now+3y/y", lt: "now+3y/y+1y" }],
    ["yaer to d", "year to date", { gte: "now/y", lte: "now" }],
  ] as const)(
    "suggests English completion for %j",
    Effect.fn(function* (testCase) {
      const [input, text, filter] = testCase;
      const [suggestion] = yield* suggestEnglish(input);
      if (suggestion === undefined) return expect.fail("Expected a suggestion");
      expect(suggestion.text).toBe(text);
      expect(formatFilter(suggestion.range)).toEqual(filter);
    }),
  );

  it.effect(
    "completes a partial year and applies the result limit",
    Effect.fn(function* () {
      const suggestions = yield* suggestEnglish("january 202", 2);
      expect(suggestions.map((entry) => entry.text)).toEqual(["January 2020", "January 2021"]);
    }),
  );

  it.effect(
    "does not fuzzy-match a short token",
    Effect.fn(function* () {
      expect(yield* suggestEnglish("ls m")).toEqual([]);
    }),
  );

  it.effect(
    "returns no completion when the limit is zero",
    Effect.fn(function* () {
      expect(yield* suggestEnglish("last m", 0)).toEqual([]);
    }),
  );

  it.effect(
    "returns only suggestions accepted by strict parsing",
    Effect.fn(function* () {
      const suggestions = yield* suggestEnglish("");
      for (const suggestion of suggestions) {
        const parsed = yield* parseEnglish(suggestion.text);
        expect(formatFilter(parsed.range)).toEqual(formatFilter(suggestion.range));
      }
    }),
  );

  it.effect(
    "removes positive relative completions when future ranges are disabled",
    Effect.fn(function* () {
      expect(yield* suggestEnglish("next m", 10, false)).toEqual([]);
    }),
  );

  it.effect(
    "keeps current-period completions when future ranges are disabled",
    Effect.fn(function* () {
      const suggestions = yield* suggestEnglish("this m", 10, false);
      expect(suggestions.map((suggestion) => suggestion.text)).toContain("this month");
    }),
  );
  it.effect.each([
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
  ] as const)(
    "parses relative calendar period %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      const result = yield* parseEnglish(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["day to date", "now/d"],
    ["week to date", "now/w"],
    ["month to date", "now/M"],
    ["quarter to date", "now/q"],
    ["year to date", "now/y"],
    ["since the beginning of the day", "now/d"],
    ["since the start of the week", "now/w"],
    ["this month so far", "now/M"],
    ["so far this quarter", "now/q"],
    ["from the beginning of the year to now", "now/y"],
    ["YTD", "now/y"],
    ["year-to-date", "now/y"],
    ["this year until now", "now/y"],
  ] as const)(
    "parses period-to-date expression %s",
    Effect.fn(function* (testCase) {
      const [input, gte] = testCase;
      const result = yield* parseEnglish(input);
      expect(formatFilter(result.range)).toEqual({ gte, lte: "now" });
    }),
  );

  it.effect.each([
    "since the start of the year",
    "since the beginning of the year",
    "from the start of the year to now",
    "from the beginning of the year to now",
    "this year so far",
    "so far this year",
  ])(
    "canonicalizes English year-to-date variant %j",
    Effect.fn(function* (input) {
      const result = yield* parseEnglish(input);
      expect(formatFilter(result.range)).toEqual({ gte: "now/y", lte: "now" });
      expect(yield* formatNatural(result.range, { locale: "en" })).toBe("year to date");
    }, Effect.provide(EnglishLanguageLayer)),
  );

  it.effect.each([
    "last 3 months",
    "previous 3 months",
    "past 3 months",
    "in the last 3 months",
    "in the previous 3 months",
    "over the past 3 months",
    "3 months",
  ])(
    "canonicalizes counted-month variant %j",
    Effect.fn(function* (input) {
      const result = yield* parseEnglish(input);
      expect(formatFilter(result.range)).toEqual({ gte: "now-3M", lte: "now" });
      expect(yield* formatNatural(result.range, { locale: "en" })).toBe("last 3 months");
    }, Effect.provide(EnglishLanguageLayer)),
  );

  it.effect.each([
    ["last 2 days", "now-2d"],
    ["last 2 weeks", "now-2w"],
    ["last 2 months", "now-2M"],
    ["last 2 quarters", "now-2q"],
    ["last 2 years", "now-2y"],
  ] as const)(
    "maps counted trailing unit in %s",
    Effect.fn(function* (testCase) {
      const [input, gte] = testCase;
      const result = yield* parseEnglish(input);
      expect(formatFilter(result.range)).toEqual({ gte, lte: "now" });
    }),
  );

  it.effect.each([
    ["next 2 days", "now+2d"],
    ["coming 2 weeks", "now+2w"],
    ["in the next 2 months", "now+2M"],
    ["over the coming 2 quarters", "now+2q"],
    ["within the next 2 years", "now+2y"],
    ["within 2 years", "now+2y"],
  ] as const)(
    "maps future rolling range %s",
    Effect.fn(function* (testCase) {
      const [input, lte] = testCase;
      const result = yield* parseEnglish(input);
      expect(formatFilter(result.range)).toEqual({ gte: "now", lte });
    }),
  );

  it.effect.each([
    ["30 months ago", "now-30M/M", "now-30M/M+1M", "30 months ago"],
    ["1 day prior", "now-1d/d", "now-1d/d+1d", "yesterday"],
    ["in 2 weeks", "now+2w/w", "now+2w/w+1w", "in 2 weeks"],
    ["3 years from now", "now+3y/y", "now+3y/y+1y", "in 3 years"],
    ["a month ago", "now-1M/M", "now-1M/M+1M", "last month"],
    ["one week prior", "now-1w/w", "now-1w/w+1w", "last week"],
    ["in a quarter", "now+1q/q", "now+1q/q+1q", "next quarter"],
    ["one year from now", "now+1y/y", "now+1y/y+1y", "next year"],
  ] as const)(
    "maps calendar-offset period %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt, canonical] = testCase;
      const result = yield* parseEnglish(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
      expect(yield* formatNatural(result.range, { locale: "en" })).toBe(canonical);
    }, Effect.provide(EnglishLanguageLayer)),
  );

  it.effect.each([
    ["January 2025", "2025-01-01", "2025-02-01"],
    ["February 2025", "2025-02-01", "2025-03-01"],
    ["March 2025", "2025-03-01", "2025-04-01"],
    ["April 2025", "2025-04-01", "2025-05-01"],
    ["May 2025", "2025-05-01", "2025-06-01"],
    ["June 2025", "2025-06-01", "2025-07-01"],
    ["July 2025", "2025-07-01", "2025-08-01"],
    ["August 2025", "2025-08-01", "2025-09-01"],
    ["September 2025", "2025-09-01", "2025-10-01"],
    ["October 2025", "2025-10-01", "2025-11-01"],
    ["November 2025", "2025-11-01", "2025-12-01"],
    ["December 2025", "2025-12-01", "2026-01-01"],
  ] as const)(
    "maps fixed English month %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      const result = yield* parseEnglish(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
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

  it.effect.each([
    ["Q1 2025", "2025-01-01", "2025-04-01", "Q1 2025"],
    ["2025 Q2", "2025-04-01", "2025-07-01", "Q2 2025"],
    ["third quarter of 2025", "2025-07-01", "2025-10-01", "Q3 2025"],
    ["fourth quarter 2025", "2025-10-01", "2026-01-01", "Q4 2025"],
    ["Q1 of last year", "now-1y/y", "now-1y/y+1q", "Q1 of last year"],
    ["second quarter of next year", "now+1y/y+3M", "now+1y/y+3M+1q", "Q2 of next year"],
  ] as const)(
    "maps English quarter expression %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt, canonical] = testCase;
      const result = yield* parseEnglish(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
      expect(yield* formatNatural(result.range, { locale: "en" })).toBe(canonical);
    }, Effect.provide(EnglishLanguageLayer)),
  );

  it.effect.each([
    ["01 January 2025", "2025-01-01", "2025-01-02"],
    ["January 31, 2025", "2025-01-31", "2025-02-01"],
    ["1st Jan 2025", "2025-01-01", "2025-01-02"],
    ["29th Feb. 2024", "2024-02-29", "2024-03-01"],
  ] as const)(
    "maps named English date %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      const result = yield* parseEnglish(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["weekend", "now/w+5d", "now/w+7d", "this weekend"],
    ["the weekend", "now/w+5d", "now/w+7d", "this weekend"],
    ["last weekend", "now-1w/w+5d", "now-1w/w+7d", "last weekend"],
    ["coming weekend", "now+1w/w+5d", "now+1w/w+7d", "next weekend"],
    ["the weekend before last", "now-2w/w+5d", "now-2w/w+7d", "the weekend before last"],
    ["the weekend after next", "now+2w/w+5d", "now+2w/w+7d", "the weekend after next"],
  ] as const)(
    "maps English weekend expression %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt, canonical] = testCase;
      const result = yield* parseEnglish(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
      expect(yield* formatNatural(result.range, { locale: "en" })).toBe(canonical);
    }, Effect.provide(EnglishLanguageLayer)),
  );

  it.effect.each([
    ["Jan 2025", "2025-01-01", "2025-02-01", "January 2025"],
    ["Feb. 2025", "2025-02-01", "2025-03-01", "February 2025"],
    ["Mar 2025", "2025-03-01", "2025-04-01", "March 2025"],
    ["Apr. 2025", "2025-04-01", "2025-05-01", "April 2025"],
    ["Jun 2025", "2025-06-01", "2025-07-01", "June 2025"],
    ["Jul. 2025", "2025-07-01", "2025-08-01", "July 2025"],
    ["Aug 2025", "2025-08-01", "2025-09-01", "August 2025"],
    ["Sep. 2025", "2025-09-01", "2025-10-01", "September 2025"],
    ["Sept 2025", "2025-09-01", "2025-10-01", "September 2025"],
    ["Oct. 2025", "2025-10-01", "2025-11-01", "October 2025"],
    ["Nov 2025", "2025-11-01", "2025-12-01", "November 2025"],
    ["Dec. 2025", "2025-12-01", "2026-01-01", "December 2025"],
  ] as const)(
    "canonicalizes abbreviated English month %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt, canonical] = testCase;
      const result = yield* parseEnglish(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
      expect(yield* formatNatural(result.range, { locale: "en" })).toBe(canonical);
    }, Effect.provide(EnglishLanguageLayer)),
  );

  it.effect.each([
    ["January of last year", "now-1y/y", "now-1y/y+1M"],
    ["June of this year", "now/y+5M", "now/y+6M"],
    ["December of next year", "now+1y/y+11M", "now+1y/y+12M"],
    ["June next year", "now+1y/y+5M", "now+1y/y+6M"],
    ["Sep last year", "now-1y/y+8M", "now-1y/y+9M"],
  ] as const)(
    "keeps named month in its relative year for %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      const result = yield* parseEnglish(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["since January 2025", { gte: "2025-01-01" }],
    ["from January 2025", { gte: "2025-01-01" }],
    ["starting from January 2025", { gte: "2025-01-01" }],
    ["from the start of January 2025", { gte: "2025-01-01" }],
    ["before January 2025", { lt: "2025-01-01" }],
    ["until January 2025", { lt: "2025-01-01" }],
    ["till January 2025", { lt: "2025-01-01" }],
    ["up to January 2025", { lt: "2025-01-01" }],
    ["through January 2025", { lt: "2025-02-01" }],
    ["until the end of January 2025", { lt: "2025-02-01" }],
    ["up to and including January 2025", { lt: "2025-02-01" }],
    ["up to including January 2025", { lt: "2025-02-01" }],
    ["after January 2025", { gte: "2025-02-01" }],
    ["after the end of January 2025", { gte: "2025-02-01" }],
    ["since the year 2020", { gte: "2020-01-01" }],
    ["before the start of the year", { lt: "now/y" }],
    ["before start of the month", { lt: "now/M" }],
  ] as const)(
    "maps open-boundary expression %s",
    Effect.fn(function* (testCase) {
      const [input, expected] = testCase;
      const result = yield* parseEnglish(input);
      expect(formatFilter(result.range)).toEqual(expected);
    }),
  );

  it.effect.each([
    ["start of next week", "now+1w/w", "now+1w/w+1d"],
    ["beginning of this month", "now/M", "now/M+1d"],
    ["end of March 2025", "2025-04-01||-1d", "2025-04-01"],
    ["the end of last year", "now-1y/y+1y-1d", "now-1y/y+1y"],
  ] as const)(
    "maps English period edge %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      const result = yield* parseEnglish(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each(["rest of the week", "rest of week", "remainder of the week", "remaining week"])(
    "canonicalizes remaining English period %j",
    Effect.fn(function* (input) {
      const result = yield* parseEnglish(input);
      expect(formatFilter(result.range)).toEqual({ gte: "now", lt: "now/w+1w" });
      expect(yield* formatNatural(result.range, { locale: "en" })).toBe("rest of week");
    }, Effect.provide(EnglishLanguageLayer)),
  );

  it.effect.each([
    "in January 2025",
    "during January 2025",
    "for January 2025",
    "all of January 2025",
    "the whole of January 2025",
  ])(
    "canonicalizes English period wrapper in %j",
    Effect.fn(function* (input) {
      const result = yield* parseEnglish(input);
      expect(formatFilter(result.range)).toEqual({
        gte: "2025-01-01",
        lt: "2025-02-01",
      });
      expect(yield* formatNatural(result.range, { locale: "en" })).toBe("January 2025");
    }, Effect.provide(EnglishLanguageLayer)),
  );

  it.effect.each([
    ["the month before last", "now-2M/M", "now-2M/M+1M", "2 months ago"],
    ["year after next", "now+2y/y", "now+2y/y+1y", "in 2 years"],
  ] as const)(
    "maps outer relative period %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt, canonical] = testCase;
      const result = yield* parseEnglish(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
      expect(yield* formatNatural(result.range, { locale: "en" })).toBe(canonical);
    }, Effect.provide(EnglishLanguageLayer)),
  );

  it.effect.each([
    ["until now", { lte: "now" }, "until now"],
    ["up to now", { lte: "now" }, "until now"],
    ["from now", { gte: "now" }, "from now"],
    ["from now on", { gte: "now" }, "from now"],
  ] as const)(
    "maps open now boundary %s",
    Effect.fn(function* (testCase) {
      const [input, expected, canonical] = testCase;
      const result = yield* parseEnglish(input);
      expect(formatFilter(result.range)).toEqual(expected);
      expect(yield* formatNatural(result.range, { locale: "en" })).toBe(canonical);
    }, Effect.provide(EnglishLanguageLayer)),
  );

  it.effect.each([
    ["from January 2025 to now", { gte: "2025-01-01", lte: "now" }, "from January 2025 to now"],
    ["between January 2025 and now", { gte: "2025-01-01", lte: "now" }, "from January 2025 to now"],
    ["from now through January 2027", { gte: "now", lt: "2027-02-01" }, "from now to January 2027"],
    ["between now and January 2027", { gte: "now", lt: "2027-02-01" }, "from now to January 2027"],
  ] as const)(
    "maps now-bounded range %s",
    Effect.fn(function* (testCase) {
      const [input, expected, canonical] = testCase;
      const result = yield* parseEnglish(input);
      expect(formatFilter(result.range)).toEqual(expected);
      expect(yield* formatNatural(result.range, { locale: "en" })).toBe(canonical);
    }, Effect.provide(EnglishLanguageLayer)),
  );

  it.effect(
    "maps an English named-date dash range",
    Effect.fn(function* () {
      const result = yield* parseEnglish("01 January 2025 - 31 January 2025");
      expect(formatFilter(result.range)).toEqual({
        gte: "2025-01-01",
        lt: "2025-02-01",
      });
    }),
  );

  it.effect.each(["2014-2018", "between 2014-2018", "2014–2018", "2014~2018"])(
    "maps compact English year range %j",
    Effect.fn(function* (input) {
      const result = yield* parseEnglish(input);
      expect(formatFilter(result.range)).toEqual({
        gte: "2014-01-01",
        lt: "2019-01-01",
      });
    }),
  );

  it.effect.each([
    "from February 2024 until March 2024",
    "from February 2024 to and including March 2024",
    "from February 2024 through and including March 2024",
    "from February 2024 through March 2024",
    "from February 2024 till March 2024",
    "between February 2024 and March 2024",
    "between February 2024 through March 2024",
    "February 2024 to March 2024",
    "February 2024 until March 2024",
    "February 2024 through March 2024",
    "February 2024 till March 2024",
  ])(
    "canonicalizes bounded English connector in %j",
    Effect.fn(function* (input) {
      const result = yield* parseEnglish(input);
      expect(formatFilter(result.range)).toEqual({
        gte: "2024-02-01",
        lt: "2024-04-01",
      });
      expect(yield* formatNatural(result.range, { locale: "en" })).toBe(
        "from February 2024 to March 2024",
      );
    }, Effect.provide(EnglishLanguageLayer)),
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

  it.effect.each([
    "",
    "2025-02-29",
    "1900-02-29",
    "2025-04-31",
    "31 February 2025",
    "February 29 2025",
    "9999-12-31",
    "January 2025 extra",
    "past month",
    "0 months",
    "1 months",
    "2 month",
    "1 months ago",
    "2 month ago",
    "Q5 2025",
    "show results since January 2025",
  ])(
    "rejects unsupported complete input %j",
    Effect.fn(function* (input) {
      const error = yield* Effect.flip(parseEnglish(input));
      expect(error._tag).toBe("NaturalLanguageParseError");
      expect(error).toMatchObject({ input, locale: "en" });
    }),
  );

  it.effect.each(["tomorrow", "next month", "in 3 years", "next 3 weeks"])(
    "rejects explicit future range %j when future ranges are disabled",
    Effect.fn(function* (input) {
      const error = yield* Effect.flip(parseEnglishWithoutFuture(input));
      expect(error._tag).toBe("NaturalLanguageParseError");
      expect(error.message).toBe(
        "The expression contains a positive relative shift, but future ranges are disabled",
      );
    }),
  );

  it.effect.each([
    ["today", "now/d", "now/d+1d"],
    ["this week", "now/w", "now/w+1w"],
    ["this month", "now/M", "now/M+1M"],
    ["this quarter", "now/q", "now/q+1q"],
    ["this year", "now/y", "now/y+1y"],
  ] as const)(
    "keeps complete current period %s when future ranges are disabled",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      const result = yield* parseEnglishWithoutFuture(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each(["last month", "30 months ago", "year to date", "January 2099"])(
    "keeps non-positive or fixed range %j when future ranges are disabled",
    Effect.fn(function* (input) {
      const result = yield* parseEnglishWithoutFuture(input);
      expect(result.quality).toBe("exact");
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
      expect(error).toMatchObject({
        locale: "en",
        message: "The range has no canonical natural-language form in this locale",
      });
    }),
  );

  it.effect.each([
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
  ])(
    "round-trips canonical English phrase %j",
    Effect.fn(function* (phrase) {
      const parsed = yield* parseEnglish(phrase);
      const rendered = yield* formatNatural(parsed.range, { locale: "en" }).pipe(
        Effect.provide(EnglishLanguageLayer),
      );
      const reparsed = yield* parseEnglish(rendered);
      expect(formatFilter(reparsed.range)).toEqual(formatFilter(parsed.range));
    }),
  );
});
