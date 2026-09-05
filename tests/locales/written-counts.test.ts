import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { formatFilter } from "../../src/filter/codec.ts";
import { parseNatural } from "../../src/index.ts";
import { LanguagesLayer } from "./languages.ts";

const cases = [
  {
    locale: "en",
    tens: ["thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"],
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
  },
  {
    locale: "de",
    tens: ["dreißig", "vierzig", "fünfzig", "sechzig", "siebzig", "achtzig", "neunzig"],
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
  },
  {
    locale: "es",
    tens: ["treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"],
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
  },
  {
    locale: "fr",
    tens: [
      "trente",
      "quarante",
      "cinquante",
      "soixante",
      "soixante-dix",
      "quatre-vingts",
      "quatre-vingt-dix",
    ],
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
  },
  {
    locale: "nl",
    tens: ["dertig", "veertig", "vijftig", "zestig", "zeventig", "tachtig", "negentig"],
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
  },
  {
    locale: "cs",
    tens: ["třiceti", "čtyřiceti", "padesáti", "šedesáti", "sedmdesáti", "osmdesáti", "devadesáti"],
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
  },
  {
    locale: "pl",
    tens: [
      "trzydzieści",
      "czterdzieści",
      "pięćdziesiąt",
      "sześćdziesiąt",
      "siedemdziesiąt",
      "osiemdziesiąt",
      "dziewięćdziesiąt",
    ],
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
  },
  {
    locale: "tr",
    tens: ["otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"],
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
  },
] as const;

describe("written counts", () => {
  it.effect.each(
    cases.flatMap((testCase) =>
      testCase.tens.map((word, index) => ({
        locale: testCase.locale,
        input: testCase.smallDigits.replace("2", word),
        amount: 30 + index * 10,
      })),
    ),
  )(
    "parses whole written tens in $locale: $input",
    Effect.fn(function* ({ locale, input, amount }) {
      const parsed = yield* parseNatural(input, { locale });
      expect(formatFilter(parsed.range)).toEqual({
        gte: `now-${amount}w/w`,
        lt: `now-${amount}w/w+1w`,
      });
      expect(parsed.quality).toBe("exact");
    }, Effect.provide(LanguagesLayer)),
  );

  it.effect.each(
    cases.flatMap((testCase) =>
      (
        [
          [testCase.singular, testCase.singularDigits],
          [testCase.small, testCase.smallDigits],
          [testCase.compound, testCase.compoundDigits],
          [testCase.high, testCase.highDigits],
          [testCase.rolling, testCase.rollingDigits],
        ] as const
      ).map(([input, digits]) => ({ locale: testCase.locale, input, digits })),
    ),
  )(
    "parses written count in $locale: $input",
    Effect.fn(function* ({ locale, input, digits }) {
      const words = yield* parseNatural(input, { locale });
      const numeric = yield* parseNatural(digits, { locale });
      expect(formatFilter(words.range)).toEqual(formatFilter(numeric.range));
    }, Effect.provide(LanguagesLayer)),
  );
});
