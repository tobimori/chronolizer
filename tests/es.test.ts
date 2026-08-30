import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { formatFilter } from "../src/filter/codec.ts";
import { SpanishLanguageLayer } from "../src/locales/es.ts";
import {
  formatNatural,
  NaturalLanguageParseError,
  parseNatural,
  suggestNatural,
} from "../src/index.ts";

const parseSpanish = (input: string, typoMode: "strict" | "tolerant" = "strict") =>
  parseNatural(input, { locale: "es", typoMode }).pipe(Effect.provide(SpanishLanguageLayer));

const suggestSpanish = (input: string, limit = 10, allowFuture = true) =>
  suggestNatural(input, { locale: "es", limit, allowFuture }).pipe(
    Effect.provide(SpanishLanguageLayer),
  );

describe("Spanish date ranges", () => {
  it.effect.each([
    ["hoy", "now/d", "now/d+1d"],
    ["ayer", "now-1d/d", "now-1d/d+1d"],
    ["mañana", "now+1d/d", "now+1d/d+1d"],
    ["la semana pasada", "now-1w/w", "now-1w/w+1w"],
    ["esta semana", "now/w", "now/w+1w"],
    ["la próxima semana", "now+1w/w", "now+1w/w+1w"],
    ["el mes pasado", "now-1M/M", "now-1M/M+1M"],
    ["este mes", "now/M", "now/M+1M"],
    ["el próximo mes", "now+1M/M", "now+1M/M+1M"],
    ["el trimestre pasado", "now-1q/q", "now-1q/q+1q"],
    ["este trimestre", "now/q", "now/q+1q"],
    ["el próximo trimestre", "now+1q/q", "now+1q/q+1q"],
    ["el año pasado", "now-1y/y", "now-1y/y+1y"],
    ["este año", "now/y", "now/y+1y"],
    ["el próximo año", "now+1y/y", "now+1y/y+1y"],
  ] as const)(
    "parses Spanish relative calendar period %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseSpanish(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    "año hasta la fecha",
    "en lo que va del año",
    "desde el inicio del año",
    "desde el comienzo del año",
    "desde principios del año",
    "este año hasta ahora",
  ])(
    "canonicalizes Spanish year-to-date variant %j",
    Effect.fn(function* (input) {
      const result = yield* parseSpanish(input);
      expect(formatFilter(result.range)).toEqual({ gte: "now/y", lte: "now" });
      expect(yield* formatNatural(result.range, { locale: "es" })).toBe("año hasta la fecha");
    }, Effect.provide(SpanishLanguageLayer)),
  );

  it.effect.each([
    "los últimos 3 meses",
    "últimos 3 meses",
    "los ultimos 3 meses",
    "pasados 3 meses",
    "anteriores 3 meses",
    "desde hace 3 meses",
    "durante los últimos 3 meses",
    "en los últimos 3 meses",
    "3 meses",
  ])(
    "canonicalizes Spanish counted-month variant %j",
    Effect.fn(function* (input) {
      const result = yield* parseSpanish(input);
      expect(formatFilter(result.range)).toEqual({ gte: "now-3M", lte: "now" });
      expect(yield* formatNatural(result.range, { locale: "es" })).toBe("últimos 3 meses");
    }, Effect.provide(SpanishLanguageLayer)),
  );

  it.effect.each([
    ["el último mes", "now-1M", "desde hace un mes"],
    ["durante la última semana", "now-1w", "desde hace una semana"],
    ["desde hace un año", "now-1y", "desde hace un año"],
    ["durante este último mes", "now-1M", "desde hace un mes"],
  ] as const)(
    "distinguishes rolling Spanish singular period %s",
    Effect.fn(function* (testCase) {
      const [input, gte, canonical] = testCase;
      const result = yield* parseSpanish(input);
      expect(formatFilter(result.range)).toEqual({ gte, lte: "now" });
      expect(yield* formatNatural(result.range, { locale: "es" })).toBe(canonical);
    }, Effect.provide(SpanishLanguageLayer)),
  );

  it.effect.each([
    ["desde ahora durante un mes", "now+1M", "desde ahora durante un mes"],
    ["durante la próxima semana", "now+1w", "desde ahora durante una semana"],
  ] as const)(
    "maps rolling Spanish singular future %s",
    Effect.fn(function* (testCase) {
      const [input, lte, canonical] = testCase;
      const result = yield* parseSpanish(input);
      expect(formatFilter(result.range)).toEqual({ gte: "now", lte });
      expect(yield* formatNatural(result.range, { locale: "es" })).toBe(canonical);
    }, Effect.provide(SpanishLanguageLayer)),
  );

  it.effect.each([
    ["últimos 2 días", "now-2d"],
    ["últimas 2 semanas", "now-2w"],
    ["últimos 2 meses", "now-2M"],
    ["últimos 2 trimestres", "now-2q"],
    ["últimos 2 años", "now-2y"],
  ] as const)(
    "maps Spanish trailing unit in %s",
    Effect.fn(function* (testCase) {
      const [input, gte] = testCase;
      expect(formatFilter((yield* parseSpanish(input)).range)).toEqual({ gte, lte: "now" });
    }),
  );

  it.effect.each([
    ["próximos 2 días", "now+2d"],
    ["próximas 2 semanas", "now+2w"],
    ["los proximos 2 meses", "now+2M"],
    ["siguientes 2 trimestres", "now+2q"],
    ["próximos 2 años", "now+2y"],
  ] as const)(
    "maps Spanish future rolling unit in %s",
    Effect.fn(function* (testCase) {
      const [input, lte] = testCase;
      expect(formatFilter((yield* parseSpanish(input)).range)).toEqual({ gte: "now", lte });
    }),
  );

  it.effect.each([
    ["últimas 2 semanas", "últimas 2 semanas"],
    ["durante las próximas 2 semanas", "próximas 2 semanas"],
    ["los últimos 2 meses", "últimos 2 meses"],
  ] as const)(
    "renders Spanish counted modifier with agreement for %s",
    Effect.fn(function* (testCase) {
      const [input, canonical] = testCase;
      const result = yield* parseSpanish(input);
      expect(yield* formatNatural(result.range, { locale: "es" })).toBe(canonical);
    }, Effect.provide(SpanishLanguageLayer)),
  );

  it.effect.each([
    ["hace 30 meses", "now-30M/M", "now-30M/M+1M", "hace 30 meses"],
    ["dentro de 2 semanas", "now+2w/w", "now+2w/w+1w", "dentro de 2 semanas"],
    ["en 3 años", "now+3y/y", "now+3y/y+1y", "dentro de 3 años"],
    ["hace 1 día", "now-1d/d", "now-1d/d+1d", "ayer"],
    ["hace un mes", "now-1M/M", "now-1M/M+1M", "el mes pasado"],
    ["dentro de una semana", "now+1w/w", "now+1w/w+1w", "la próxima semana"],
  ] as const)(
    "maps Spanish calendar offset %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt, canonical] = testCase;
      const result = yield* parseSpanish(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
      expect(yield* formatNatural(result.range, { locale: "es" })).toBe(canonical);
    }, Effect.provide(SpanishLanguageLayer)),
  );

  it.effect.each([
    ["enero de 2025", "2025-01-01", "2025-02-01"],
    ["febrero de 2025", "2025-02-01", "2025-03-01"],
    ["marzo 2025", "2025-03-01", "2025-04-01"],
    ["abril de 2025", "2025-04-01", "2025-05-01"],
    ["mayo de 2025", "2025-05-01", "2025-06-01"],
    ["junio de 2025", "2025-06-01", "2025-07-01"],
    ["julio de 2025", "2025-07-01", "2025-08-01"],
    ["agosto de 2025", "2025-08-01", "2025-09-01"],
    ["septiembre de 2025", "2025-09-01", "2025-10-01"],
    ["octubre de 2025", "2025-10-01", "2025-11-01"],
    ["noviembre de 2025", "2025-11-01", "2025-12-01"],
    ["diciembre de 2025", "2025-12-01", "2026-01-01"],
  ] as const)(
    "maps fixed Spanish month %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseSpanish(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["T1 2025", "2025-01-01", "2025-04-01", "T1 2025"],
    ["Q2 de 2025", "2025-04-01", "2025-07-01", "T2 2025"],
    ["tercer trimestre de 2025", "2025-07-01", "2025-10-01", "T3 2025"],
    ["cuarto trimestre 2025", "2025-10-01", "2026-01-01", "T4 2025"],
  ] as const)(
    "maps Spanish quarter expression %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt, canonical] = testCase;
      const result = yield* parseSpanish(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
      expect(yield* formatNatural(result.range, { locale: "es" })).toBe(canonical);
    }, Effect.provide(SpanishLanguageLayer)),
  );

  it.effect.each([
    ["T1 del año pasado", "now-1y/y", "now-1y/y+1q"],
    ["T2 de este año", "now/y+3M", "now/y+3M+1q"],
    ["T4 del próximo año", "now+1y/y+9M", "now+1y/y+9M+1q"],
  ] as const)(
    "maps Spanish quarter in a relative year %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseSpanish(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["1 de enero de 2025", "2025-01-01", "2025-01-02"],
    ["el día 1 de enero del 2025", "2025-01-01", "2025-01-02"],
    ["31 dic 2025", "2025-12-31", "2026-01-01"],
    ["29/2/2024", "2024-02-29", "2024-03-01"],
    ["1.3.2025", "2025-03-01", "2025-03-02"],
  ] as const)(
    "maps Spanish absolute date %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseSpanish(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each(["12 de enero", "12 enero", "el 12 de enero", "el día 12 de enero"])(
    "maps current-year Spanish date %j",
    Effect.fn(function* (input) {
      const result = yield* parseSpanish(input);
      expect(formatFilter(result.range)).toEqual({ gte: "now/y+11d", lt: "now/y+12d" });
      expect(yield* formatNatural(result.range, { locale: "es" })).toBe("12 de enero");
    }, Effect.provide(SpanishLanguageLayer)),
  );

  it.effect.each([
    ["anteayer", "now-2d/d", "now-2d/d+1d"],
    ["el día antes de ayer", "now-2d/d", "now-2d/d+1d"],
    ["pasado mañana", "now+2d/d", "now+2d/d+1d"],
    ["el día después de mañana", "now+2d/d", "now+2d/d+1d"],
    ["el mes anterior al pasado", "now-2M/M", "now-2M/M+1M"],
    ["el año después del próximo", "now+2y/y", "now+2y/y+1y"],
  ] as const)(
    "maps outer Spanish relative period %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseSpanish(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["semana actual", "now/w", "now/w+1w"],
    ["la semana anterior", "now-1w/w", "now-1w/w+1w"],
    ["mes siguiente", "now+1M/M", "now+1M/M+1M"],
    ["próximo trimestre", "now+1q/q", "now+1q/q+1q"],
  ] as const)(
    "maps Spanish adjective-position period %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseSpanish(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["enero del año pasado", "now-1y/y", "now-1y/y+1M"],
    ["marzo de este año", "now/y+2M", "now/y+3M"],
    ["diciembre del próximo año", "now+1y/y+11M", "now+1y/y+12M"],
  ] as const)(
    "maps Spanish month in a relative year %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseSpanish(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["desde enero de 2025", { gte: "2025-01-01" }],
    ["antes de enero de 2025", { lt: "2025-01-01" }],
    ["hasta enero de 2025", { lt: "2025-02-01" }],
    ["hasta enero de 2025 inclusive", { lt: "2025-02-01" }],
    ["hasta antes de enero de 2025", { lt: "2025-01-01" }],
    ["después de enero de 2025", { gte: "2025-02-01" }],
    ["desde ahora", { gte: "now" }],
    ["hasta ahora", { lte: "now" }],
  ] as const)(
    "maps Spanish open boundary %s",
    Effect.fn(function* (testCase) {
      const [input, filter] = testCase;
      expect(formatFilter((yield* parseSpanish(input)).range)).toEqual(filter);
    }),
  );

  it.effect.each([
    "desde enero de 2025 hasta marzo de 2025",
    "de enero de 2025 a marzo de 2025",
    "entre enero de 2025 y marzo de 2025",
    "enero de 2025 - marzo de 2025",
  ])(
    "maps Spanish joined range %j",
    Effect.fn(function* (input) {
      const result = yield* parseSpanish(input);
      expect(formatFilter(result.range)).toEqual({ gte: "2025-01-01", lt: "2025-04-01" });
      expect(yield* formatNatural(result.range, { locale: "es" })).toBe("T1 2025");
    }, Effect.provide(SpanishLanguageLayer)),
  );

  it.effect.each([
    ["del 4 al 22 de enero de 2025", "2025-01-04", "2025-01-23"],
    ["desde el 4 hasta el 22 de enero de 2025", "2025-01-04", "2025-01-23"],
    ["entre el 4 y el 22 de enero de 2025", "2025-01-04", "2025-01-23"],
    ["4–22 de enero de 2025", "2025-01-04", "2025-01-23"],
    ["4-22 enero", "now/y+3d", "now/y+22d"],
    ["del 4 al 22 de este mes", "now/M+3d", "now/M+22d"],
    ["entre el 4 y el 22 del mes pasado", "now-1M/M+3d", "now-1M/M+22d"],
  ] as const)(
    "maps elided Spanish date range %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseSpanish(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["ene. 2025", "2025-01-01", "2025-02-01"],
    ["setiembre de 2025", "2025-09-01", "2025-10-01"],
    ["dic 2025", "2025-12-01", "2026-01-01"],
  ] as const)(
    "maps Spanish abbreviated month %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseSpanish(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["inicio de este año", "now/y", "now/y+1d", "inicio de este año"],
    ["final del año pasado", "now-1y/y+1y-1d", "now-1y/y+1y", "final del año pasado"],
  ] as const)(
    "maps Spanish period edge %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt, canonical] = testCase;
      const result = yield* parseSpanish(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
      expect(yield* formatNatural(result.range, { locale: "es" })).toBe(canonical);
    }, Effect.provide(SpanishLanguageLayer)),
  );

  it.effect.each([
    ["desde enero de 2025 hasta ahora", { gte: "2025-01-01", lte: "now" }],
    ["desde ahora hasta marzo de 2025", { gte: "now", lt: "2025-04-01" }],
  ] as const)(
    "maps Spanish now-bounded range %s",
    Effect.fn(function* (testCase) {
      const [input, filter] = testCase;
      expect(formatFilter((yield* parseSpanish(input)).range)).toEqual(filter);
    }),
  );

  it.effect(
    "uses a Spanish calendar offset as a range endpoint",
    Effect.fn(function* () {
      const result = yield* parseSpanish("la semana pasada - dentro de 2 semanas");
      expect(formatFilter(result.range)).toEqual({
        gte: "now-1w/w",
        lt: "now+2w/w+1w",
      });
    }),
  );

  it.effect.each([
    ["ahora hasta el próximo jueves", { gte: "now", lt: "now+1w/w+4d" }],
    ["próximo octubre", { gte: "now+1y/y+9M", lt: "now+1y/y+10M" }],
    ["inicio del año", { gte: "now/y", lt: "now/y+1d" }],
    ["inicio del mes hace tres días", { gte: "now/M-3d", lt: "now/M-2d" }],
  ] as const)(
    "maps concise Spanish period %s",
    Effect.fn(function* (testCase) {
      const [input, filter] = testCase;
      expect(formatFilter((yield* parseSpanish(input)).range)).toEqual(filter);
    }),
  );

  it.effect.each([
    ["resto del mes", "now/M+1M"],
    ["lo que queda del año", "now/y+1y"],
  ] as const)(
    "maps Spanish remaining period %s",
    Effect.fn(function* (testCase) {
      const [input, lt] = testCase;
      expect(formatFilter((yield* parseSpanish(input)).range)).toEqual({ gte: "now", lt });
    }),
  );

  it.effect.each([
    "31 de abril de 2025",
    "29/2/2025",
    "13/13/2025",
    "enero de 20",
    "los últimos 2 semanas",
    "las últimas 2 meses",
    "últimos 2 mes",
    "desde hace una mes",
    "hace un semanas",
    "29 de este mes",
    "del 4 al 29 de este mes",
  ])(
    "rejects invalid Spanish absolute period %j",
    Effect.fn(function* (input) {
      const error = yield* Effect.flip(parseSpanish(input));
      expect(error).toBeInstanceOf(NaturalLanguageParseError);
    }),
  );

  it.effect(
    "corrects a Spanish typo only in tolerant mode",
    Effect.fn(function* () {
      expect((yield* parseSpanish("enro de 2025", "tolerant")).quality).toBe("corrected");
      const error = yield* Effect.flip(parseSpanish("enro de 2025"));
      expect(error).toBeInstanceOf(NaturalLanguageParseError);
    }),
  );

  it.effect.each([
    ["el prox mes", "el próximo mes"],
    ["ener", "enero"],
    ["últimos 3 mes", "últimos 3 meses"],
    ["desde ene", "desde enero"],
  ] as const)(
    "suggests Spanish completion for %j",
    Effect.fn(function* (testCase) {
      const [input, expected] = testCase;
      const [suggestion] = yield* suggestSpanish(input);
      if (suggestion === undefined) return expect.fail("Expected a suggestion");
      expect(suggestion.text).toBe(expected);
    }),
  );

  it.effect(
    "uses grammatical Spanish gender in suggestions",
    Effect.fn(function* () {
      const [past] = yield* suggestSpanish("última s");
      const [future] = yield* suggestSpanish("durante la próx");
      if (past === undefined || future === undefined) {
        return expect.fail("Expected gender-aware suggestions");
      }
      expect(past.text).toBe("desde hace una semana");
      expect(future.text).toBe("desde ahora durante una semana");
    }),
  );

  it.effect(
    "completes a partial Spanish year",
    Effect.fn(function* () {
      const suggestions = yield* suggestSpanish("enero 202", 2);
      expect(suggestions.map((entry) => entry.text)).toEqual(["enero de 2020", "enero de 2021"]);
    }),
  );

  it.effect(
    "filters positive Spanish suggestions",
    Effect.fn(function* () {
      expect(yield* suggestSpanish("el próximo m", 10, false)).toEqual([]);
    }),
  );
});
