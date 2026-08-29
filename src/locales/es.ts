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
  calendarPeriodOffset,
  candidate,
  currentYearDatePeriods,
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
  periodEndDay,
  periodRange,
  periodsFromPhrases,
  periodStartDay,
  periodToDateRange,
  quarterOfRelativeYear,
  relativePeriod,
  relativeWeekend,
  remainingPeriodRange,
  renderPeriodRange,
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
    current: "este año",
    previous: "el año pasado",
    next: "el próximo año",
    toDate: "año hasta la fecha",
    remaining: "resto del año",
  },
];

const title = (value: string) => `${value.slice(0, 1).toLocaleUpperCase("es")}${value.slice(1)}`;

const unitAliases = [
  ["día", "day"],
  ["dias", "day"],
  ["días", "day"],
  ["semana", "week"],
  ["semanas", "week"],
  ["mes", "month"],
  ["meses", "month"],
  ["trimestre", "quarter"],
  ["trimestres", "quarter"],
  ["año", "year"],
  ["ano", "year"],
  ["años", "year"],
  ["anos", "year"],
] as const satisfies ReadonlyArray<readonly [string, Unit]>;

const periodAliases = [
  ...units.flatMap((entry) => [
    [entry.current, entry.unit, 0, entry.current] as const,
    [entry.previous, entry.unit, -1, entry.previous] as const,
    [entry.next, entry.unit, 1, entry.next] as const,
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
  ["pasado mañana", "day", 2, "pasado mañana"],
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
  const named = EffectString.match(/^([0-3]?\d)(?: de)? ([a-záéíóúñ]+\.?)(?: de)? (\d{4})$/u)(
    input,
  );
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

  const current = EffectString.match(/^([0-3]?\d)(?: de)? ([a-záéíóúñ]+\.?)$/u)(input);
  return Option.isSome(current)
    ? namedCurrentYearDatePeriod(
        textAt(current.value, 2),
        textAt(current.value, 1),
        monthNumber,
        currentDateLabel,
      )
    : Option.none<Period>();
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

const parseBasePeriod = (input: string) => {
  if (isIsoDate(input) && input !== "9999-12-31") {
    return Option.some(fixedDatePeriod(input, input));
  }
  const namedDate = parseNamedDate(input);
  if (Option.isSome(namedDate)) return namedDate;
  const quarter = parseQuarter(input);
  if (Option.isSome(quarter)) return quarter;

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
      return Option.some(
        fixedMonthPeriod(year, month, `${title(textAt(months, month - 1))} de ${year}`),
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
        monthOfRelativeYear(
          month,
          direction,
          `${title(textAt(months, month - 1))} del ${canonicalYear}`,
        ),
      );
    }
  }

  const standaloneMonth = monthNumber(input);
  if (standaloneMonth !== undefined) {
    return Option.some(
      monthOfRelativeYear(standaloneMonth, 0, title(textAt(months, standaloneMonth - 1))),
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
  return Option.none<Period>();
};

const parsePeriod = (input: string) => {
  const edge = EffectString.match(
    /^(?:el )?(inicio|comienzo|principio|fin|final)(?: de| del) (.+)$/u,
  )(input);
  if (Option.isSome(edge)) {
    const edgeName = textAt(edge.value, 1);
    const period = parseBasePeriod(textAt(edge.value, 2));
    if (Option.isSome(period)) {
      const isEnd = edgeName === "fin" || edgeName === "final";
      const canonical = `${isEnd ? "final" : "inicio"} de ${period.value.canonical}`;
      return Option.some(
        isEnd ? periodEndDay(period.value, canonical) : periodStartDay(period.value, canonical),
      );
    }
  }
  const wrapper = ["durante ", "en ", "todo ", "todo el ", "toda la "].find((prefix) =>
    input.startsWith(prefix),
  );
  return parseBasePeriod(wrapper === undefined ? input : input.slice(wrapper.length));
};

const countedUnit = (value: string) => unitAliases.find((entry) => entry[0] === value)?.[1];

const parseCalendarOffset = (input: string) => {
  const past = EffectString.match(
    /^hace ([1-9]\d*) (día|días|dias|semana|semanas|mes|meses|trimestre|trimestres|año|años|ano|anos)$/u,
  )(input);
  const future = EffectString.match(
    /^(?:dentro de|en) ([1-9]\d*) (día|días|dias|semana|semanas|mes|meses|trimestre|trimestres|año|años|ano|anos)$/u,
  )(input);
  const match = Option.firstSomeOf([past, future]);
  if (Option.isNone(match)) return Option.none<ReturnType<typeof candidate>>();
  const amount = parseTrailingCount(textAt(match.value, 1));
  const unit = countedUnit(textAt(match.value, 2));
  if (Option.isNone(amount) || unit === undefined) {
    return Option.none<ReturnType<typeof candidate>>();
  }
  const entry = units.find((item) => item.unit === unit);
  if (entry === undefined) return Option.none<ReturnType<typeof candidate>>();
  const direction = Option.isSome(past) ? -amount.value : amount.value;
  const canonical =
    direction < 0
      ? `hace ${amount.value} ${amount.value === 1 ? entry.singular : entry.plural}`
      : `dentro de ${amount.value} ${amount.value === 1 ? entry.singular : entry.plural}`;
  return Option.some(candidate(periodRange(relativePeriod(unit, direction, canonical)), canonical));
};

const parseRollingPeriod = (input: string) => {
  const sinceAgo = EffectString.match(
    /^desde hace ([1-9]\d*) (día|días|dias|semana|semanas|mes|meses|trimestre|trimestres|año|años|ano|anos)$/u,
  )(input);
  const past = EffectString.match(
    /^(?:(?:los|las) )?(?:últimos|ultimos|últimas|ultimas|pasados|pasadas|anteriores) ([1-9]\d*) (día|días|dias|semana|semanas|mes|meses|trimestre|trimestres|año|años|ano|anos)$/u,
  )(input);
  const bare = EffectString.match(
    /^([1-9]\d*) (día|días|dias|semana|semanas|mes|meses|trimestre|trimestres|año|años|ano|anos)$/u,
  )(input);
  const future = EffectString.match(
    /^(?:(?:los|las) )?(?:próximos|proximos|próximas|proximas|siguientes) ([1-9]\d*) (día|días|dias|semana|semanas|mes|meses|trimestre|trimestres|año|años|ano|anos)$/u,
  )(input);
  const match = Option.firstSomeOf([sinceAgo, past, bare, future]);
  if (Option.isNone(match)) return Option.none<ReturnType<typeof candidate>>();
  const amount = parseTrailingCount(textAt(match.value, 1));
  const unit = countedUnit(textAt(match.value, 2));
  if (Option.isNone(amount) || unit === undefined) {
    return Option.none<ReturnType<typeof candidate>>();
  }
  const entry = units.find((item) => item.unit === unit);
  if (entry === undefined) return Option.none<ReturnType<typeof candidate>>();
  const isFuture = Option.isSome(future);
  const range = isFuture ? futureRange(amount.value, unit) : trailingRange(amount.value, unit);
  const direction = isFuture ? "próximos" : "últimos";
  const noun = amount.value === 1 ? entry.singular : entry.plural;
  return Option.some(candidate(range, `${direction} ${amount.value} ${noun}`));
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
  const offset = parseCalendarOffset(input);
  if (Option.isSome(offset)) return offset;
  const rolling = parseRollingPeriod(input);
  if (Option.isSome(rolling)) return rolling;
  const toDate = toDatePhrases.find((entry) => entry.phrase === input);
  if (toDate !== undefined) {
    return Option.some(candidate(periodToDateRange(toDate.entry.unit), toDate.entry.toDate));
  }

  const nowBounded = joinedNowCandidate(
    input,
    [
      ["desde ", " hasta ahora"],
      ["desde ", " hasta hoy"],
      ["entre ", " y hoy"],
    ],
    ["desde ahora hasta ", "desde hoy hasta ", "entre hoy y "],
    parsePeriod,
    (period) => `desde ${period} hasta ahora`,
    (period) => `desde ahora hasta ${period}`,
  );
  if (Option.isSome(nowBounded)) return nowBounded;

  const bounded = joinedPeriodCandidate(
    input,
    [
      ["desde ", " hasta "],
      ["de ", " a "],
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
  const boundary = boundaryCandidate(input);
  if (Option.isSome(boundary)) return boundary;
  return Option.map(parsePeriod(input), (period) =>
    candidate(periodRange(period), period.canonical),
  );
};

const staticPeriodPhrases = [
  ...periodAliases.map((entry) => entry[0]),
  "este fin de semana",
  "el fin de semana pasado",
  "el próximo fin de semana",
  "el fin de semana anterior al pasado",
  "el fin de semana después del próximo",
  ...periodAliases.flatMap((entry) => [`inicio de ${entry[0]}`, `final de ${entry[0]}`]),
  ...[1, 2, 3, 4].flatMap((quarter) => [
    `t${quarter}`,
    `t${quarter} de este año`,
    `t${quarter} del año pasado`,
    `t${quarter} del próximo año`,
  ]),
  ...months.flatMap((month) => [month, `${month} del año pasado`, `${month} del próximo año`]),
];

const staticPeriods = periodsFromPhrases(staticPeriodPhrases, parsePeriod);
const boundaryPrefixes = ["desde ", "antes de ", "hasta ", "después de "];

const countedSuggestions = (input: string) => {
  const amount = naturalCount(input);
  if (amount === undefined) return [];
  return units.flatMap((entry) => {
    const noun = amount === 1 ? entry.singular : entry.plural;
    return [
      `últimos ${amount} ${noun}`,
      `${amount} ${noun}`,
      `próximos ${amount} ${noun}`,
      `hace ${amount} ${noun}`,
      `dentro de ${amount} ${noun}`,
    ];
  });
};

const spanishSuggestionPhrases = [
  ...units.map((entry) => entry.toDate),
  ...units.map((entry) => entry.remaining),
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

const renderSpanish = (range: DateRangeExpr) => {
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
      const noun = future.value.amount === 1 ? entry.singular : entry.plural;
      return Option.some(`próximos ${future.value.amount} ${noun}`);
    }
  }
  const trailing = trailingPeriod(range);
  if (Option.isSome(trailing)) {
    const entry = units.find((unit) => unit.unit === trailing.value.unit);
    if (entry !== undefined) {
      const noun = trailing.value.amount === 1 ? entry.singular : entry.plural;
      return Option.some(`últimos ${trailing.value.amount} ${noun}`);
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
  normalize: normalizeNaturalText,
  correct: correctWhitespaceSeparatedText,
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
