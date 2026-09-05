import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { formatFilter } from "../../src/filter/codec.ts";
import { CzechLanguageLayer } from "../../src/locales/cs.ts";
import {
  formatNatural,
  NaturalLanguageParseError,
  parseNatural,
  suggestNatural,
} from "../../src/index.ts";

const parseCzech = (input: string, typoMode: "strict" | "tolerant" = "strict") =>
  parseNatural(input, { locale: "cs", typoMode }).pipe(Effect.provide(CzechLanguageLayer));

const suggestCzech = (input: string, limit = 10, allowFuture = true) =>
  suggestNatural(input, { locale: "cs", limit, allowFuture }).pipe(
    Effect.provide(CzechLanguageLayer),
  );

describe("Czech date ranges", () => {
  it.effect.each([
    ["dnes", "now/d", "now/d+1d"],
    ["včera", "now-1d/d", "now-1d/d+1d"],
    ["zítra", "now+1d/d", "now+1d/d+1d"],
    ["minulý týden", "now-1w/w", "now-1w/w+1w"],
    ["tento týden", "now/w", "now/w+1w"],
    ["příští týden", "now+1w/w", "now+1w/w+1w"],
    ["minulý měsíc", "now-1M/M", "now-1M/M+1M"],
    ["tento měsíc", "now/M", "now/M+1M"],
    ["příští měsíc", "now+1M/M", "now+1M/M+1M"],
    ["minulé čtvrtletí", "now-1q/q", "now-1q/q+1q"],
    ["toto čtvrtletí", "now/q", "now/q+1q"],
    ["příští čtvrtletí", "now+1q/q", "now+1q/q+1q"],
    ["minulý rok", "now-1y/y", "now-1y/y+1y"],
    ["tento rok", "now/y", "now/y+1y"],
    ["příští rok", "now+1y/y", "now+1y/y+1y"],
  ] as const)(
    "parses Czech relative calendar period %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseCzech(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    "rok dosud",
    "tento rok dosud",
    "od začátku roku",
    "od počátku roku",
    "od začátku roku do dneška",
    "letos dosud",
  ])(
    "canonicalizes Czech year-to-date variant %j",
    Effect.fn(function* (input) {
      const result = yield* parseCzech(input);
      expect(formatFilter(result.range)).toEqual({ gte: "now/y", lte: "now" });
      expect(yield* formatNatural(result.range, { locale: "cs" })).toBe("rok dosud");
    }, Effect.provide(CzechLanguageLayer)),
  );

  it.effect.each(["poslední 3 měsíce", "uplynulé 3 měsíce", "za poslední 3 měsíce", "3 měsíce"])(
    "canonicalizes Czech counted-month variant %j",
    Effect.fn(function* (input) {
      const result = yield* parseCzech(input);
      expect(formatFilter(result.range)).toEqual({ gte: "now-3M", lte: "now" });
      expect(yield* formatNatural(result.range, { locale: "cs" })).toBe("poslední 3 měsíce");
    }, Effect.provide(CzechLanguageLayer)),
  );

  it.effect.each([
    ["poslední měsíc", "now-1M", "během posledního měsíce"],
    ["během posledního týdne", "now-1w", "během posledního týdne"],
    ["během následujícího roku", "now+1y", "během následujícího roku"],
  ] as const)(
    "distinguishes rolling Czech singular period %s",
    Effect.fn(function* (testCase) {
      const [input, endpoint, canonical] = testCase;
      const result = yield* parseCzech(input);
      const expected = input.includes("následujícího")
        ? { gte: "now", lte: endpoint }
        : { gte: endpoint, lte: "now" };
      expect(formatFilter(result.range)).toEqual(expected);
      expect(yield* formatNatural(result.range, { locale: "cs" })).toBe(canonical);
    }, Effect.provide(CzechLanguageLayer)),
  );

  it.effect.each([
    ["poslední 2 dny", "now-2d"],
    ["poslední 3 týdny", "now-3w"],
    ["poslední 5 měsíců", "now-5M"],
    ["poslední 2 čtvrtletí", "now-2q"],
    ["poslední 5 let", "now-5y"],
  ] as const)(
    "maps Czech trailing unit in %s",
    Effect.fn(function* (testCase) {
      const [input, gte] = testCase;
      expect(formatFilter((yield* parseCzech(input)).range)).toEqual({ gte, lte: "now" });
    }),
  );

  it.effect.each([
    ["příští 2 dny", "now+2d"],
    ["následující 3 týdny", "now+3w"],
    ["příští 5 měsíců", "now+5M"],
    ["příští 2 čtvrtletí", "now+2q"],
    ["příští 5 let", "now+5y"],
  ] as const)(
    "maps Czech future rolling unit in %s",
    Effect.fn(function* (testCase) {
      const [input, lte] = testCase;
      expect(formatFilter((yield* parseCzech(input)).range)).toEqual({ gte: "now", lte });
    }),
  );

  it.effect.each([
    ["před 30 měsíci", "now-30M/M", "now-30M/M+1M", "před 30 měsíci"],
    ["za 2 týdny", "now+2w/w", "now+2w/w+1w", "za 2 týdny"],
    ["za 5 let", "now+5y/y", "now+5y/y+1y", "za 5 let"],
    ["před 1 dnem", "now-1d/d", "now-1d/d+1d", "včera"],
  ] as const)(
    "maps Czech calendar offset %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt, canonical] = testCase;
      const result = yield* parseCzech(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
      expect(yield* formatNatural(result.range, { locale: "cs" })).toBe(canonical);
    }, Effect.provide(CzechLanguageLayer)),
  );

  it.effect.each([
    ["leden 2025", "2025-01-01", "2025-02-01"],
    ["únor 2025", "2025-02-01", "2025-03-01"],
    ["březen 2025", "2025-03-01", "2025-04-01"],
    ["duben 2025", "2025-04-01", "2025-05-01"],
    ["květen 2025", "2025-05-01", "2025-06-01"],
    ["červen 2025", "2025-06-01", "2025-07-01"],
    ["červenec 2025", "2025-07-01", "2025-08-01"],
    ["srpen 2025", "2025-08-01", "2025-09-01"],
    ["září 2025", "2025-09-01", "2025-10-01"],
    ["říjen 2025", "2025-10-01", "2025-11-01"],
    ["listopad 2025", "2025-11-01", "2025-12-01"],
    ["prosinec 2025", "2025-12-01", "2026-01-01"],
  ] as const)(
    "maps fixed Czech month %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseCzech(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["Q1 2025", "2025-01-01", "2025-04-01", "Q1 2025"],
    ["2. čtvrtletí 2025", "2025-04-01", "2025-07-01", "Q2 2025"],
    ["třetí čtvrtletí 2025", "2025-07-01", "2025-10-01", "Q3 2025"],
    ["čtvrté čtvrtletí 2025", "2025-10-01", "2026-01-01", "Q4 2025"],
  ] as const)(
    "maps Czech quarter expression %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt, canonical] = testCase;
      const result = yield* parseCzech(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
      expect(yield* formatNatural(result.range, { locale: "cs" })).toBe(canonical);
    }, Effect.provide(CzechLanguageLayer)),
  );

  it.effect.each([
    ["Q1 minulého roku", "now-1y/y", "now-1y/y+1q"],
    ["Q2 tohoto roku", "now/y+3M", "now/y+3M+1q"],
    ["Q4 příštího roku", "now+1y/y+9M", "now+1y/y+9M+1q"],
  ] as const)(
    "maps Czech quarter in a relative year %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseCzech(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["1. ledna 2025", "2025-01-01", "2025-01-02"],
    ["31. prosince 2025", "2025-12-31", "2026-01-01"],
    ["29. 2. 2024", "2024-02-29", "2024-03-01"],
    ["1/3/2025", "2025-03-01", "2025-03-02"],
  ] as const)(
    "maps Czech absolute date %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseCzech(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each(["12. ledna", "12 ledna"])(
    "maps current-year Czech date %j",
    Effect.fn(function* (input) {
      const result = yield* parseCzech(input);
      expect(formatFilter(result.range)).toEqual({ gte: "now/y+11d", lt: "now/y+12d" });
      expect(yield* formatNatural(result.range, { locale: "cs" })).toBe("12. ledna");
    }, Effect.provide(CzechLanguageLayer)),
  );

  it.effect.each([
    ["předevčírem", "now-2d/d", "now-2d/d+1d"],
    ["pozítří", "now+2d/d", "now+2d/d+1d"],
    ["předminulý měsíc", "now-2M/M", "now-2M/M+1M"],
    ["přespříští rok", "now+2y/y", "now+2y/y+1y"],
  ] as const)(
    "maps outer Czech relative period %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseCzech(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["leden minulého roku", "now-1y/y", "now-1y/y+1M"],
    ["březen tohoto roku", "now/y+2M", "now/y+3M"],
    ["prosinec příštího roku", "now+1y/y+11M", "now+1y/y+12M"],
  ] as const)(
    "maps Czech month in a relative year %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseCzech(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["od ledna 2025", { gte: "2025-01-01" }],
    ["počínaje lednem 2025", { gte: "2025-01-01" }],
    ["před lednem 2025", { lt: "2025-01-01" }],
    ["do ledna 2025", { lt: "2025-02-01" }],
    ["do ledna 2025 včetně", { lt: "2025-02-01" }],
    ["po lednu 2025", { gte: "2025-02-01" }],
    ["od nynějška", { gte: "now" }],
    ["dosud", { lte: "now" }],
  ] as const)(
    "maps Czech open boundary %s",
    Effect.fn(function* (testCase) {
      const [input, filter] = testCase;
      expect(formatFilter((yield* parseCzech(input)).range)).toEqual(filter);
    }),
  );

  it.effect.each([
    "od ledna 2025 do března 2025",
    "mezi lednem 2025 a březnem 2025",
    "leden 2025 - březen 2025",
  ])(
    "maps Czech joined range %j",
    Effect.fn(function* (input) {
      const result = yield* parseCzech(input);
      expect(formatFilter(result.range)).toEqual({ gte: "2025-01-01", lt: "2025-04-01" });
      expect(yield* formatNatural(result.range, { locale: "cs" })).toBe("Q1 2025");
    }, Effect.provide(CzechLanguageLayer)),
  );

  it.effect.each([
    ["od 1. do 15. ledna 2025", "2025-01-01", "2025-01-16"],
    ["1.–15. ledna", "now/y", "now/y+15d"],
  ] as const)(
    "maps elided Czech date range %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseCzech(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["led. 2025", "2025-01-01", "2025-02-01"],
    ["bře 2025", "2025-03-01", "2025-04-01"],
    ["zář 2025", "2025-09-01", "2025-10-01"],
    ["pro 2025", "2025-12-01", "2026-01-01"],
  ] as const)(
    "maps Czech abbreviated month %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseCzech(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["začátek tohoto roku", "now/y", "now/y+1d"],
    ["začátek příštího měsíce", "now+1M/M", "now+1M/M+1d"],
    ["konec minulého roku", "now-1y/y+1y-1d", "now-1y/y+1y"],
  ] as const)(
    "maps Czech period edge %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseCzech(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["od ledna 2025 do dneška", { gte: "2025-01-01", lte: "now" }],
    ["od dneška do března 2025", { gte: "now", lt: "2025-04-01" }],
  ] as const)(
    "maps Czech now-bounded range %s",
    Effect.fn(function* (testCase) {
      const [input, filter] = testCase;
      expect(formatFilter((yield* parseCzech(input)).range)).toEqual(filter);
    }),
  );

  it.effect(
    "uses a Czech calendar offset as a range endpoint",
    Effect.fn(function* () {
      const result = yield* parseCzech("minulý týden - za 2 týdny");
      expect(formatFilter(result.range)).toEqual({
        gte: "now-1w/w",
        lt: "now+2w/w+1w",
      });
    }),
  );

  it.effect.each([
    ["od dneška do příštího čtvrtka", { gte: "now", lt: "now+1w/w+4d" }],
    ["příští říjen", { gte: "now+1y/y+9M", lt: "now+1y/y+10M" }],
    ["začátek roku", { gte: "now/y", lt: "now/y+1d" }],
    ["začátek měsíce před třemi dny", { gte: "now/M-3d", lt: "now/M+1d-3d" }],
  ] as const)(
    "maps concise Czech period %s",
    Effect.fn(function* (testCase) {
      const [input, filter] = testCase;
      expect(formatFilter((yield* parseCzech(input)).range)).toEqual(filter);
    }),
  );

  it.effect.each([
    ["zbytek měsíce", "now/M+1M"],
    ["zbytek týdne", "now/w+1w"],
    ["zbytek roku", "now/y+1y"],
  ] as const)(
    "maps Czech remaining period %s",
    Effect.fn(function* (testCase) {
      const [input, lt] = testCase;
      expect(formatFilter((yield* parseCzech(input)).range)).toEqual({ gte: "now", lt });
    }),
  );

  it.effect.each(["31. dubna 2025", "29. 2. 2025", "13.13.2025", "leden 20"])(
    "rejects invalid Czech absolute period %j",
    Effect.fn(function* (input) {
      expect(yield* Effect.flip(parseCzech(input))).toBeInstanceOf(NaturalLanguageParseError);
    }),
  );

  it.effect(
    "corrects a Czech typo only in tolerant mode",
    Effect.fn(function* () {
      expect((yield* parseCzech("ledne 2025", "tolerant")).quality).toBe("corrected");
      expect(yield* Effect.flip(parseCzech("ledne 2025"))).toBeInstanceOf(
        NaturalLanguageParseError,
      );
    }),
  );

  it.effect.each([
    ["příští m", "příští měsíc"],
    ["led", "leden"],
    ["poslední 3 měs", "poslední 3 měsíce"],
    ["od led", "od leden"],
  ] as const)(
    "suggests Czech completion for %j",
    Effect.fn(function* (testCase) {
      const [input, expected] = testCase;
      const [suggestion] = yield* suggestCzech(input);
      if (suggestion === undefined) return expect.fail("Expected a suggestion");
      expect(suggestion.text).toBe(expected);
    }),
  );

  it.effect(
    "completes a partial Czech year",
    Effect.fn(function* () {
      expect((yield* suggestCzech("leden 202", 2)).map((entry) => entry.text)).toEqual([
        "leden 2020",
        "leden 2021",
      ]);
    }),
  );

  it.effect(
    "filters positive Czech suggestions",
    Effect.fn(function* () {
      expect(yield* suggestCzech("příští m", 10, false)).toEqual([]);
    }),
  );
});
