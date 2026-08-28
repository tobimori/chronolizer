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
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december",
] as const;

const monthAbbreviations = [
  ["jan"],
  ["feb"],
  ["mar", "mrt"],
  ["apr"],
  [],
  ["jun"],
  ["jul"],
  ["aug"],
  ["sep", "sept"],
  ["okt"],
  ["nov"],
  ["dec"],
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
    singular: "dag",
    plural: "dagen",
    current: "vandaag",
    previous: "gisteren",
    next: "morgen",
    toDate: "dag tot nu toe",
    remaining: "rest van de dag",
  },
  {
    unit: "week",
    singular: "week",
    plural: "weken",
    current: "deze week",
    previous: "vorige week",
    next: "volgende week",
    toDate: "week tot nu toe",
    remaining: "rest van de week",
  },
  {
    unit: "month",
    singular: "maand",
    plural: "maanden",
    current: "deze maand",
    previous: "vorige maand",
    next: "volgende maand",
    toDate: "maand tot nu toe",
    remaining: "rest van de maand",
  },
  {
    unit: "quarter",
    singular: "kwartaal",
    plural: "kwartalen",
    current: "dit kwartaal",
    previous: "vorig kwartaal",
    next: "volgend kwartaal",
    toDate: "kwartaal tot nu toe",
    remaining: "rest van het kwartaal",
  },
  {
    unit: "year",
    singular: "jaar",
    plural: "jaar",
    current: "dit jaar",
    previous: "vorig jaar",
    next: "volgend jaar",
    toDate: "jaar tot nu toe",
    remaining: "rest van het jaar",
  },
];

const title = (value: string) => `${value.slice(0, 1).toLocaleUpperCase("nl")}${value.slice(1)}`;

const unitAliases = [
  ["dag", "day"],
  ["dagen", "day"],
  ["week", "week"],
  ["weken", "week"],
  ["maand", "month"],
  ["maanden", "month"],
  ["kwartaal", "quarter"],
  ["kwartalen", "quarter"],
  ["jaar", "year"],
  ["jaren", "year"],
] as const satisfies ReadonlyArray<readonly [string, Unit]>;

const periodAliases = [
  ...units.flatMap((entry) => [
    [entry.current, entry.unit, 0, entry.current] as const,
    [entry.previous, entry.unit, -1, entry.previous] as const,
    [entry.next, entry.unit, 1, entry.next] as const,
  ]),
  ["huidige week", "week", 0, "deze week"],
  ["afgelopen week", "week", -1, "vorige week"],
  ["komende week", "week", 1, "volgende week"],
  ["huidige maand", "month", 0, "deze maand"],
  ["afgelopen maand", "month", -1, "vorige maand"],
  ["aankomende maand", "month", 1, "volgende maand"],
  ["huidig kwartaal", "quarter", 0, "dit kwartaal"],
  ["afgelopen kwartaal", "quarter", -1, "vorig kwartaal"],
  ["komend kwartaal", "quarter", 1, "volgend kwartaal"],
  ["huidig jaar", "year", 0, "dit jaar"],
  ["afgelopen jaar", "year", -1, "vorig jaar"],
  ["komend jaar", "year", 1, "volgend jaar"],
  ["eergisteren", "day", -2, "eergisteren"],
  ["overmorgen", "day", 2, "overmorgen"],
  ["de week voor de vorige", "week", -2, "de week voor de vorige"],
  ["de week na de volgende", "week", 2, "de week na de volgende"],
  ["de maand voor de vorige", "month", -2, "de maand voor de vorige"],
  ["de maand na de volgende", "month", 2, "de maand na de volgende"],
  ["het kwartaal voor het vorige", "quarter", -2, "het kwartaal voor het vorige"],
  ["het kwartaal na het volgende", "quarter", 2, "het kwartaal na het volgende"],
  ["het jaar voor het vorige", "year", -2, "het jaar voor het vorige"],
  ["het jaar na het volgende", "year", 2, "het jaar na het volgende"],
] as const satisfies ReadonlyArray<readonly [string, Unit, number, string]>;

const periodArticle = {
  day: "van de dag",
  week: "van de week",
  month: "van de maand",
  quarter: "van het kwartaal",
  year: "van het jaar",
} as const satisfies Record<Unit, string>;

const toDatePhrases = units.flatMap((entry) => {
  const yearAliases =
    entry.unit === "year"
      ? ["sinds jaarbegin", "vanaf jaarbegin", "sinds het begin van dit jaar"]
      : [];
  return [
    entry.toDate,
    `sinds het begin ${periodArticle[entry.unit]}`,
    `vanaf het begin ${periodArticle[entry.unit]}`,
    `${entry.current} tot nu toe`,
    ...yearAliases,
  ].map((phrase) => ({ entry, phrase }));
});

const remainingPhrases = units.flatMap((entry) =>
  [entry.remaining, `wat over is ${periodArticle[entry.unit]}`].map((phrase) => ({
    entry,
    phrase,
  })),
);

const relativeYearDirection = (value: string) => {
  if (value.includes("vorig")) return -1;
  if (value.includes("volgend")) return 1;
  return 0;
};

const relativeYearName = (direction: number) => {
  if (direction < 0) return "vorig jaar";
  if (direction > 0) return "volgend jaar";
  return "dit jaar";
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

const dateLabel = (day: number, month: number, year: number) =>
  `${day} ${textAt(months, month - 1)} ${year}`;

const parseNamedDate = (input: string) => {
  const named = EffectString.match(
    /^(?:de )?([0-3]?\d)(?:e|ste|de)?(?: van)? ([a-z]+\.?)(?: van)? (\d{4})$/u,
  )(input);
  if (Option.isSome(named)) {
    return namedDatePeriod(
      textAt(named.value, 3),
      textAt(named.value, 2),
      textAt(named.value, 1),
      monthNumber,
      dateLabel,
    );
  }
  const numeric = EffectString.match(/^([0-3]?\d)[./-]([01]?\d)[./-](\d{4})$/u)(input);
  if (Option.isNone(numeric)) return Option.none<Period>();
  const year = validYear(textAt(numeric.value, 3));
  const month = Number(textAt(numeric.value, 2));
  const day = Number(textAt(numeric.value, 1));
  if (year === undefined || month < 1 || month > 12) return Option.none<Period>();
  const value = isoDate(year, month, day);
  return isIsoDate(value) && value !== "9999-12-31"
    ? Option.some(fixedDatePeriod(value, dateLabel(day, month, year)))
    : Option.none<Period>();
};

const quarterNumber = (value: string) => {
  if ((value.startsWith("q") || value.startsWith("k")) && value.length === 2) {
    return Number(value.slice(1));
  }
  if (value === "1e" || value === "eerste") return 1;
  if (value === "2e" || value === "tweede") return 2;
  if (value === "3e" || value === "derde") return 3;
  return value === "4e" || value === "vierde" ? 4 : undefined;
};

const parseQuarter = (input: string) => {
  const fixed = EffectString.match(
    /^(k[1-4]|q[1-4]|1e|eerste|2e|tweede|3e|derde|4e|vierde)(?: kwartaal)?(?: van)? (\d{4})$/u,
  )(input);
  if (Option.isSome(fixed)) {
    const quarter = quarterNumber(textAt(fixed.value, 1));
    const year = validYear(textAt(fixed.value, 2));
    if (quarter !== undefined && year !== undefined) {
      return Option.some(fixedQuarterPeriod(year, quarter, `K${quarter} ${year}`));
    }
  }
  const relative = EffectString.match(
    /^(?:het )?(k[1-4]|q[1-4]) (?:van )?(vorig jaar|volgend jaar|dit jaar)$/u,
  )(input);
  if (Option.isSome(relative)) {
    const quarter = quarterNumber(textAt(relative.value, 1));
    const direction = relativeYearDirection(textAt(relative.value, 2));
    if (quarter !== undefined) {
      return Option.some(
        quarterOfRelativeYear(quarter, direction, `K${quarter} ${relativeYearName(direction)}`),
      );
    }
  }
  const standalone = EffectString.match(/^(?:het )?(k[1-4]|q[1-4])$/u)(input);
  if (Option.isNone(standalone)) return Option.none<Period>();
  const quarter = quarterNumber(textAt(standalone.value, 1));
  return quarter === undefined
    ? Option.none<Period>()
    : Option.some(quarterOfRelativeYear(quarter, 0, `K${quarter}`));
};

const parseBasePeriod = (input: string) => {
  if (isIsoDate(input) && input !== "9999-12-31") {
    return Option.some(fixedDatePeriod(input, input));
  }
  const namedDate = parseNamedDate(input);
  if (Option.isSome(namedDate)) return namedDate;
  const quarter = parseQuarter(input);
  if (Option.isSome(quarter)) return quarter;

  const yearMatch = EffectString.match(/^(?:het jaar |jaar )?(\d{4})$/u)(input);
  if (Option.isSome(yearMatch)) {
    const year = validYear(textAt(yearMatch.value, 1));
    if (year !== undefined) return Option.some(fixedYearPeriod(year, String(year)));
  }

  const monthYear = EffectString.match(/^([a-z]+\.?)(?: van)? (\d{4})$/u)(input);
  if (Option.isSome(monthYear)) {
    const month = monthNumber(textAt(monthYear.value, 1));
    const year = validYear(textAt(monthYear.value, 2));
    if (month !== undefined && year !== undefined) {
      return Option.some(
        fixedMonthPeriod(year, month, `${title(textAt(months, month - 1))} ${year}`),
      );
    }
  }

  const relativeMonth = EffectString.match(
    /^([a-z]+\.?)(?: van)? (vorig jaar|volgend jaar|dit jaar)$/u,
  )(input);
  const relativeMonthYearFirst = EffectString.match(
    /^(vorig jaar|volgend jaar|dit jaar) ([a-z]+\.?)$/u,
  )(input);
  const relativeMatch = Option.firstSomeOf([relativeMonth, relativeMonthYearFirst]);
  if (Option.isSome(relativeMatch)) {
    const yearFirst = Option.isSome(relativeMonthYearFirst);
    const monthText = textAt(relativeMatch.value, yearFirst ? 2 : 1);
    const yearText = textAt(relativeMatch.value, yearFirst ? 1 : 2);
    const month = monthNumber(monthText);
    const direction = relativeYearDirection(yearText);
    if (month !== undefined) {
      return Option.some(
        monthOfRelativeYear(
          month,
          direction,
          `${title(textAt(months, month - 1))} ${relativeYearName(direction)}`,
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

  if (["weekend", "het weekend", "dit weekend"].includes(input)) {
    return Option.some(relativeWeekend(0, "dit weekend"));
  }
  if (["vorig weekend", "het vorige weekend", "afgelopen weekend"].includes(input)) {
    return Option.some(relativeWeekend(-1, "vorig weekend"));
  }
  if (["volgend weekend", "het volgende weekend", "komend weekend"].includes(input)) {
    return Option.some(relativeWeekend(1, "volgend weekend"));
  }
  if (input === "het weekend voor het vorige") {
    return Option.some(relativeWeekend(-2, input));
  }
  if (input === "het weekend na het volgende") {
    return Option.some(relativeWeekend(2, input));
  }
  return Option.none<Period>();
};

const parsePeriod = (input: string) => {
  const edge = EffectString.match(/^(?:het )?(begin|eind|einde)(?: van)? (.+)$/u)(input);
  if (Option.isSome(edge)) {
    const edgeName = textAt(edge.value, 1);
    const period = parseBasePeriod(textAt(edge.value, 2));
    if (Option.isSome(period)) {
      const isEnd = edgeName === "eind" || edgeName === "einde";
      const canonical = `${isEnd ? "eind" : "begin"} van ${period.value.canonical}`;
      return Option.some(
        isEnd ? periodEndDay(period.value, canonical) : periodStartDay(period.value, canonical),
      );
    }
  }
  const wrapper = ["gedurende ", "in ", "heel ", "de hele ", "het hele "].find((prefix) =>
    input.startsWith(prefix),
  );
  return parseBasePeriod(wrapper === undefined ? input : input.slice(wrapper.length));
};

const countedUnit = (value: string) => unitAliases.find((entry) => entry[0] === value)?.[1];

const countedUnitPattern = "dag|dagen|week|weken|maand|maanden|kwartaal|kwartalen|jaar|jaren";
const countedPattern = (source: string) =>
  new RegExp(source.replace("UNIT", countedUnitPattern), "u");
const calendarPastPattern = countedPattern("^([1-9]\\d*) (UNIT) geleden$");
const calendarFuturePatterns = [
  countedPattern("^(?:over|binnen) ([1-9]\\d*) (UNIT)$"),
  countedPattern("^([1-9]\\d*) (UNIT) later$"),
];
const rollingPastPatterns = [
  countedPattern("^(?:de )?(?:afgelopen|laatste|vorige) ([1-9]\\d*) (UNIT)$"),
  countedPattern("^([1-9]\\d*) (?:afgelopen|laatste|vorige) (UNIT)$"),
];
const rollingFuturePatterns = [
  countedPattern("^(?:de )?(?:komende|volgende|aankomende) ([1-9]\\d*) (UNIT)$"),
  countedPattern("^([1-9]\\d*) (?:komende|volgende|aankomende) (UNIT)$"),
];
const rollingSincePattern = countedPattern("^(?:sinds|gedurende) ([1-9]\\d*) (UNIT)$");
const rollingBarePattern = countedPattern("^([1-9]\\d*) (UNIT)$");

const firstPatternMatch = (input: string, patterns: ReadonlyArray<RegExp>) =>
  Option.firstSomeOf(patterns.map((pattern) => EffectString.match(pattern)(input)));

const parseCalendarOffset = (input: string) => {
  const past = EffectString.match(calendarPastPattern)(input);
  const future = firstPatternMatch(input, calendarFuturePatterns);
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
  const noun = amount.value === 1 ? entry.singular : entry.plural;
  const canonical =
    direction < 0 ? `${amount.value} ${noun} geleden` : `over ${amount.value} ${noun}`;
  return Option.some(candidate(periodRange(relativePeriod(unit, direction, canonical)), canonical));
};

const parseRollingPeriod = (input: string) => {
  const since = EffectString.match(rollingSincePattern)(input);
  const past = firstPatternMatch(input, rollingPastPatterns);
  const bare = EffectString.match(rollingBarePattern)(input);
  const future = firstPatternMatch(input, rollingFuturePatterns);
  const match = Option.firstSomeOf([since, past, bare, future]);
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
  const modifier = isFuture ? "komende" : "afgelopen";
  const noun = amount.value === 1 ? entry.singular : entry.plural;
  return Option.some(candidate(range, `de ${modifier} ${amount.value} ${noun}`));
};

const boundaryCandidate = (input: string) =>
  openBoundaryCandidate(
    input,
    [
      ["tot voor ", "before"],
      ["tot het begin van ", "before"],
      ["tot en met ", "through"],
      ["vanaf ", "since"],
      ["sinds ", "since"],
      ["voor ", "before"],
      ["tot ", "through"],
      ["na ", "after"],
    ],
    parsePeriod,
  );

const parseDutch = (input: string) => {
  const remaining = remainingPhrases.find((entry) => entry.phrase === input);
  if (remaining !== undefined) {
    return Option.some(
      candidate(remainingPeriodRange(remaining.entry.unit), remaining.entry.remaining),
    );
  }
  if (["tot vandaag", "tot nu", "tot nu toe"].includes(input)) {
    return Option.some(candidate(untilNowRange(), "tot nu toe"));
  }
  if (["vanaf nu", "sinds nu", "voortaan"].includes(input)) {
    return Option.some(candidate(fromNowRange(), "vanaf nu"));
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
      ["vanaf ", " tot nu toe"],
      ["sinds ", " tot nu toe"],
      ["tussen ", " en vandaag"],
    ],
    ["vanaf nu tot en met ", "van vandaag tot en met ", "tussen vandaag en "],
    parsePeriod,
    (period) => `vanaf ${period} tot nu toe`,
    (period) => `vanaf nu tot en met ${period}`,
  );
  if (Option.isSome(nowBounded)) return nowBounded;

  const bounded = joinedPeriodCandidate(
    input,
    [
      ["van ", " tot en met "],
      ["van ", " tot "],
      ["tussen ", " en "],
      ["", " - "],
      ["", " – "],
      ["", " — "],
      ["", " tot en met "],
      ["", " tot "],
    ],
    parsePeriod,
    (lower, upper) => `van ${lower} tot en met ${upper}`,
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
  "dit weekend",
  "vorig weekend",
  "volgend weekend",
  "het weekend voor het vorige",
  "het weekend na het volgende",
  ...periodAliases.flatMap((entry) => [`begin van ${entry[0]}`, `eind van ${entry[0]}`]),
  ...[1, 2, 3, 4].flatMap((quarter) => [
    `k${quarter}`,
    `k${quarter} dit jaar`,
    `k${quarter} vorig jaar`,
    `k${quarter} volgend jaar`,
  ]),
  ...months.flatMap((month) => [month, `${month} vorig jaar`, `${month} volgend jaar`]),
];

const staticPeriods = periodsFromPhrases(staticPeriodPhrases, parsePeriod);
const boundaryPrefixes = ["vanaf ", "sinds ", "voor ", "tot en met ", "na "];

const countedSuggestions = (input: string) => {
  const amount = naturalCount(input);
  if (amount === undefined) return [];
  return units.flatMap((entry) => {
    const noun = amount === 1 ? entry.singular : entry.plural;
    return [
      `de afgelopen ${amount} ${noun}`,
      `afgelopen ${amount} ${noun}`,
      `de laatste ${amount} ${noun}`,
      `${amount} ${noun}`,
      `de komende ${amount} ${noun}`,
      `komende ${amount} ${noun}`,
      `${amount} ${noun} geleden`,
      `over ${amount} ${noun}`,
    ];
  });
};

const dutchSuggestionPhrases = [
  ...units.map((entry) => entry.toDate),
  ...units.map((entry) => entry.remaining),
  ...staticPeriodPhrases,
  ...prefixNaturalPhrases(staticPeriodPhrases, boundaryPrefixes),
  "tot nu toe",
  "vanaf nu",
];

const suggestDutch = (input: string, limit: number) => {
  const fixed = fixedCalendarPeriodPhrases(input, months).map((phrase) =>
    phrase.startsWith("q") ? `k${phrase.slice(1)}` : phrase,
  );
  return completeNaturalPhrases(
    input,
    [
      ...dutchSuggestionPhrases,
      ...fixed,
      ...prefixNaturalPhrases(fixed, boundaryPrefixes),
      ...countedSuggestions(input),
    ],
    limit,
  );
};

const renderDutch = (range: DateRangeExpr) => {
  const offset = calendarPeriodOffset(range);
  if (Option.isSome(offset) && Math.abs(offset.value.amount) > 1) {
    const entry = units.find((unit) => unit.unit === offset.value.unit);
    if (entry !== undefined) {
      const amount = Math.abs(offset.value.amount);
      const noun = amount === 1 ? entry.singular : entry.plural;
      return Option.some(
        offset.value.amount < 0 ? `${amount} ${noun} geleden` : `over ${amount} ${noun}`,
      );
    }
  }
  const future = futurePeriod(range);
  if (Option.isSome(future)) {
    const entry = units.find((unit) => unit.unit === future.value.unit);
    if (entry !== undefined) {
      const noun = future.value.amount === 1 ? entry.singular : entry.plural;
      return Option.some(`de komende ${future.value.amount} ${noun}`);
    }
  }
  const trailing = trailingPeriod(range);
  if (Option.isSome(trailing)) {
    const entry = units.find((unit) => unit.unit === trailing.value.unit);
    if (entry !== undefined) {
      const noun = trailing.value.amount === 1 ? entry.singular : entry.plural;
      return Option.some(`de afgelopen ${trailing.value.amount} ${noun}`);
    }
  }
  const periods = [
    ...staticPeriods,
    ...periodsFromPhrases(
      [
        ...datedPeriods(range, months),
        ...datedQuarterPeriods(range).map((phrase) =>
          phrase.startsWith("Q") ? `K${phrase.slice(1)}` : phrase,
        ),
      ],
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
    (period) => `vanaf ${period}`,
    (period) => `voor ${period}`,
    (period) => `tot en met ${period}`,
    (period) => `na ${period}`,
    (lower, upper) => `van ${lower} tot en met ${upper}`,
    (period) => `vanaf ${period} tot nu toe`,
    (period) => `vanaf nu tot en met ${period}`,
    () => "tot nu toe",
    () => "vanaf nu",
  );
};

export const DutchContribution = new BaseLanguageContribution({
  locale: "nl",
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
    "afgelopen",
    "begin",
    "binnen",
    "eind",
    "geleden",
    "komende",
    "laatste",
    "na",
    "over",
    "rest",
    "sinds",
    "tussen",
    "tot",
    "vanaf",
    "volgend",
    "voor",
  ],
  normalize: normalizeNaturalText,
  correct: correctWhitespaceSeparatedText,
  parseExact: parseDutch,
  suggest: suggestDutch,
  render: renderDutch,
});

export const DutchLanguage = defineLanguagePlugin({
  id: "chronolizer/language-nl",
  effect: (context) =>
    Effect.asVoid(context.register("chronolizer/language-nl", DutchContribution)),
});

export const DutchLanguageLayer = languagePluginsLayer([DutchLanguage]);
