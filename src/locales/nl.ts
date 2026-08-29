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
  periodDay,
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

const dutchCountWords = [
  "twee",
  "drie",
  "vier",
  "vijf",
  "zes",
  "zeven",
  "acht",
  "negen",
  "tien",
  "elf",
  "twaalf",
  "dertien",
  "veertien",
  "vijftien",
  "zestien",
  "zeventien",
  "achttien",
  "negentien",
  "twintig",
] as const;
const dutchCountOnes = [
  [1, "een"],
  ...dutchCountWords.slice(0, 8).map((word, index) => [index + 2, word] as const),
] as const;
const dutchCountAliases = [
  ...sequentialCountAliases(
    dutchCountWords.map((word) => [word]),
    2,
  ),
  ...compoundCountAliases(
    decimalTens([
      "twintig",
      "dertig",
      "veertig",
      "vijftig",
      "zestig",
      "zeventig",
      "tachtig",
      "negentig",
    ]),
    dutchCountOnes,
    (ten, one) => {
      const prefix = one === "twee" || one === "drie" ? `${one}ën` : `${one}en`;
      return [`${prefix}${ten}`];
    },
  ),
];
const normalizeDutchCounts = compileCountAliasNormalizer(dutchCountAliases);
const dutchCountVocabulary = new Set(countAliasVocabulary(dutchCountAliases));
const correctDutch = (input: string, vocabulary: ReadonlyArray<string>) =>
  correctWhitespaceSeparatedText(input, vocabulary, dutchCountVocabulary);
const normalizeDutch = (input: string, locale: string) =>
  normalizeDutchCounts(normalizeNaturalText(input, locale));

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
  readonly article: "de" | "het";
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
    article: "de",
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
    article: "de",
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
    article: "de",
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
    article: "het",
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
    article: "het",
    current: "dit jaar",
    previous: "vorig jaar",
    next: "volgend jaar",
    toDate: "jaar tot nu toe",
    remaining: "rest van het jaar",
  },
];

const afterVan = (period: string) => (period.startsWith("van ") ? period.slice(4) : period);

const unitAliases = [
  ["dag", "day", "singular"],
  ["dagen", "day", "plural"],
  ["week", "week", "singular"],
  ["weken", "week", "plural"],
  ["maand", "month", "singular"],
  ["maanden", "month", "plural"],
  ["kwartaal", "quarter", "singular"],
  ["kwartalen", "quarter", "plural"],
  ["jaar", "year", "both"],
  ["jaren", "year", "plural"],
] as const satisfies ReadonlyArray<readonly [string, Unit, "singular" | "plural" | "both"]>;

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

const currentDateLabel = (day: number, month: number) => `${day} ${textAt(months, month - 1)}`;

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
  if (Option.isSome(numeric)) {
    const year = validYear(textAt(numeric.value, 3));
    const month = Number(textAt(numeric.value, 2));
    const day = Number(textAt(numeric.value, 1));
    if (year !== undefined && month >= 1 && month <= 12) {
      const value = isoDate(year, month, day);
      if (isIsoDate(value) && value !== "9999-12-31") {
        return Option.some(fixedDatePeriod(value, dateLabel(day, month, year)));
      }
    }
  }

  const current = EffectString.match(/^(?:de )?([0-3]?\d)(?:e|ste|de)?(?: van)? ([a-z]+\.?)$/u)(
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

  const relative = EffectString.match(/^(?:de )?([0-3]?\d)(?:e|ste|de)? van (.+)$/u)(input);
  if (Option.isNone(relative)) return Option.none<Period>();
  const periodText = textAt(relative.value, 2);
  const alias = periodAliases.find((entry) => entry[0] === periodText && entry[1] === "month");
  if (alias === undefined) return Option.none<Period>();
  const day = Number(textAt(relative.value, 1));
  const month = relativePeriod(alias[1], alias[2], alias[3]);
  return periodDay(month, day, `${day} van ${alias[3]}`);
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
  const absoluteDate = absoluteDatePeriod(input, "nl");
  if (Option.isSome(absoluteDate)) return absoluteDate;
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
      return Option.some(fixedMonthPeriod(year, month, `${textAt(months, month - 1)} ${year}`));
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
          `${textAt(months, month - 1)} ${relativeYearName(direction)}`,
        ),
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

// RETURN TYPE: Recursive period offsets require an explicit result type.
const parsePeriod = (input: string): Option.Option<Period> => {
  const shifted = EffectString.match(
    /^(.+) (?:(?:over|binnen) ([1-9]\d*) (dag|dagen|week|weken|maand|maanden|kwartaal|kwartalen|jaar|jaren)|([1-9]\d*) (dag|dagen|week|weken|maand|maanden|kwartaal|kwartalen|jaar|jaren) (geleden|later))$/u,
  )(input);
  if (Option.isSome(shifted)) {
    const suffixAmount = textAt(shifted.value, 4);
    const amount = parseTrailingCount(suffixAmount || textAt(shifted.value, 2));
    const unitText = textAt(shifted.value, suffixAmount.length > 0 ? 5 : 3);
    const alias = unitAliases.find((unit) => unit[0] === unitText);
    const entry = alias === undefined ? undefined : units.find((unit) => unit.unit === alias[1]);
    const period = parsePeriod(textAt(shifted.value, 1));
    if (Option.isSome(amount) && entry !== undefined && Option.isSome(period)) {
      const past = textAt(shifted.value, 6) === "geleden";
      const direction = past ? -amount.value : amount.value;
      const noun = amount.value === 1 ? entry.singular : entry.plural;
      const canonical = past
        ? `${period.value.canonical} ${amount.value} ${noun} geleden`
        : `${period.value.canonical} over ${amount.value} ${noun}`;
      return Option.some(shiftPeriod(period.value, direction, entry.unit, canonical));
    }
  }

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

const countedUnit = (value: string, amount: number) => {
  const expected = amount === 1 ? "singular" : "plural";
  const alias = unitAliases.find(
    (entry) => entry[0] === value && (entry[2] === expected || entry[2] === "both"),
  );
  return alias === undefined ? undefined : units.find((entry) => entry.unit === alias[1]);
};

const countedUnitPattern = "dag|dagen|week|weken|maand|maanden|kwartaal|kwartalen|jaar|jaren";
const countedPattern = (source: string) =>
  new RegExp(source.replace("UNIT", countedUnitPattern), "u");
const calendarPastPattern = countedPattern("^([1-9]\\d*) (UNIT) geleden$");
const calendarFuturePatterns = [
  countedPattern("^(?:over|binnen) ([1-9]\\d*) (UNIT)$"),
  countedPattern("^([1-9]\\d*) (UNIT) later$"),
];
const rollingPastPatterns = [
  countedPattern("^(?:(?:de|in de) )?(?:afgelopen|laatste|vorige) ([1-9]\\d*) (UNIT)$"),
  countedPattern("^([1-9]\\d*) (?:afgelopen|laatste|vorige) (UNIT)$"),
];
const rollingFuturePatterns = [
  countedPattern(
    "^(?:(?:de|in de|binnen de) )?(?:komende|volgende|aankomende) ([1-9]\\d*) (UNIT)$",
  ),
  countedPattern("^([1-9]\\d*) (?:komende|volgende|aankomende) (UNIT)$"),
];
const rollingSincePattern = countedPattern("^(?:sinds|gedurende) ([1-9]\\d*) (UNIT)$");
const rollingBarePattern = countedPattern("^([1-9]\\d*) (UNIT)$");

const firstPatternMatch = (input: string, patterns: ReadonlyArray<RegExp>) =>
  Option.firstSomeOf(patterns.map((pattern) => EffectString.match(pattern)(input)));

const singularRollingCanonical = (entry: UnitForms, future: boolean) =>
  future ? `vanaf nu gedurende een ${entry.singular}` : `sinds een ${entry.singular}`;

const singularRollingPhrases = units.flatMap((entry) => [
  { phrase: `${entry.article} afgelopen ${entry.singular}`, entry, future: false },
  { phrase: `${entry.article} laatste ${entry.singular}`, entry, future: false },
  { phrase: `sinds een ${entry.singular}`, entry, future: false },
  { phrase: `gedurende ${entry.article} komende ${entry.singular}`, entry, future: true },
  { phrase: `vanaf nu gedurende een ${entry.singular}`, entry, future: true },
]);

const singularCalendarOffsets = units.flatMap((entry) => [
  { phrase: `een ${entry.singular} geleden`, entry, direction: -1 },
  { phrase: `over een ${entry.singular}`, entry, direction: 1 },
  { phrase: `binnen een ${entry.singular}`, entry, direction: 1 },
]);

const parseCalendarOffset = (input: string) => {
  const singular = singularCalendarOffsets.find((entry) => entry.phrase === input);
  if (singular !== undefined) {
    return Option.some(
      candidate(
        periodRange(relativePeriod(singular.entry.unit, singular.direction, singular.phrase)),
        singular.phrase,
      ),
    );
  }
  const past = EffectString.match(calendarPastPattern)(input);
  const future = firstPatternMatch(input, calendarFuturePatterns);
  const match = Option.firstSomeOf([past, future]);
  if (Option.isNone(match)) return Option.none<ReturnType<typeof candidate>>();
  const amount = parseTrailingCount(textAt(match.value, 1));
  if (Option.isNone(amount)) return Option.none<ReturnType<typeof candidate>>();
  const entry = countedUnit(textAt(match.value, 2), amount.value);
  if (entry === undefined) return Option.none<ReturnType<typeof candidate>>();
  const direction = Option.isSome(past) ? -amount.value : amount.value;
  const noun = amount.value === 1 ? entry.singular : entry.plural;
  const canonical =
    direction < 0 ? `${amount.value} ${noun} geleden` : `over ${amount.value} ${noun}`;
  return Option.some(
    candidate(periodRange(relativePeriod(entry.unit, direction, canonical)), canonical),
  );
};

const parseRollingPeriod = (input: string) => {
  const singular = singularRollingPhrases.find((entry) => entry.phrase === input);
  if (singular !== undefined) {
    const range = singular.future
      ? futureRange(1, singular.entry.unit)
      : trailingRange(1, singular.entry.unit);
    return Option.some(candidate(range, singularRollingCanonical(singular.entry, singular.future)));
  }
  const since = EffectString.match(rollingSincePattern)(input);
  const past = firstPatternMatch(input, rollingPastPatterns);
  const bare = EffectString.match(rollingBarePattern)(input);
  const future = firstPatternMatch(input, rollingFuturePatterns);
  const match = Option.firstSomeOf([since, past, bare, future]);
  if (Option.isNone(match)) return Option.none<ReturnType<typeof candidate>>();
  const amount = parseTrailingCount(textAt(match.value, 1));
  if (Option.isNone(amount)) return Option.none<ReturnType<typeof candidate>>();
  const entry = countedUnit(textAt(match.value, 2), amount.value);
  if (entry === undefined) return Option.none<ReturnType<typeof candidate>>();
  const isFuture = Option.isSome(future);
  const range = isFuture
    ? futureRange(amount.value, entry.unit)
    : trailingRange(amount.value, entry.unit);
  if (amount.value === 1) {
    return Option.some(candidate(range, singularRollingCanonical(entry, isFuture)));
  }
  const modifier = isFuture ? "komende" : "afgelopen";
  return Option.some(candidate(range, `de ${modifier} ${amount.value} ${entry.plural}`));
};

const parseElidedDateRange = (input: string) => {
  const joined = EffectString.match(
    /^(?:van ([0-3]?\d) tot(?: en met)?|tussen (?:de )?([0-3]?\d)(?:e)? en(?: de)?) ([0-3]?\d)(?:e)? (.+)$/u,
  )(input);
  const dashed = EffectString.match(/^([0-3]?\d)[–—-]([0-3]?\d) (.+)$/u)(input);
  const match = Option.firstSomeOf([joined, dashed]);
  if (Option.isNone(match)) return Option.none<ReturnType<typeof candidate>>();
  const isJoined = Option.isSome(joined);
  const lowerDay = textAt(match.value, 1) || textAt(match.value, 2);
  const upperDay = textAt(match.value, isJoined ? 3 : 2);
  const period = afterVan(textAt(match.value, isJoined ? 4 : 3));
  const isRelativeMonth = periodAliases.some(
    (entry) => entry[0] === period && entry[1] === "month",
  );
  const suffix = isRelativeMonth ? `van ${period}` : period;
  return joinedPeriodCandidate(
    `van ${lowerDay} ${suffix} tot en met ${upperDay} ${suffix}`,
    [["van ", " tot en met "]],
    parsePeriod,
    (lower, upper) => `van ${lower} tot en met ${upper}`,
  );
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

  const elided = parseElidedDateRange(input);
  if (Option.isSome(elided)) return elided;

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
  return parsePeriod(input).pipe(
    Option.map((period) => candidate(periodRange(period), period.canonical)),
  );
};

const weekendPhrases = [
  "dit weekend",
  "vorig weekend",
  "volgend weekend",
  "het weekend voor het vorige",
  "het weekend na het volgende",
];

const edgePeriodPhrases = [
  ...units
    .filter((entry) => entry.unit !== "day")
    .flatMap((entry) => [entry.current, entry.previous, entry.next]),
  ...weekendPhrases,
  ...months,
].flatMap((period) => [`begin van ${period}`, `eind van ${period}`]);

const staticPeriodPhrases = [
  ...periodAliases.map((entry) => entry[0]),
  ...weekendPhrases,
  ...edgePeriodPhrases,
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
  ...singularRollingPhrases.map((entry) => entry.phrase),
  ...singularCalendarOffsets.map((entry) => entry.phrase),
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

// RETURN TYPE: Recursive shifted-period rendering requires an explicit result type.
const renderDutch = (range: DateRangeExpr): Option.Option<string> => {
  const shifted = decomposeShiftedPeriodRange(range);
  if (Option.isSome(shifted)) {
    const base = renderDutch(shifted.value.baseRange);
    const entry = units.find((unit) => unit.unit === shifted.value.unit);
    if (Option.isSome(base) && entry !== undefined) {
      const amount = Math.abs(shifted.value.amount);
      const noun = amount === 1 ? entry.singular : entry.plural;
      return Option.some(
        shifted.value.amount < 0
          ? `${base.value} ${amount} ${noun} geleden`
          : `${base.value} over ${amount} ${noun}`,
      );
    }
  }

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
      return Option.some(
        future.value.amount === 1
          ? singularRollingCanonical(entry, true)
          : `de komende ${future.value.amount} ${entry.plural}`,
      );
    }
  }
  const trailing = trailingPeriod(range);
  if (Option.isSome(trailing)) {
    const entry = units.find((unit) => unit.unit === trailing.value.unit);
    if (entry !== undefined) {
      return Option.some(
        trailing.value.amount === 1
          ? singularRollingCanonical(entry, false)
          : `de afgelopen ${trailing.value.amount} ${entry.plural}`,
      );
    }
  }
  const periods = [
    ...staticPeriods,
    ...currentYearDatePeriods(range, currentDateLabel),
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
  normalize: normalizeDutch,
  correct: correctDutch,
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
