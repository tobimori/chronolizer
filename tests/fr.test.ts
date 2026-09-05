import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { formatFilter } from "../src/filter/codec.ts";
import { FrenchLanguageLayer } from "../src/locales/fr.ts";
import {
  formatNatural,
  NaturalLanguageParseError,
  parseNatural,
  suggestNatural,
} from "../src/index.ts";

const parseFrench = (input: string, typoMode: "strict" | "tolerant" = "strict") =>
  parseNatural(input, { locale: "fr", typoMode }).pipe(Effect.provide(FrenchLanguageLayer));

const suggestFrench = (input: string, limit = 10, allowFuture = true) =>
  suggestNatural(input, { locale: "fr", limit, allowFuture }).pipe(
    Effect.provide(FrenchLanguageLayer),
  );

describe("French date ranges", () => {
  it.effect.each([
    ["aujourd'hui", "now/d", "now/d+1d"],
    ["hier", "now-1d/d", "now-1d/d+1d"],
    ["demain", "now+1d/d", "now+1d/d+1d"],
    ["la semaine dernière", "now-1w/w", "now-1w/w+1w"],
    ["cette semaine", "now/w", "now/w+1w"],
    ["la semaine prochaine", "now+1w/w", "now+1w/w+1w"],
    ["le mois dernier", "now-1M/M", "now-1M/M+1M"],
    ["ce mois-ci", "now/M", "now/M+1M"],
    ["le mois prochain", "now+1M/M", "now+1M/M+1M"],
    ["le trimestre dernier", "now-1q/q", "now-1q/q+1q"],
    ["ce trimestre", "now/q", "now/q+1q"],
    ["le trimestre prochain", "now+1q/q", "now+1q/q+1q"],
    ["l'année dernière", "now-1y/y", "now-1y/y+1y"],
    ["cette année", "now/y", "now/y+1y"],
    ["l'année prochaine", "now+1y/y", "now+1y/y+1y"],
  ] as const)(
    "parses French relative calendar period %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseFrench(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    "année à ce jour",
    "depuis le début de l'année",
    "depuis le début d'année",
    "depuis le début de l'année en cours",
    "depuis le commencement de l'année",
    "cette année jusqu'à maintenant",
  ])(
    "canonicalizes French year-to-date variant %j",
    Effect.fn(function* (input) {
      const result = yield* parseFrench(input);
      expect(formatFilter(result.range)).toEqual({ gte: "now/y", lte: "now" });
      expect(yield* formatNatural(result.range, { locale: "fr" })).toBe("année à ce jour");
    }, Effect.provide(FrenchLanguageLayer)),
  );

  it.effect.each([
    "les 3 derniers mois",
    "3 derniers mois",
    "derniers 3 mois",
    "3 mois passés",
    "3 mois précédents",
    "3 mois precedents",
    "depuis 3 mois",
    "au cours des 3 derniers mois",
    "pendant les 3 derniers mois",
    "3 mois",
  ])(
    "canonicalizes French counted-month variant %j",
    Effect.fn(function* (input) {
      const result = yield* parseFrench(input);
      expect(formatFilter(result.range)).toEqual({ gte: "now-3M", lte: "now" });
      expect(yield* formatNatural(result.range, { locale: "fr" })).toBe("les 3 derniers mois");
    }, Effect.provide(FrenchLanguageLayer)),
  );

  it.effect.each([
    ["le dernier mois", "now-1M", "depuis un mois"],
    ["au cours de la dernière semaine", "now-1w", "depuis une semaine"],
    ["depuis un an", "now-1y", "depuis un an"],
    ["la dernière année", "now-1y", "depuis un an"],
  ] as const)(
    "distinguishes rolling French singular period %s",
    Effect.fn(function* (testCase) {
      const [input, gte, canonical] = testCase;
      const result = yield* parseFrench(input);
      expect(formatFilter(result.range)).toEqual({ gte, lte: "now" });
      expect(yield* formatNatural(result.range, { locale: "fr" })).toBe(canonical);
    }, Effect.provide(FrenchLanguageLayer)),
  );

  it.effect.each([
    ["à partir de maintenant pendant un mois", "now+1M", "à partir de maintenant pendant un mois"],
    ["pendant la prochaine semaine", "now+1w", "à partir de maintenant pendant une semaine"],
    ["pendant la prochaine année", "now+1y", "à partir de maintenant pendant un an"],
  ] as const)(
    "maps rolling French singular future %s",
    Effect.fn(function* (testCase) {
      const [input, lte, canonical] = testCase;
      const result = yield* parseFrench(input);
      expect(formatFilter(result.range)).toEqual({ gte: "now", lte });
      expect(yield* formatNatural(result.range, { locale: "fr" })).toBe(canonical);
    }, Effect.provide(FrenchLanguageLayer)),
  );

  it.effect.each([
    ["2 jours précédents", "now-2d"],
    ["2 semaines précédentes", "now-2w"],
    ["2 mois précédents", "now-2M"],
    ["2 trimestres précédents", "now-2q"],
    ["2 années précédentes", "now-2y"],
  ] as const)(
    "maps French trailing unit in %s",
    Effect.fn(function* (testCase) {
      const [input, gte] = testCase;
      expect(formatFilter((yield* parseFrench(input)).range)).toEqual({ gte, lte: "now" });
    }),
  );

  it.effect.each([
    ["les 2 prochains jours", "now+2d"],
    ["2 prochaines semaines", "now+2w"],
    ["2 mois à venir", "now+2M"],
    ["2 trimestres suivants", "now+2q"],
    ["2 années à venir", "now+2y"],
  ] as const)(
    "maps French future rolling unit in %s",
    Effect.fn(function* (testCase) {
      const [input, lte] = testCase;
      expect(formatFilter((yield* parseFrench(input)).range)).toEqual({ gte: "now", lte });
    }),
  );

  it.effect.each([
    ["les 2 dernières années", "les 2 dernières années"],
    ["les 2 prochaines semaines", "les 2 prochaines semaines"],
  ] as const)(
    "renders French counted agreement for %s",
    Effect.fn(function* (testCase) {
      const [input, canonical] = testCase;
      const result = yield* parseFrench(input);
      expect(yield* formatNatural(result.range, { locale: "fr" })).toBe(canonical);
    }, Effect.provide(FrenchLanguageLayer)),
  );

  it.effect.each([
    ["il y a 30 mois", "now-30M/M", "now-30M/M+1M", "il y a 30 mois"],
    ["dans 2 semaines", "now+2w/w", "now+2w/w+1w", "dans 2 semaines"],
    ["dans 3 ans", "now+3y/y", "now+3y/y+1y", "dans 3 ans"],
    ["il y a 1 jour", "now-1d/d", "now-1d/d+1d", "hier"],
    ["il y a un mois", "now-1M/M", "now-1M/M+1M", "le mois dernier"],
    ["dans une semaine", "now+1w/w", "now+1w/w+1w", "la semaine prochaine"],
  ] as const)(
    "maps French calendar offset %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt, canonical] = testCase;
      const result = yield* parseFrench(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
      expect(yield* formatNatural(result.range, { locale: "fr" })).toBe(canonical);
    }, Effect.provide(FrenchLanguageLayer)),
  );

  it.effect.each([
    ["janvier 2025", "2025-01-01", "2025-02-01"],
    ["février 2025", "2025-02-01", "2025-03-01"],
    ["mars 2025", "2025-03-01", "2025-04-01"],
    ["avril 2025", "2025-04-01", "2025-05-01"],
    ["mai 2025", "2025-05-01", "2025-06-01"],
    ["juin 2025", "2025-06-01", "2025-07-01"],
    ["juillet 2025", "2025-07-01", "2025-08-01"],
    ["août 2025", "2025-08-01", "2025-09-01"],
    ["septembre 2025", "2025-09-01", "2025-10-01"],
    ["octobre 2025", "2025-10-01", "2025-11-01"],
    ["novembre 2025", "2025-11-01", "2025-12-01"],
    ["décembre 2025", "2025-12-01", "2026-01-01"],
  ] as const)(
    "maps fixed French month %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseFrench(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["T1 2025", "2025-01-01", "2025-04-01", "T1 2025"],
    ["Q2 de 2025", "2025-04-01", "2025-07-01", "T2 2025"],
    ["troisième trimestre de 2025", "2025-07-01", "2025-10-01", "T3 2025"],
    ["4ème trimestre 2025", "2025-10-01", "2026-01-01", "T4 2025"],
  ] as const)(
    "maps French quarter expression %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt, canonical] = testCase;
      const result = yield* parseFrench(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
      expect(yield* formatNatural(result.range, { locale: "fr" })).toBe(canonical);
    }, Effect.provide(FrenchLanguageLayer)),
  );

  it.effect.each([
    ["T1 de l'année dernière", "now-1y/y", "now-1y/y+1q"],
    ["T2 de cette année", "now/y+3M", "now/y+3M+1q"],
    ["T4 de l'année prochaine", "now+1y/y+9M", "now+1y/y+9M+1q"],
  ] as const)(
    "maps French quarter in a relative year %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseFrench(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["1er janvier 2025", "2025-01-01", "2025-01-02"],
    ["31 déc. 2025", "2025-12-31", "2026-01-01"],
    ["29/2/2024", "2024-02-29", "2024-03-01"],
    ["1.3.2025", "2025-03-01", "2025-03-02"],
  ] as const)(
    "maps French absolute date %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseFrench(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each(["12 janvier", "le 12 janvier"])(
    "maps current-year French date %j",
    Effect.fn(function* (input) {
      const result = yield* parseFrench(input);
      expect(formatFilter(result.range)).toEqual({ gte: "now/y+11d", lt: "now/y+12d" });
      expect(yield* formatNatural(result.range, { locale: "fr" })).toBe("12 janvier");
    }, Effect.provide(FrenchLanguageLayer)),
  );

  it.effect.each([
    ["avant-hier", "now-2d/d", "now-2d/d+1d"],
    ["après-demain", "now+2d/d", "now+2d/d+1d"],
    ["le mois avant le dernier", "now-2M/M", "now-2M/M+1M"],
    ["l'année après la prochaine", "now+2y/y", "now+2y/y+1y"],
  ] as const)(
    "maps outer French relative period %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseFrench(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["janvier de l'année dernière", "now-1y/y", "now-1y/y+1M"],
    ["mars de cette année", "now/y+2M", "now/y+3M"],
    ["décembre de l'année prochaine", "now+1y/y+11M", "now+1y/y+12M"],
  ] as const)(
    "maps French month in a relative year %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseFrench(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["depuis janvier 2025", { gte: "2025-01-01" }],
    ["avant janvier 2025", { lt: "2025-01-01" }],
    ["jusqu'à janvier 2025", { lt: "2025-02-01" }],
    ["jusqu'avant janvier 2025", { lt: "2025-01-01" }],
    ["jusqu'à janvier 2025 inclus", { lt: "2025-02-01" }],
    ["jusqu'au mois prochain", { lt: "now+1M/M+1M" }],
    ["après janvier 2025", { gte: "2025-02-01" }],
    ["depuis maintenant", { gte: "now" }],
    ["jusqu'à maintenant", { lte: "now" }],
  ] as const)(
    "maps French open boundary %s",
    Effect.fn(function* (testCase) {
      const [input, filter] = testCase;
      expect(formatFilter((yield* parseFrench(input)).range)).toEqual(filter);
    }),
  );

  it.effect.each([
    "depuis janvier 2025 jusqu'à mars 2025",
    "de janvier 2025 à mars 2025",
    "entre janvier 2025 et mars 2025",
    "janvier 2025 - mars 2025",
    "du 1er janvier 2025 au 31 mars 2025",
  ])(
    "maps French joined range %j",
    Effect.fn(function* (input) {
      const result = yield* parseFrench(input);
      expect(formatFilter(result.range)).toEqual({ gte: "2025-01-01", lt: "2025-04-01" });
      expect(yield* formatNatural(result.range, { locale: "fr" })).toBe("T1 2025");
    }, Effect.provide(FrenchLanguageLayer)),
  );

  it.effect.each([
    ["du 4 au 22 janvier 2025", "2025-01-04", "2025-01-23"],
    ["entre le 4 et le 22 janvier, 2025", "2025-01-04", "2025-01-23"],
    ["4–22 janvier 2025", "2025-01-04", "2025-01-23"],
    ["du 4 au 22 de ce mois", "now/M+3d", "now/M+22d"],
    ["entre le 4 et le 22 du mois dernier", "now-1M/M+3d", "now-1M/M+22d"],
  ] as const)(
    "maps elided French date range %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseFrench(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect(
    "renders French contractions in boundaries and ranges",
    Effect.fn(function* () {
      const boundary = yield* parseFrench("jusqu'au mois prochain");
      const range = yield* parseFrench("de février 2024 à mars 2024");
      expect(yield* formatNatural(boundary.range, { locale: "fr" })).toBe("jusqu'au mois prochain");
      expect(yield* formatNatural(range.range, { locale: "fr" })).toBe(
        "de février 2024 à mars 2024",
      );
    }, Effect.provide(FrenchLanguageLayer)),
  );

  it.effect.each([
    ["janv. 2025", "2025-01-01", "2025-02-01"],
    ["fevr. 2025", "2025-02-01", "2025-03-01"],
    ["aout 2025", "2025-08-01", "2025-09-01"],
    ["déc. 2025", "2025-12-01", "2026-01-01"],
  ] as const)(
    "maps French abbreviated month %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt] = testCase;
      expect(formatFilter((yield* parseFrench(input)).range)).toEqual({ gte, lt });
    }),
  );

  it.effect.each([
    ["début de cette année", "now/y", "now/y+1d", "début de cette année"],
    ["debut du mois prochain", "now+1M/M", "now+1M/M+1d", "début du mois prochain"],
    ["fin de l'année dernière", "now-1y/y+1y-1d", "now-1y/y+1y", "fin de l'année dernière"],
  ] as const)(
    "maps French period edge %s",
    Effect.fn(function* (testCase) {
      const [input, gte, lt, canonical] = testCase;
      const result = yield* parseFrench(input);
      expect(formatFilter(result.range)).toEqual({ gte, lt });
      expect(yield* formatNatural(result.range, { locale: "fr" })).toBe(canonical);
    }, Effect.provide(FrenchLanguageLayer)),
  );

  it.effect.each([
    ["depuis janvier 2025 jusqu'à maintenant", { gte: "2025-01-01", lte: "now" }],
    ["de maintenant à mars 2025", { gte: "now", lt: "2025-04-01" }],
    ["d'aujourd'hui à mars 2025", { gte: "now", lt: "2025-04-01" }],
  ] as const)(
    "maps French now-bounded range %s",
    Effect.fn(function* (testCase) {
      const [input, filter] = testCase;
      expect(formatFilter((yield* parseFrench(input)).range)).toEqual(filter);
    }),
  );

  it.effect(
    "uses a French calendar offset as a range endpoint",
    Effect.fn(function* () {
      const result = yield* parseFrench("la semaine dernière - dans 2 semaines");
      expect(formatFilter(result.range)).toEqual({
        gte: "now-1w/w",
        lt: "now+2w/w+1w",
      });
    }),
  );

  it.effect.each([
    ["maintenant à jeudi prochain", { gte: "now", lt: "now+1w/w+4d" }],
    ["octobre prochain", { gte: "now+1y/y+9M", lt: "now+1y/y+10M" }],
    ["début de l'année", { gte: "now/y", lt: "now/y+1d" }],
    ["début du mois il y a trois jours", { gte: "now/M-3d", lt: "now/M+1d-3d" }],
  ] as const)(
    "maps concise French period %s",
    Effect.fn(function* (testCase) {
      const [input, filter] = testCase;
      expect(formatFilter((yield* parseFrench(input)).range)).toEqual(filter);
    }),
  );

  it.effect.each([
    ["reste du mois", "now/M+1M"],
    ["reste de cette semaine", "now/w+1w"],
    ["ce qui reste de l'année", "now/y+1y"],
  ] as const)(
    "maps French remaining period %s",
    Effect.fn(function* (testCase) {
      const [input, lt] = testCase;
      expect(formatFilter((yield* parseFrench(input)).range)).toEqual({ gte: "now", lt });
    }),
  );

  it.effect.each([
    "31 avril 2025",
    "29/2/2025",
    "13/13/2025",
    "janvier 20",
    "29 de ce mois",
    "du 4 au 29 de ce mois",
    "les 2 derniers semaines",
    "les 2 dernières mois",
    "il y a 2 semaine",
    "dans 1 semaines",
  ])(
    "rejects invalid French absolute period %j",
    Effect.fn(function* (input) {
      const error = yield* Effect.flip(parseFrench(input));
      expect(error).toBeInstanceOf(NaturalLanguageParseError);
    }),
  );

  it.effect(
    "normalizes a French typographic apostrophe",
    Effect.fn(function* () {
      expect(formatFilter((yield* parseFrench("l’année dernière")).range)).toEqual({
        gte: "now-1y/y",
        lt: "now-1y/y+1y",
      });
    }),
  );

  it.effect(
    "corrects a French typo only in tolerant mode",
    Effect.fn(function* () {
      expect((yield* parseFrench("janver 2025", "tolerant")).quality).toBe("corrected");
      const error = yield* Effect.flip(parseFrench("janver 2025"));
      expect(error).toBeInstanceOf(NaturalLanguageParseError);
    }),
  );

  it.effect.each([
    ["le mois pro", "le mois prochain"],
    ["janv", "janvier"],
    ["3 derniers moi", "les 3 derniers mois"],
    ["depuis jan", "depuis janvier"],
  ] as const)(
    "suggests French completion for %j",
    Effect.fn(function* (testCase) {
      const [input, expected] = testCase;
      const [suggestion] = yield* suggestFrench(input);
      if (suggestion === undefined) return expect.fail("Expected a suggestion");
      expect(suggestion.text).toBe(expected);
    }),
  );

  it.effect(
    "uses French gender in singular suggestions",
    Effect.fn(function* () {
      const [past] = yield* suggestFrench("la dernière s");
      const [future] = yield* suggestFrench("pendant la prochaine a");
      if (past === undefined || future === undefined) {
        return expect.fail("Expected gender-aware suggestions");
      }
      expect(past.text).toBe("depuis une semaine");
      expect(future.text).toBe("à partir de maintenant pendant un an");
    }),
  );

  it.effect(
    "completes a partial French year",
    Effect.fn(function* () {
      const suggestions = yield* suggestFrench("janvier 202", 2);
      expect(suggestions.map((entry) => entry.text)).toEqual(["janvier 2020", "janvier 2021"]);
    }),
  );

  it.effect(
    "filters positive French suggestions",
    Effect.fn(function* () {
      expect(yield* suggestFrench("le mois pro", 10, false)).toEqual([]);
    }),
  );
});
