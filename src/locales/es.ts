import { Effect, Option, String as EffectString } from "effect";

import { isIsoDate } from "../ast/schemas.ts";
import type { DateRangeExpr, Unit } from "../ast/schemas.ts";
import { BaseLanguageContribution } from "../language/model.ts";
import { defineLanguagePlugin, languagePluginsLayer } from "../language/registry.ts";
import { correctWhitespaceSeparatedText } from "../natural/correction.ts";
import {
  completeNaturalPhrases,
  fixedCalendarPeriodPhrases,
  naturalCount,
  prefixNaturalPhrases,
} from "../natural/suggestion.ts";
import { normalizeNaturalText } from "../natural/text.ts";
import {
  absoluteDatePeriod,
  calendarPeriodOffset,
  candidate,
  compoundCountAliases,
  sequentialCountAliases,
  countAliasVocabulary,
  currentYearDatePeriods,
  decimalTens,
  datedPeriods,
  datedQuarterPeriods,
  fixedDatePeriod,
  fixedMonthPeriod,
  fixedQuarterPeriod,
  fixedYearPeriod,
  fromNowRange,
  futurePeriod,
  futureRange,
  isoDate,
  joinedNowCandidate,
  joinedPeriodCandidate,
  monthOfRelativeYear,
  namedCurrentYearDatePeriod,
  namedDatePeriod,
  openBoundaryCandidate,
  parseTrailingCount,
  periodBoundaryCandidate,
  periodDay,
  periodEndDay,
  periodRange,
  periodsFromPhrases,
  periodStartDay,
  periodToDateRange,
  quarterOfRelativeYear,
  relativePeriod,
  relativeWeekday,
  relativeWeekend,
  remainingPeriodRange,
  renderPeriodRange,
  compileCountAliasNormalizer,
  decomposeShiftedPeriodRange,
  shiftPeriod,
  textAt,
  trailingPeriod,
  trailingRange,
  untilNowRange,
  validYear,
} from "./shared.ts";
import type { Period } from "./shared.ts";

const months = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

const weekdays = [
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
  "domingo",
] as const;
const nextWeekdays = weekdays.flatMap((weekday, day) => [
  { phrase: `próximo ${weekday}`, day, canonical: `el próximo ${weekday}` },
  { phrase: `el próximo ${weekday}`, day, canonical: `el próximo ${weekday}` },
  { phrase: `proximo ${weekday}`, day, canonical: `el próximo ${weekday}` },
  { phrase: `el proximo ${weekday}`, day, canonical: `el próximo ${weekday}` },
]);

const spanishCountWords = [
  ["dos"],
  ["tres"],
  ["cuatro"],
  ["cinco"],
  ["seis"],
  ["siete"],
  ["ocho"],
  ["nueve"],
  ["diez"],
  ["once"],
  ["doce"],
  ["trece"],
  ["catorce"],
  ["quince"],
  ["dieciséis", "dieciseis"],
  ["diecisiete"],
  ["dieciocho"],
  ["diecinueve"],
  ["veinte"],
] as const;
const spanishCountOnes = [
  [1, "uno"],
  [2, "dos"],
  [3, "tres"],
  [4, "cuatro"],
  [5, "cinco"],
  [6, "seis"],
  [7, "siete"],
  [8, "ocho"],
  [9, "nueve"],
] as const;
const spanishCountAliases = [
  ...sequentialCountAliases(spanishCountWords, 2),
  ...compoundCountAliases(
    decimalTens([
      "veinte",
      "treinta",
      "cuarenta",
      "cincuenta",
      "sesenta",
      "setenta",
      "ochenta",
      "noventa",
    ]),
    spanishCountOnes,
    (ten, one, amount) => {
      if (amount === 21) return ["veintiuno", "veintiún", "veintiun", "veintiuna"];
      if (amount === 22) return ["veintidós", "veintidos"];
      if (amount === 23) return ["veintitrés", "veintitres"];
      if (amount === 26) return ["veintiséis", "veintiseis"];
      if (amount < 30) return [`veinti${one}`];
      const variants = one === "uno" ? [one, "un", "una"] : [one];
      return variants.map((variant) => `${ten} y ${variant}`);
    },
  ),
];
const normalizeSpanishCounts = compileCountAliasNormalizer(spanishCountAliases);
const spanishCountVocabulary = new Set(countAliasVocabulary(spanishCountAliases));
const correctSpanish = (input: string, vocabulary: ReadonlyArray<string>) =>
  correctWhitespaceSeparatedText(input, vocabulary, spanishCountVocabulary);
const normalizeSpanish = (input: string, locale: string) =>
  normalizeSpanishCounts(normalizeNaturalText(input, locale));

const monthAbbreviations = [
  ["ene"],
  ["feb"],
  ["mar"],
  ["abr"],
  ["may"],
  ["jun"],
  ["jul"],
  ["ago"],
  ["sep", "sept", "set", "setiembre"],
  ["oct"],
  ["nov"],
  ["dic"],
] as const;

interface UnitForms {
  readonly unit: Unit;
  readonly singular: string;
  readonly plural: string;
  readonly gender: "masculine" | "feminine";
  readonly current: string;
  readonly previous: string;
  readonly next: string;
  readonly toDate: string;
  readonly remaining: string;
}

const units: ReadonlyArray<UnitForms> = [
  {
    unit: "day",
    singular: "día",
    plural: "días",
    gender: "masculine",
    current: "hoy",
    previous: "ayer",
    next: "mañana",
    toDate: "día hasta la fecha",
    remaining: "resto del día",
  },
  {
    unit: "week",
    singular: "semana",
    plural: "semanas",
    gender: "feminine",
    current: "esta semana",
    previous: "la semana pasada",
    next: "la próxima semana",
    toDate: "semana hasta la fecha",
    remaining: "resto de la semana",
  },
  {
    unit: "month",
    singular: "mes",
    plural: "meses",
    gender: "masculine",
    current: "este mes",
    previous: "el mes pasado",
    next: "el próximo mes",
    toDate: "mes hasta la fecha",
    remaining: "resto del mes",
  },
  {
    unit: "quarter",
    singular: "trimestre",
    plural: "trimestres",
    gender: "masculine",
    current: "este trimestre",
    previous: "el trimestre pasado",
    next: "el próximo trimestre",
    toDate: "trimestre hasta la fecha",
    remaining: "resto del trimestre",
  },
  {
    unit: "year",
    singular: "año",
    plural: "años",
    gender: "masculine",
    current: "este año",
    previous: "el año pasado",
    next: "el próximo año",
    toDate: "año hasta la fecha",
    remaining: "resto del año",
  },
];

const gendered = (entry: UnitForms, masculine: string, feminine: string) =>
  entry.gender === "feminine" ? feminine : masculine;

const definiteArticle = (entry: UnitForms, plural = false) =>
  gendered(entry, plural ? "los" : "el", plural ? "las" : "la");

const indefiniteArticle = (entry: UnitForms) => gendered(entry, "un", "una");

const withDe = (period: string) =>
  period.startsWith("el ") ? `del ${period.slice(3)}` : `de ${period}`;

const afterDe = (period: string) => {
  if (period.startsWith("del ")) return `el ${period.slice(4)}`;
  return period.startsWith("de ") ? period.slice(3) : period;
};

const rollingAdjective = (entry: UnitForms, future: boolean, plural: boolean) => {
  if (future)
    return gendered(entry, plural ? "próximos" : "próximo", plural ? "próximas" : "próxima");
  return gendered(entry, plural ? "últimos" : "último", plural ? "últimas" : "última");
};

const unitAliases = [
  ["día", "day", false],
  ["dia", "day", false],
  ["días", "day", true],
  ["dias", "day", true],
  ["semana", "week", false],
  ["semanas", "week", true],
  ["mes", "month", false],
  ["meses", "month", true],
  ["trimestre", "quarter", false],
  ["trimestres", "quarter", true],
  ["año", "year", false],
  ["ano", "year", false],
  ["años", "year", true],
  ["anos", "year", true],
] as const satisfies ReadonlyArray<readonly [string, Unit, boolean]>;

const periodAliases = [
  ...units.flatMap((entry) => [
    [entry.current, entry.unit, 0, entry.current] as const,
    [entry.previous, entry.unit, -1, entry.previous] as const,
    [entry.next, entry.unit, 1, entry.next] as const,
  ]),
  ...units
    .filter((entry) => entry.unit !== "day")
    .flatMap((entry) => [
      [`${entry.singular} actual`, entry.unit, 0, entry.current] as const,
      [
        `${definiteArticle(entry)} ${entry.singular} anterior`,
        entry.unit,
        -1,
        entry.previous,
      ] as const,
      [`${entry.singular} anterior`, entry.unit, -1, entry.previous] as const,
      [`${definiteArticle(entry)} ${entry.singular} siguiente`, entry.unit, 1, entry.next] as const,
      [`${entry.singular} siguiente`, entry.unit, 1, entry.next] as const,
      [
        `${rollingAdjective(entry, true, false)} ${entry.singular}`,
        entry.unit,
        1,
        entry.next,
      ] as const,
    ]),
  ["semana pasada", "week", -1, "la semana pasada"],
  ["semana que viene", "week", 1, "la próxima semana"],
  ["la semana que viene", "week", 1, "la próxima semana"],
  ["proxima semana", "week", 1, "la próxima semana"],
  ["el pasado mes", "month", -1, "el mes pasado"],
  ["mes pasado", "month", -1, "el mes pasado"],
  ["mes que viene", "month", 1, "el próximo mes"],
  ["el mes que viene", "month", 1, "el próximo mes"],
  ["el proximo mes", "month", 1, "el próximo mes"],
  ["año pasado", "year", -1, "el año pasado"],
  ["ano pasado", "year", -1, "el año pasado"],
  ["año que viene", "year", 1, "el próximo año"],
  ["el año que viene", "year", 1, "el próximo año"],
  ["el proximo año", "year", 1, "el próximo año"],
  ["este ano", "year", 0, "este año"],
  ["trimestre pasado", "quarter", -1, "el trimestre pasado"],
  ["proximo trimestre", "quarter", 1, "el próximo trimestre"],
  ["anteayer", "day", -2, "anteayer"],
  ["día antes de ayer", "day", -2, "anteayer"],
  ["el día antes de ayer", "day", -2, "anteayer"],
  ["pasado mañana", "day", 2, "pasado mañana"],
  ["día después de mañana", "day", 2, "pasado mañana"],
  ["el día después de mañana", "day", 2, "pasado mañana"],
  ["la semana anterior a la pasada", "week", -2, "la semana anterior a la pasada"],
  ["la semana después de la próxima", "week", 2, "la semana después de la próxima"],
  ["el mes anterior al pasado", "month", -2, "el mes anterior al pasado"],
  ["el mes después del próximo", "month", 2, "el mes después del próximo"],
  ["el trimestre anterior al pasado", "quarter", -2, "el trimestre anterior al pasado"],
  ["el trimestre después del próximo", "quarter", 2, "el trimestre después del próximo"],
  ["el año anterior al pasado", "year", -2, "el año anterior al pasado"],
  ["el año después del próximo", "year", 2, "el año después del próximo"],
] as const satisfies ReadonlyArray<readonly [string, Unit, number, string]>;

const toDatePhrases = units.flatMap((entry) => {
  const noun = entry.singular;
  return [
    entry.toDate,
    `en lo que va del ${noun}`,
    `desde el inicio del ${noun}`,
    `desde el comienzo del ${noun}`,
    `desde principios del ${noun}`,
    `${entry.current} hasta ahora`,
  ].map((phrase) => ({ entry, phrase }));
});

const remainingPhrases = units.flatMap((entry) =>
  [entry.remaining, `lo que queda del ${entry.singular}`].map((phrase) => ({ entry, phrase })),
);

const relativeYearDirection = (value: string) => {
  if (value.includes("pasado")) return -1;
  if (value.includes("ximo")) return 1;
  return 0;
};

const relativeYearName = (direction: number) => {
  if (direction < 0) return "año pasado";
  if (direction > 0) return "próximo año";
  return "este año";
};

const monthNumber = (value: string) => {
  const normalized = value.endsWith(".") ? value.slice(0, -1) : value;
  const full = months.findIndex((month) => month === normalized);
  if (full !== -1) return full + 1;
  const short = monthAbbreviations.findIndex((aliases) =>
    aliases.some((alias) => alias === normalized),
  );
  return short === -1 ? undefined : short + 1;
};

const currentDateLabel = (day: number, month: number) => `${day} de ${textAt(months, month - 1)}`;

const parseNamedDate = (input: string) => {
  const named = EffectString.match(
    /^(?:el (?:día )?)?([0-3]?\d)(?: de)? ([a-záéíóúñ]+\.?)(?:(?: de| del)? (\d{4}))$/u,
  )(input);
  if (Option.isSome(named)) {
    return namedDatePeriod(
      textAt(named.value, 3),
      textAt(named.value, 2),
      textAt(named.value, 1),
      monthNumber,
      (day, month, year) => `${day} de ${textAt(months, month - 1)} de ${year}`,
    );
  }
  const numeric = EffectString.match(/^([0-3]?\d)[./-]([01]?\d)[./-](\d{4})$/u)(input);
  if (Option.isSome(numeric)) {
    const year = validYear(textAt(numeric.value, 3));
    const month = Number(textAt(numeric.value, 2));
    const day = Number(textAt(numeric.value, 1));
    if (year !== undefined && month >= 1 && month <= 12) {
      const value = isoDate(year, month, day);
      if (isIsoDate(value) && value !== "9999-12-31") {
        return Option.some(
          fixedDatePeriod(value, `${day} de ${textAt(months, month - 1)} de ${year}`),
        );
      }
    }
  }

  const current = EffectString.match(/^(?:el (?:día )?)?([0-3]?\d)(?: de)? ([a-záéíóúñ]+\.?)$/u)(
    input,
  );
  if (Option.isSome(current)) {
    return namedCurrentYearDatePeriod(
      textAt(current.value, 2),
      textAt(current.value, 1),
      monthNumber,
      currentDateLabel,
    );
  }

  const relative = EffectString.match(/^(?:el (?:día )?)?([0-3]?\d) (de .+|del .+)$/u)(input);
  if (Option.isNone(relative)) return Option.none<Period>();
  const periodText = afterDe(textAt(relative.value, 2));
  const alias = periodAliases.find((entry) => entry[0] === periodText && entry[1] === "month");
  if (alias === undefined) return Option.none<Period>();
  const day = Number(textAt(relative.value, 1));
  const month = relativePeriod(alias[1], alias[2], alias[3]);
  return periodDay(month, day, `${day} ${withDe(alias[3])}`);
};

const quarterNumber = (value: string) => {
  if ((value.startsWith("q") || value.startsWith("t")) && value.length === 2) {
    return Number(value.slice(1));
  }
  if (value === "primer" || value === "primero") return 1;
  if (value === "segundo") return 2;
  if (value === "tercer" || value === "tercero") return 3;
  return value === "cuarto" ? 4 : undefined;
};

const parseQuarter = (input: string) => {
  const fixed = EffectString.match(
    /^(t[1-4]|q[1-4]|primer|primero|segundo|tercer|tercero|cuarto)(?: trimestre)?(?: de)? (\d{4})$/u,
  )(input);
  if (Option.isSome(fixed)) {
    const quarter = quarterNumber(textAt(fixed.value, 1));
    const year = validYear(textAt(fixed.value, 2));
    if (quarter !== undefined && year !== undefined) {
      return Option.some(fixedQuarterPeriod(year, quarter, `T${quarter} ${year}`));
    }
  }
  const relative = EffectString.match(
    /^(t[1-4]|q[1-4]) (?:del (año pasado|ano pasado|próximo año|proximo año)|de (este año|este ano))$/u,
  )(input);
  if (Option.isSome(relative)) {
    const quarter = quarterNumber(textAt(relative.value, 1));
    const yearText = textAt(relative.value, 2) || textAt(relative.value, 3);
    const direction = relativeYearDirection(yearText);
    if (quarter !== undefined) {
      return Option.some(
        quarterOfRelativeYear(quarter, direction, `T${quarter} del ${relativeYearName(direction)}`),
      );
    }
  }
  const standalone = EffectString.match(/^(?:el )?(t[1-4]|q[1-4])$/u)(input);
  if (Option.isNone(standalone)) return Option.none<Period>();
  const quarter = quarterNumber(textAt(standalone.value, 1));
  return quarter === undefined
    ? Option.none<Period>()
    : Option.some(quarterOfRelativeYear(quarter, 0, `T${quarter}`));
};

const parseDatedPeriod = (input: string) => {
  const knownPeriod = Option.firstSomeOf([
    absoluteDatePeriod(input, "es"),
    parseNamedDate(input),
    parseQuarter(input),
  ]);
  if (Option.isSome(knownPeriod)) return knownPeriod;

  const yearMatch = EffectString.match(/^(?:(?:el )?año )?(\d{4})$/u)(input);
  if (Option.isSome(yearMatch)) {
    const year = validYear(textAt(yearMatch.value, 1));
    if (year !== undefined) return Option.some(fixedYearPeriod(year, String(year)));
  }

  const monthYear = EffectString.match(/^([a-záéíóúñ]+\.?)(?: de)? (\d{4})$/u)(input);
  if (Option.isSome(monthYear)) {
    const month = monthNumber(textAt(monthYear.value, 1));
    const year = validYear(textAt(monthYear.value, 2));
    if (month !== undefined && year !== undefined) {
      return Option.some(fixedMonthPeriod(year, month, `${textAt(months, month - 1)} de ${year}`));
    }
  }

  return Option.none<Period>();
};

const parseBasePeriod = (input: string) => {
  const datedPeriod = parseDatedPeriod(input);
  if (Option.isSome(datedPeriod)) return datedPeriod;

  const prefixedRelativeMonth = EffectString.match(
    /^(pasado|próximo|proximo|este) ([a-záéíóúñ]+\.?)$/u,
  )(input);
  const suffixedRelativeMonth = EffectString.match(/^([a-záéíóúñ]+\.?) (pasado|próximo|proximo)$/u)(
    input,
  );
  const shortRelativeMonth = Option.firstSomeOf([prefixedRelativeMonth, suffixedRelativeMonth]);
  if (Option.isSome(shortRelativeMonth)) {
    const prefixed = Option.isSome(prefixedRelativeMonth);
    const month = monthNumber(textAt(shortRelativeMonth.value, prefixed ? 2 : 1));
    if (month !== undefined) {
      const modifier = textAt(shortRelativeMonth.value, prefixed ? 1 : 2);
      const direction = relativeYearDirection(modifier);
      let canonicalModifier = "este";
      if (direction < 0) canonicalModifier = "pasado";
      if (direction > 0) canonicalModifier = "próximo";
      return Option.some(
        monthOfRelativeYear(month, direction, `${canonicalModifier} ${textAt(months, month - 1)}`),
      );
    }
  }

  const relativeMonth = EffectString.match(
    /^([a-záéíóúñ]+\.?) (del año pasado|del ano pasado|del próximo año|del proximo año|de este año|de este ano)$/u,
  )(input);
  if (Option.isSome(relativeMonth)) {
    const month = monthNumber(textAt(relativeMonth.value, 1));
    const yearText = textAt(relativeMonth.value, 2);
    const direction = relativeYearDirection(yearText);
    if (month !== undefined) {
      const canonicalYear = relativeYearName(direction);
      return Option.some(
        monthOfRelativeYear(month, direction, `${textAt(months, month - 1)} del ${canonicalYear}`),
      );
    }
  }

  const standaloneMonth = monthNumber(input);
  if (standaloneMonth !== undefined) {
    return Option.some(
      monthOfRelativeYear(standaloneMonth, 0, textAt(months, standaloneMonth - 1)),
    );
  }

  const alias = periodAliases.find((entry) => entry[0] === input);
  if (alias !== undefined) return Option.some(relativePeriod(alias[1], alias[2], alias[3]));

  if (["fin de semana", "el fin de semana", "este fin de semana"].includes(input)) {
    return Option.some(relativeWeekend(0, "este fin de semana"));
  }
  if (["el fin de semana pasado", "fin de semana pasado"].includes(input)) {
    return Option.some(relativeWeekend(-1, "el fin de semana pasado"));
  }
  if (["el próximo fin de semana", "el proximo fin de semana"].includes(input)) {
    return Option.some(relativeWeekend(1, "el próximo fin de semana"));
  }
  if (input === "el fin de semana anterior al pasado") {
    return Option.some(relativeWeekend(-2, input));
  }
  if (input === "el fin de semana después del próximo") {
    return Option.some(relativeWeekend(2, input));
  }

  const weekday = nextWeekdays.find((entry) => entry.phrase === input);
  return weekday === undefined
    ? Option.none<Period>()
    : Option.some(relativeWeekday(weekday.day, 1, weekday.canonical));
};

// RETURN TYPE: Recursive period offsets require an explicit result type.
const parsePeriod = (input: string): Option.Option<Period> => {
  const shifted = EffectString.match(
    /^(.+) (hace|dentro de|en) ([1-9]\d*) (día|dia|días|dias|semana|semanas|mes|meses|trimestre|trimestres|año|años|ano|anos)$/u,
  )(input);
  if (Option.isSome(shifted)) {
    const amount = parseTrailingCount(textAt(shifted.value, 3));
    const alias = unitAliases.find((unit) => unit[0] === textAt(shifted.value, 4));
    const entry = alias === undefined ? undefined : units.find((unit) => unit.unit === alias[1]);
    const period = parsePeriod(textAt(shifted.value, 1));
    if (Option.isSome(amount) && entry !== undefined && Option.isSome(period)) {
      const past = textAt(shifted.value, 2) === "hace";
      const direction = past ? -amount.value : amount.value;
      const noun = amount.value === 1 ? entry.singular : entry.plural;
      const canonical = `${period.value.canonical} ${past ? "hace" : "dentro de"} ${amount.value} ${noun}`;
      return Option.some(shiftPeriod(period.value, direction, entry.unit, canonical));
    }
  }

  const edge = EffectString.match(
    /^(?:el )?(inicio|comienzo|principio|fin|final)(?: de| del) (.+)$/u,
  )(input);
  if (Option.isSome(edge)) {
    const edgeName = textAt(edge.value, 1);
    const periodText = textAt(edge.value, 2);
    const basePeriod = parseBasePeriod(periodText);
    const implicit = units.find((entry) => entry.singular === periodText);
    const period =
      Option.isSome(basePeriod) || implicit === undefined
        ? basePeriod
        : Option.some(relativePeriod(implicit.unit, 0, implicit.current));
    if (Option.isSome(period)) {
      const isEnd = edgeName === "fin" || edgeName === "final";
      const canonical = `${isEnd ? "final" : "inicio"} ${withDe(period.value.canonical)}`;
      return Option.some(
        isEnd ? periodEndDay(period.value, canonical) : periodStartDay(period.value, canonical),
      );
    }
  }
  const wrapper = ["durante ", "en ", "todo ", "todo el ", "toda la "].find((prefix) =>
    input.startsWith(prefix),
  );
  const base = parseBasePeriod(wrapper === undefined ? input : input.slice(wrapper.length));
  return Option.isSome(base) ? base : parseCalendarOffset(input);
};

const countedUnit = (value: string, amount: number) => {
  const alias = unitAliases.find((entry) => entry[0] === value && entry[2] === (amount !== 1));
  return alias === undefined ? undefined : units.find((entry) => entry.unit === alias[1]);
};

const writtenAmount = (value: string) =>
  value === "un" || value === "una" ? Option.some(1) : parseTrailingCount(value);

const agreesWithArticle = (entry: UnitForms, article: string, plural = false) =>
  article.length === 0 || article === definiteArticle(entry, plural);

const agreesWithIndefiniteArticle = (entry: UnitForms, article: string) =>
  article === indefiniteArticle(entry);

const withoutAcute = (value: string) => value.normalize("NFD").replaceAll("\u0301", "");

const agreesWithRollingModifier = (entry: UnitForms, modifier: string, future: boolean) => {
  if (modifier === "anteriores" || modifier === "siguientes") return true;
  if (!future && modifier === gendered(entry, "pasados", "pasadas")) return true;
  const expected = rollingAdjective(entry, future, true);
  return modifier === expected || modifier === withoutAcute(expected);
};

const agreesWithSingularModifier = (
  entry: UnitForms | undefined,
  modifier: string,
  future: boolean,
) => {
  if (entry === undefined) return false;
  if (future && modifier === "siguiente") return true;
  const expected = rollingAdjective(entry, future, false);
  return modifier === expected || modifier === withoutAcute(expected);
};

const parseCalendarOffset = (input: string) => {
  const match = EffectString.match(/^(hace|dentro de|en) ([1-9]\d*|un|una) ([^ ]+)$/u)(input);
  if (Option.isNone(match)) return Option.none<Period>();
  const amount = writtenAmount(textAt(match.value, 2));
  if (Option.isNone(amount)) return Option.none<Period>();
  const entry = countedUnit(textAt(match.value, 3), amount.value);
  const amountText = textAt(match.value, 2);
  if (
    entry === undefined ||
    ((amountText === "un" || amountText === "una") &&
      !agreesWithIndefiniteArticle(entry, amountText))
  ) {
    return Option.none<Period>();
  }
  const isPast = textAt(match.value, 1) === "hace";
  const quantity = amount.value === 1 ? indefiniteArticle(entry) : String(amount.value);
  const noun = amount.value === 1 ? entry.singular : entry.plural;
  const canonical = `${isPast ? "hace" : "dentro de"} ${quantity} ${noun}`;
  const direction = isPast ? -amount.value : amount.value;
  return Option.some(relativePeriod(entry.unit, direction, canonical));
};

const rollingCanonical = (entry: UnitForms, amount: number, future: boolean) => {
  if (amount > 1) {
    return `${rollingAdjective(entry, future, true)} ${amount} ${entry.plural}`;
  }
  const article = indefiniteArticle(entry);
  return future
    ? `desde ahora durante ${article} ${entry.singular}`
    : `desde hace ${article} ${entry.singular}`;
};

const rollingCandidate = (entry: UnitForms, amount: number, future: boolean) =>
  candidate(
    future ? futureRange(amount, entry.unit) : trailingRange(amount, entry.unit),
    rollingCanonical(entry, amount, future),
  );

const parseRollingSince = (input: string) => {
  const since = EffectString.match(/^desde hace ([1-9]\d*|un|una) ([^ ]+)$/u)(input);
  if (Option.isSome(since)) {
    const amount = writtenAmount(textAt(since.value, 1));
    if (Option.isSome(amount)) {
      const entry = countedUnit(textAt(since.value, 2), amount.value);
      const amountText = textAt(since.value, 1);
      if (
        entry !== undefined &&
        ((amountText !== "un" && amountText !== "una") ||
          agreesWithIndefiniteArticle(entry, amountText))
      ) {
        return Option.some(rollingCandidate(entry, amount.value, false));
      }
    }
  }

  return Option.none<ReturnType<typeof candidate>>();
};

const parseSingularRolling = (input: string) => {
  const futureSingular = EffectString.match(/^desde ahora durante (un|una) ([^ ]+)$/u)(input);
  if (Option.isSome(futureSingular)) {
    const entry = countedUnit(textAt(futureSingular.value, 2), 1);
    if (
      entry !== undefined &&
      agreesWithIndefiniteArticle(entry, textAt(futureSingular.value, 1))
    ) {
      return Option.some(rollingCandidate(entry, 1, true));
    }
  }

  const lastSingular = EffectString.match(
    /^(?:(?:durante|en) )?(?:este )?(?:(el|la) )?([uú]ltim[oa]) ([^ ]+)$/u,
  )(input);
  if (Option.isSome(lastSingular)) {
    const entry = countedUnit(textAt(lastSingular.value, 3), 1);
    const modifier = textAt(lastSingular.value, 2);
    if (
      entry !== undefined &&
      agreesWithArticle(entry, textAt(lastSingular.value, 1)) &&
      agreesWithSingularModifier(entry, modifier, false)
    ) {
      return Option.some(rollingCandidate(entry, 1, false));
    }
  }

  const nextSingular = EffectString.match(/^durante (el|la) (pr[oó]xim[oa]|siguiente) ([^ ]+)$/u)(
    input,
  );
  if (Option.isSome(nextSingular)) {
    const entry = countedUnit(textAt(nextSingular.value, 3), 1);
    const modifier = textAt(nextSingular.value, 2);
    if (
      entry !== undefined &&
      agreesWithArticle(entry, textAt(nextSingular.value, 1)) &&
      agreesWithSingularModifier(entry, modifier, true)
    ) {
      return Option.some(rollingCandidate(entry, 1, true));
    }
  }

  return Option.none<ReturnType<typeof candidate>>();
};

const parseCountedRolling = (input: string) => {
  const counted = EffectString.match(
    /^(?:(?:durante|en) )?(?:(los|las) )?([uú]ltim(?:os|as)|pasad(?:os|as)|anteriores|pr[oó]xim(?:os|as)|siguientes) ([1-9]\d*) ([^ ]+)$/u,
  )(input);
  if (Option.isSome(counted)) {
    const amount = parseTrailingCount(textAt(counted.value, 3));
    if (Option.isSome(amount) && amount.value > 1) {
      const entry = countedUnit(textAt(counted.value, 4), amount.value);
      const modifier = textAt(counted.value, 2);
      const future = modifier.includes("xim") || modifier === "siguientes";
      if (
        entry !== undefined &&
        agreesWithArticle(entry, textAt(counted.value, 1), true) &&
        agreesWithRollingModifier(entry, modifier, future)
      ) {
        return Option.some(rollingCandidate(entry, amount.value, future));
      }
    }
  }

  const bare = EffectString.match(/^([1-9]\d*) ([^ ]+)$/u)(input);
  if (Option.isNone(bare)) return Option.none<ReturnType<typeof candidate>>();
  const amount = parseTrailingCount(textAt(bare.value, 1));
  if (Option.isNone(amount)) return Option.none<ReturnType<typeof candidate>>();
  const entry = countedUnit(textAt(bare.value, 2), amount.value);
  return entry === undefined
    ? Option.none<ReturnType<typeof candidate>>()
    : Option.some(rollingCandidate(entry, amount.value, false));
};

const parseRollingPeriod = (input: string) =>
  Option.firstSomeOf([
    parseRollingSince(input),
    parseSingularRolling(input),
    parseCountedRolling(input),
  ]);

const parseElidedDateRange = (input: string) => {
  const joined = EffectString.match(
    /^(?:(?:del|desde(?: el)?) ([0-3]?\d) (?:al|hasta(?: el)?)|entre(?: el)? ([0-3]?\d) y(?: el)?) ([0-3]?\d) (.+)$/u,
  )(input);
  const dashed = EffectString.match(/^([0-3]?\d)[–—-]([0-3]?\d) (.+)$/u)(input);
  const match = Option.firstSomeOf([joined, dashed]);
  if (Option.isNone(match)) return Option.none<ReturnType<typeof candidate>>();
  const isJoined = Option.isSome(joined);
  const lowerDay = textAt(match.value, 1) || textAt(match.value, 2);
  const upperDay = textAt(match.value, isJoined ? 3 : 2);
  const period = afterDe(textAt(match.value, isJoined ? 4 : 3));
  return joinedPeriodCandidate(
    `desde ${lowerDay} ${withDe(period)} hasta ${upperDay} ${withDe(period)}`,
    [["desde ", " hasta "]],
    parsePeriod,
    (lower, upper) => `desde ${lower} hasta ${upper}`,
  );
};

const inclusiveBoundaryCandidate = (input: string) => {
  const match = EffectString.match(/^hasta (.+) inclusive$/u)(input);
  if (Option.isNone(match)) return Option.none<ReturnType<typeof candidate>>();
  const period = parsePeriod(textAt(match.value, 1));
  return period.pipe(
    Option.map((value) =>
      periodBoundaryCandidate(value, "through", `hasta ${value.canonical} inclusive`),
    ),
  );
};

const boundaryCandidate = (input: string) =>
  openBoundaryCandidate(
    input,
    [
      ["hasta antes de ", "before"],
      ["hasta el inicio de ", "before"],
      ["hasta e incluyendo ", "through"],
      ["hasta inclusive ", "through"],
      ["a partir de ", "since"],
      ["desde ", "since"],
      ["antes de ", "before"],
      ["hasta ", "through"],
      ["después de ", "after"],
      ["despues de ", "after"],
    ],
    parsePeriod,
  );

const parseSpanish = (input: string) => {
  const remaining = remainingPhrases.find((entry) => entry.phrase === input);
  if (remaining !== undefined) {
    return Option.some(
      candidate(remainingPeriodRange(remaining.entry.unit), remaining.entry.remaining),
    );
  }
  if (["hasta hoy", "hasta ahora"].includes(input)) {
    return Option.some(candidate(untilNowRange(), "hasta ahora"));
  }
  if (["desde ahora", "a partir de ahora", "de ahora en adelante"].includes(input)) {
    return Option.some(candidate(fromNowRange(), "desde ahora"));
  }
  const rolling = parseRollingPeriod(input);
  if (Option.isSome(rolling)) return rolling;
  const toDate = toDatePhrases.find((entry) => entry.phrase === input);
  if (toDate !== undefined) {
    return Option.some(candidate(periodToDateRange(toDate.entry.unit), toDate.entry.toDate));
  }

  const elided = parseElidedDateRange(input);
  if (Option.isSome(elided)) return elided;

  const nowBounded = joinedNowCandidate(
    input,
    [
      ["desde ", " hasta ahora"],
      ["desde ", " hasta hoy"],
      ["entre ", " y hoy"],
    ],
    ["desde ahora hasta ", "desde hoy hasta ", "entre hoy y ", "entre hoy y el ", "ahora hasta "],
    parsePeriod,
    (period) => `desde ${period} hasta ahora`,
    (period) => `desde ahora hasta ${period}`,
  );
  if (Option.isSome(nowBounded)) return nowBounded;

  const bounded = joinedPeriodCandidate(
    input,
    [
      ["desde el ", " hasta el "],
      ["desde ", " hasta "],
      ["del ", " al "],
      ["de ", " a "],
      ["entre el ", " y el "],
      ["entre ", " y "],
      ["", " - "],
      ["", " – "],
      ["", " — "],
      ["", " hasta "],
    ],
    parsePeriod,
    (lower, upper) => `desde ${lower} hasta ${upper}`,
  );
  if (Option.isSome(bounded)) return bounded;
  const inclusive = inclusiveBoundaryCandidate(input);
  if (Option.isSome(inclusive)) return inclusive;
  const boundary = boundaryCandidate(input);
  if (Option.isSome(boundary)) return boundary;
  return parsePeriod(input).pipe(
    Option.map((period) => candidate(periodRange(period), period.canonical)),
  );
};

const weekendPhrases = [
  "este fin de semana",
  "el fin de semana pasado",
  "el próximo fin de semana",
  "el fin de semana anterior al pasado",
  "el fin de semana después del próximo",
];

const edgePeriodPhrases = [
  ...units
    .filter((entry) => entry.unit !== "day")
    .flatMap((entry) => [entry.current, entry.previous, entry.next]),
  ...weekendPhrases,
  ...months,
].flatMap((period) => [`inicio ${withDe(period)}`, `final ${withDe(period)}`]);

const staticPeriodPhrases = [
  ...periodAliases.map((entry) => entry[0]),
  ...weekendPhrases,
  ...edgePeriodPhrases,
  ...[1, 2, 3, 4].flatMap((quarter) => [
    `t${quarter}`,
    `t${quarter} de este año`,
    `t${quarter} del año pasado`,
    `t${quarter} del próximo año`,
  ]),
  ...months.flatMap((month) => [
    month,
    `pasado ${month}`,
    `próximo ${month}`,
    `${month} pasado`,
    `${month} próximo`,
    `${month} del año pasado`,
    `${month} del próximo año`,
  ]),
  ...nextWeekdays.map((entry) => entry.phrase),
];

const staticPeriods = periodsFromPhrases(staticPeriodPhrases, parsePeriod);
const boundaryPrefixes = ["desde ", "a partir de ", "antes de ", "hasta ", "después de "];

const countedSuggestions = (input: string) => {
  const amount = naturalCount(input);
  if (amount === undefined) return [];
  return units.flatMap((entry) => {
    const noun = amount === 1 ? entry.singular : entry.plural;
    if (amount === 1) {
      const article = indefiniteArticle(entry);
      return [
        `${amount} ${noun}`,
        `${rollingAdjective(entry, false, false)} ${noun}`,
        `desde hace ${article} ${noun}`,
        `desde ahora durante ${article} ${noun}`,
        `hace ${article} ${noun}`,
        `dentro de ${article} ${noun}`,
      ];
    }
    return [
      `${rollingAdjective(entry, false, true)} ${amount} ${noun}`,
      `${amount} ${noun}`,
      `${rollingAdjective(entry, true, true)} ${amount} ${noun}`,
      `hace ${amount} ${noun}`,
      `dentro de ${amount} ${noun}`,
    ];
  });
};

const spanishSuggestionPhrases = [
  ...units.map((entry) => entry.toDate),
  ...units.map((entry) => entry.remaining),
  ...units.flatMap((entry) => [
    `${rollingAdjective(entry, false, false)} ${entry.singular}`,
    `desde hace ${indefiniteArticle(entry)} ${entry.singular}`,
    `desde ahora durante ${indefiniteArticle(entry)} ${entry.singular}`,
    `durante ${definiteArticle(entry)} ${rollingAdjective(entry, true, false)} ${entry.singular}`,
  ]),
  ...staticPeriodPhrases,
  ...prefixNaturalPhrases(staticPeriodPhrases, boundaryPrefixes),
  "hasta ahora",
  "desde ahora",
];

const suggestSpanish = (input: string, limit: number) => {
  const fixed = fixedCalendarPeriodPhrases(input, months);
  return completeNaturalPhrases(
    input,
    [
      ...spanishSuggestionPhrases,
      ...fixed,
      ...prefixNaturalPhrases(fixed, boundaryPrefixes),
      ...countedSuggestions(input),
    ],
    limit,
  );
};

// RETURN TYPE: Recursive shifted-period rendering requires an explicit result type.
const renderSpanish = (range: DateRangeExpr): Option.Option<string> => {
  const shifted = decomposeShiftedPeriodRange(range);
  if (Option.isSome(shifted)) {
    const base = renderSpanish(shifted.value.baseRange);
    const entry = units.find((unit) => unit.unit === shifted.value.unit);
    if (Option.isSome(base) && entry !== undefined) {
      const amount = Math.abs(shifted.value.amount);
      const noun = amount === 1 ? entry.singular : entry.plural;
      const direction = shifted.value.amount < 0 ? "hace" : "dentro de";
      return Option.some(`${base.value} ${direction} ${amount} ${noun}`);
    }
  }

  const offset = calendarPeriodOffset(range);
  if (Option.isSome(offset) && Math.abs(offset.value.amount) > 1) {
    const entry = units.find((unit) => unit.unit === offset.value.unit);
    if (entry !== undefined) {
      const amount = Math.abs(offset.value.amount);
      const noun = amount === 1 ? entry.singular : entry.plural;
      return Option.some(
        offset.value.amount < 0 ? `hace ${amount} ${noun}` : `dentro de ${amount} ${noun}`,
      );
    }
  }
  const future = futurePeriod(range);
  if (Option.isSome(future)) {
    const entry = units.find((unit) => unit.unit === future.value.unit);
    if (entry !== undefined) {
      return Option.some(rollingCanonical(entry, future.value.amount, true));
    }
  }
  const trailing = trailingPeriod(range);
  if (Option.isSome(trailing)) {
    const entry = units.find((unit) => unit.unit === trailing.value.unit);
    if (entry !== undefined) {
      return Option.some(rollingCanonical(entry, trailing.value.amount, false));
    }
  }
  const periods = [
    ...staticPeriods,
    ...currentYearDatePeriods(range, currentDateLabel),
    ...periodsFromPhrases(
      [...datedPeriods(range, months), ...datedQuarterPeriods(range)],
      parsePeriod,
    ),
  ];
  return renderPeriodRange(
    range,
    [
      ...units.map((entry) => candidate(periodToDateRange(entry.unit), entry.toDate)),
      ...units.map((entry) => candidate(remainingPeriodRange(entry.unit), entry.remaining)),
    ],
    periods,
    (period) => `desde ${period}`,
    (period) => `antes de ${period}`,
    (period) => `hasta ${period}`,
    (period) => `después de ${period}`,
    (lower, upper) => `desde ${lower} hasta ${upper}`,
    (period) => `desde ${period} hasta ahora`,
    (period) => `desde ahora hasta ${period}`,
    () => "hasta ahora",
    () => "desde ahora",
  );
};

export const SpanishContribution = new BaseLanguageContribution({
  locale: "es",
  vocabulary: [
    ...months,
    ...weekdays,
    ...monthAbbreviations.flatMap((aliases) => aliases),
    ...units.flatMap((entry) => [
      entry.singular,
      entry.plural,
      ...entry.current.split(" "),
      ...entry.previous.split(" "),
      ...entry.next.split(" "),
    ]),
    ...toDatePhrases.flatMap((entry) => entry.phrase.split(" ")),
    ...remainingPhrases.flatMap((entry) => entry.phrase.split(" ")),
    "a",
    "ahora",
    "antes",
    "año",
    "comienzo",
    "de",
    "desde",
    "después",
    "durante",
    "entre",
    "fecha",
    "final",
    "fin",
    "hace",
    "hasta",
    "incluyendo",
    "inicio",
    "pasado",
    "principio",
    "próximo",
    "resto",
    "últimos",
  ],
  normalize: normalizeSpanish,
  correct: correctSpanish,
  parseExact: parseSpanish,
  suggest: suggestSpanish,
  render: renderSpanish,
});

export const SpanishLanguage = defineLanguagePlugin({
  id: "chronolizer/language-es",
  effect: (context) =>
    Effect.asVoid(context.register("chronolizer/language-es", SpanishContribution)),
});

export const SpanishLanguageLayer = languagePluginsLayer([SpanishLanguage]);
