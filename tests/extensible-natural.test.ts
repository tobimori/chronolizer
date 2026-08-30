import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { formatFilter } from "../src/filter/codec.ts";
import { languagePluginsLayer } from "../src/language/registry.ts";
import { CzechLanguage } from "../src/locales/cs.ts";
import { GermanLanguage } from "../src/locales/de.ts";
import { EnglishLanguage } from "../src/locales/en.ts";
import { SpanishLanguage } from "../src/locales/es.ts";
import { FrenchLanguage } from "../src/locales/fr.ts";
import { DutchLanguage } from "../src/locales/nl.ts";
import { PolishLanguage } from "../src/locales/pl.ts";
import { TurkishLanguage } from "../src/locales/tr.ts";
import {
  formatNatural,
  NaturalLanguageParseError,
  parseNatural,
  suggestNatural,
} from "../src/index.ts";

const LanguagesLayer = languagePluginsLayer([
  EnglishLanguage,
  GermanLanguage,
  SpanishLanguage,
  FrenchLanguage,
  DutchLanguage,
  CzechLanguage,
  PolishLanguage,
  TurkishLanguage,
]);

const parse = (input: string, locale: string, typoMode: "strict" | "tolerant" = "strict") =>
  parseNatural(input, { locale, typoMode }).pipe(Effect.provide(LanguagesLayer));

const cases = [
  {
    locale: "en",
    singular: "one week ago",
    singularDigits: "1 week ago",
    small: "two weeks ago",
    smallDigits: "2 weeks ago",
    compound: "twenty-one weeks ago",
    compoundDigits: "21 weeks ago",
    high: "ninety-nine weeks ago",
    highDigits: "99 weeks ago",
    rolling: "last two weeks",
    rollingDigits: "last 2 weeks",
    shifted: "yesterday two weeks ago",
  },
  {
    locale: "de",
    singular: "vor einer woche",
    singularDigits: "vor 1 woche",
    small: "vor zwei wochen",
    smallDigits: "vor 2 wochen",
    compound: "vor einundzwanzig wochen",
    compoundDigits: "vor 21 wochen",
    high: "vor neunundneunzig wochen",
    highDigits: "vor 99 wochen",
    rolling: "die letzten zwei wochen",
    rollingDigits: "die letzten 2 wochen",
    shifted: "gestern vor zwei wochen",
  },
  {
    locale: "es",
    singular: "hace una semana",
    singularDigits: "hace 1 semana",
    small: "hace dos semanas",
    smallDigits: "hace 2 semanas",
    compound: "hace veintiuna semanas",
    compoundDigits: "hace 21 semanas",
    high: "hace noventa y nueve semanas",
    highDigits: "hace 99 semanas",
    rolling: "últimas dos semanas",
    rollingDigits: "últimas 2 semanas",
    shifted: "ayer hace dos semanas",
  },
  {
    locale: "fr",
    singular: "il y a une semaine",
    singularDigits: "il y a 1 semaine",
    small: "il y a deux semaines",
    smallDigits: "il y a 2 semaines",
    compound: "il y a vingt et une semaines",
    compoundDigits: "il y a 21 semaines",
    high: "il y a quatre-vingt-dix-neuf semaines",
    highDigits: "il y a 99 semaines",
    rolling: "les deux dernières semaines",
    rollingDigits: "les 2 dernières semaines",
    shifted: "hier il y a deux semaines",
  },
  {
    locale: "nl",
    singular: "een week geleden",
    singularDigits: "1 week geleden",
    small: "twee weken geleden",
    smallDigits: "2 weken geleden",
    compound: "eenentwintig weken geleden",
    compoundDigits: "21 weken geleden",
    high: "negenennegentig weken geleden",
    highDigits: "99 weken geleden",
    rolling: "de afgelopen twee weken",
    rollingDigits: "de afgelopen 2 weken",
    shifted: "gisteren twee weken geleden",
  },
  {
    locale: "cs",
    singular: "před jedním týdnem",
    singularDigits: "před 1 týdnem",
    small: "před dvěma týdny",
    smallDigits: "před 2 týdny",
    compound: "před dvaceti jedním týdnem",
    compoundDigits: "před 21 týdnem",
    high: "před devadesáti devíti týdny",
    highDigits: "před 99 týdny",
    rolling: "poslední dva týdny",
    rollingDigits: "poslední 2 týdny",
    shifted: "včera před dvěma týdny",
  },
  {
    locale: "pl",
    singular: "jeden tydzień temu",
    singularDigits: "1 tydzień temu",
    small: "dwa tygodnie temu",
    smallDigits: "2 tygodnie temu",
    compound: "dwadzieścia jeden tygodni temu",
    compoundDigits: "21 tygodni temu",
    high: "dziewięćdziesiąt dziewięć tygodni temu",
    highDigits: "99 tygodni temu",
    rolling: "ostatnie dwa tygodnie",
    rollingDigits: "ostatnie 2 tygodnie",
    shifted: "wczoraj dwa tygodnie temu",
  },
  {
    locale: "tr",
    singular: "bir hafta önce",
    singularDigits: "1 hafta önce",
    small: "iki hafta önce",
    smallDigits: "2 hafta önce",
    compound: "yirmi bir hafta önce",
    compoundDigits: "21 hafta önce",
    high: "doksan dokuz hafta önce",
    highDigits: "99 hafta önce",
    rolling: "son iki hafta",
    rollingDigits: "son 2 hafta",
    shifted: "iki hafta önce dün",
  },
] as const;

describe("extensible written counts and period offsets", () => {
  it.effect.each(cases)(
    "parses simple written counts in $locale",
    Effect.fn(function* (testCase) {
      for (const [wordsInput, digitsInput] of [
        [testCase.singular, testCase.singularDigits],
        [testCase.small, testCase.smallDigits],
      ] as const) {
        const words = yield* parse(wordsInput, testCase.locale);
        const digits = yield* parse(digitsInput, testCase.locale);
        expect(formatFilter(words.range)).toEqual(formatFilter(digits.range));
      }
    }),
  );

  it.effect.each(cases)(
    "parses compound written counts in $locale",
    Effect.fn(function* (testCase) {
      for (const [wordsInput, digitsInput] of [
        [testCase.compound, testCase.compoundDigits],
        [testCase.high, testCase.highDigits],
      ] as const) {
        const words = yield* parse(wordsInput, testCase.locale);
        const digits = yield* parse(digitsInput, testCase.locale);
        expect(formatFilter(words.range)).toEqual(formatFilter(digits.range));
      }
    }),
  );

  it.effect.each(cases)(
    "parses written counts in rolling $locale ranges",
    Effect.fn(function* (testCase) {
      const words = yield* parse(testCase.rolling, testCase.locale);
      const digits = yield* parse(testCase.rollingDigits, testCase.locale);
      expect(formatFilter(words.range)).toEqual(formatFilter(digits.range));
    }),
  );

  it.effect(
    "corrects a missing separator in a written count",
    Effect.fn(function* () {
      const spaced = yield* parse("twenty one weeks ago", "en");
      expect(formatFilter(spaced.range)).toEqual(
        formatFilter((yield* parse("21 weeks ago", "en")).range),
      );

      const strictError = yield* Effect.flip(parse("twentyone weeks ago", "en"));
      expect(strictError).toBeInstanceOf(NaturalLanguageParseError);

      const corrected = yield* parse("twentyone weeks ago", "en", "tolerant");
      expect(corrected.quality).toBe("corrected");
      expect(formatFilter(corrected.range)).toEqual(
        formatFilter((yield* parse("21 weeks ago", "en")).range),
      );
      expect(corrected.corrections).toContainEqual(
        expect.objectContaining({ original: "twentyone", replacement: "twenty one" }),
      );

      const multiPart = yield* parse("hace noventaynueve semanas", "es", "tolerant");
      expect(formatFilter(multiPart.range)).toEqual(
        formatFilter((yield* parse("hace 99 semanas", "es")).range),
      );
      expect(multiPart.corrections).toContainEqual(
        expect.objectContaining({ original: "noventaynueve", replacement: "noventa y nueve" }),
      );
    }),
  );

  it.effect(
    "suggests a strict phrase from a compound written count",
    Effect.fn(function* () {
      const suggestions = yield* suggestNatural("last twenty-one w", {
        locale: "en",
        limit: 1,
      }).pipe(Effect.provide(LanguagesLayer));
      expect(suggestions.map((suggestion) => suggestion.text)).toEqual(["last 21 weeks"]);
    }),
  );

  it.effect.each([
    ["en", "now next thursday", "from now to next Thursday"],
    ["de", "jetzt nächsten donnerstag", "von heute bis nächster Donnerstag"],
    ["fr", "maintenant jeudi prochain", "de maintenant à jeudi prochain"],
    ["cs", "od dneška příštího čtvrtka", "od dneška do příští čtvrtek"],
    ["pl", "od dziś następnego czwartku", "od dziś do następny czwartek"],
    ["es", "ahora el próximo jueves", "desde ahora hasta el próximo jueves"],
    ["nl", "nu tot en volgende donderdag", "vanaf nu tot en met volgende donderdag"],
    ["tr", "şimdi gelecek perşembe arası", "bugün ile gelecek perşembe arası"],
  ] as const)(
    "inserts a missing completion word in $locale",
    Effect.fn(function* ([locale, input, expected]) {
      const suggestions = yield* suggestNatural(input, { locale, limit: 1 }).pipe(
        Effect.provide(LanguagesLayer),
      );
      expect(suggestions.map((suggestion) => suggestion.text)).toEqual([expected]);
    }),
  );

  it.effect.each([
    ["now to next thursday", "from now to next Thursday"],
    ["start year", "start of this year"],
    ["three days before start month", "3 days before start of month"],
    ["last week to", "from last week to today"],
  ] as const)(
    "completes non-canonical English input %j",
    Effect.fn(function* ([input, expected]) {
      const suggestions = yield* suggestNatural(input, { locale: "en", limit: 1 }).pipe(
        Effect.provide(LanguagesLayer),
      );
      expect(suggestions.map((suggestion) => suggestion.text)).toEqual([expected]);
    }),
  );

  it.effect(
    "composes more than one period offset",
    Effect.fn(function* () {
      const parsed = yield* parse("yesterday two weeks ago three months ago", "en");
      const rendered = yield* formatNatural(parsed.range, { locale: "en" }).pipe(
        Effect.provide(LanguagesLayer),
      );
      const reparsed = yield* parse(rendered, "en");
      expect(formatFilter(reparsed.range)).toEqual(formatFilter(parsed.range));
    }),
  );

  it.effect.each(cases)(
    "shifts and renders an existing period in $locale",
    Effect.fn(function* (testCase) {
      const shifted = yield* parse(testCase.shifted, testCase.locale);
      const rendered = yield* formatNatural(shifted.range, { locale: testCase.locale }).pipe(
        Effect.provide(LanguagesLayer),
      );
      const reparsed = yield* parse(rendered, testCase.locale);
      expect(formatFilter(reparsed.range)).toEqual(formatFilter(shifted.range));
    }),
  );
});
