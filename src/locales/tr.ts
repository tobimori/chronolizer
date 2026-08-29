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
  periodBoundaryCandidate,
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
  "ocak",
  "şubat",
  "mart",
  "nisan",
  "mayıs",
  "haziran",
  "temmuz",
  "ağustos",
  "eylül",
  "ekim",
  "kasım",
  "aralık",
] as const;

const monthAbbreviations = [
  ["oca"],
  ["şub", "sub"],
  ["mar"],
  ["nis"],
  ["may"],
  ["haz"],
  ["tem"],
  ["ağu", "agu"],
  ["eyl"],
  ["eki"],
  ["kas"],
  ["ara"],
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
    singular: "gün",
    plural: "gün",
    current: "bugün",
    previous: "dün",
    next: "yarın",
    toDate: "bugün şimdiye kadar",
    remaining: "günün geri kalanı",
  },
  {
    unit: "week",
    singular: "hafta",
    plural: "hafta",
    current: "bu hafta",
    previous: "geçen hafta",
    next: "gelecek hafta",
    toDate: "hafta başından bugüne",
    remaining: "haftanın geri kalanı",
  },
  {
    unit: "month",
    singular: "ay",
    plural: "ay",
    current: "bu ay",
    previous: "geçen ay",
    next: "gelecek ay",
    toDate: "ay başından bugüne",
    remaining: "ayın geri kalanı",
  },
  {
    unit: "quarter",
    singular: "çeyrek",
    plural: "çeyrek",
    current: "bu çeyrek",
    previous: "geçen çeyrek",
    next: "gelecek çeyrek",
    toDate: "çeyrek başından bugüne",
    remaining: "çeyreğin geri kalanı",
  },
  {
    unit: "year",
    singular: "yıl",
    plural: "yıl",
    current: "bu yıl",
    previous: "geçen yıl",
    next: "gelecek yıl",
    toDate: "yılbaşından bugüne",
    remaining: "yılın geri kalanı",
  },
];

const title = (value: string) => `${value.slice(0, 1).toLocaleUpperCase("tr")}${value.slice(1)}`;

const unitAliases = [
  ["gün", "day"],
  ["gun", "day"],
  ["hafta", "week"],
  ["ay", "month"],
  ["çeyrek", "quarter"],
  ["ceyrek", "quarter"],
  ["yıl", "year"],
  ["yil", "year"],
  ["sene", "year"],
] as const satisfies ReadonlyArray<readonly [string, Unit]>;

const periodAliases = [
  ...units.flatMap((entry) => [
    [entry.current, entry.unit, 0, entry.current] as const,
    [entry.previous, entry.unit, -1, entry.previous] as const,
    [entry.next, entry.unit, 1, entry.next] as const,
  ]),
  ["önceki hafta", "week", -1, "geçen hafta"],
  ["geçtiğimiz hafta", "week", -1, "geçen hafta"],
  ["önümüzdeki hafta", "week", 1, "gelecek hafta"],
  ["önceki ay", "month", -1, "geçen ay"],
  ["bir önceki ay", "month", -1, "geçen ay"],
  ["geçtiğimiz ay", "month", -1, "geçen ay"],
  ["önümüzdeki ay", "month", 1, "gelecek ay"],
  ["sonraki ay", "month", 1, "gelecek ay"],
  ["bir sonraki ay", "month", 1, "gelecek ay"],
  ["önceki yıl", "year", -1, "geçen yıl"],
  ["geçtiğimiz yıl", "year", -1, "geçen yıl"],
  ["önümüzdeki yıl", "year", 1, "gelecek yıl"],
  ["evvelsi gün", "day", -2, "evvelsi gün"],
  ["öbür gün", "day", 2, "öbür gün"],
  ["geçen haftadan önceki hafta", "week", -2, "geçen haftadan önceki hafta"],
  ["gelecek haftadan sonraki hafta", "week", 2, "gelecek haftadan sonraki hafta"],
  ["geçen aydan önceki ay", "month", -2, "geçen aydan önceki ay"],
  ["gelecek aydan sonraki ay", "month", 2, "gelecek aydan sonraki ay"],
  ["geçen çeyrekten önceki çeyrek", "quarter", -2, "geçen çeyrekten önceki çeyrek"],
  ["gelecek çeyrekten sonraki çeyrek", "quarter", 2, "gelecek çeyrekten sonraki çeyrek"],
  ["geçen yıldan önceki yıl", "year", -2, "geçen yıldan önceki yıl"],
  ["gelecek yıldan sonraki yıl", "year", 2, "gelecek yıldan sonraki yıl"],
] as const satisfies ReadonlyArray<readonly [string, Unit, number, string]>;

const periodGenitive = {
  day: "günün",
  week: "haftanın",
  month: "ayın",
  quarter: "çeyreğin",
  year: "yılın",
} as const satisfies Record<Unit, string>;

const toDatePhrases = units.flatMap((entry) => {
  const yearAliases =
    entry.unit === "year"
      ? ["yılbaşından bu yana", "yılın başından bugüne", "bu yıl şimdiye kadar"]
      : [];
  return [
    entry.toDate,
    `${periodGenitive[entry.unit]} başından bugüne`,
    `${entry.current} şimdiye kadar`,
    ...yearAliases,
  ].map((phrase) => ({ entry, phrase }));
});

const remainingPhrases = units.map((entry) => ({ entry, phrase: entry.remaining }));

const relativeYearDirection = (value: string) => {
  if (value.includes("geçen") || value.includes("önceki")) return -1;
  if (value.includes("gelecek") || value.includes("önümüzdeki")) return 1;
  return 0;
};

const relativeYearName = (direction: number) => {
  if (direction < 0) return "geçen yıl";
  if (direction > 0) return "gelecek yıl";
  return "bu yıl";
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
  const named = EffectString.match(/^([0-3]?\d)(?:\.)? ([a-zçğıöşü]+\.?)(?:,)? (\d{4})$/u)(input);
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

  const current = EffectString.match(/^([0-3]?\d)(?:\.)? ([a-zçğıöşü]+\.?)$/u)(input);
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
  if ((value.startsWith("q") || value.startsWith("ç")) && value.length === 2) {
    return Number(value.slice(1));
  }
  if (value === "1." || value === "birinci" || value === "ilk") return 1;
  if (value === "2." || value === "ikinci") return 2;
  if (value === "3." || value === "üçüncü" || value === "ucuncu") return 3;
  return value === "4." || value === "dördüncü" || value === "dorduncu" ? 4 : undefined;
};

const parseQuarter = (input: string) => {
  const fixed = EffectString.match(
    /^(ç[1-4]|q[1-4]|1\.|birinci|ilk|2\.|ikinci|3\.|üçüncü|ucuncu|4\.|dördüncü|dorduncu)(?: çeyrek)?(?:,)? (\d{4})$/u,
  )(input);
  if (Option.isSome(fixed)) {
    const quarter = quarterNumber(textAt(fixed.value, 1));
    const year = validYear(textAt(fixed.value, 2));
    if (quarter !== undefined && year !== undefined) {
      return Option.some(fixedQuarterPeriod(year, quarter, `Ç${quarter} ${year}`));
    }
  }
  const relative = EffectString.match(
    /^(?:bu yıl )?(ç[1-4]|q[1-4])(?: (geçen yıl|gelecek yıl|bu yıl))?$/u,
  )(input);
  if (Option.isSome(relative)) {
    const quarter = quarterNumber(textAt(relative.value, 1));
    const direction = relativeYearDirection(textAt(relative.value, 2));
    if (quarter !== undefined) {
      return Option.some(
        quarterOfRelativeYear(quarter, direction, `Ç${quarter} ${relativeYearName(direction)}`),
      );
    }
  }
  const standalone = EffectString.match(/^(ç[1-4]|q[1-4])$/u)(input);
  if (Option.isNone(standalone)) return Option.none<Period>();
  const quarter = quarterNumber(textAt(standalone.value, 1));
  return quarter === undefined
    ? Option.none<Period>()
    : Option.some(quarterOfRelativeYear(quarter, 0, `Ç${quarter}`));
};

const parseBasePeriod = (input: string) => {
  const absoluteDate = absoluteDatePeriod(input, "tr");
  if (Option.isSome(absoluteDate)) return absoluteDate;
  const namedDate = parseNamedDate(input);
  if (Option.isSome(namedDate)) return namedDate;
  const quarter = parseQuarter(input);
  if (Option.isSome(quarter)) return quarter;

  const yearMatch = EffectString.match(/^(?:yıl |yılı )?(\d{4})$/u)(input);
  if (Option.isSome(yearMatch)) {
    const year = validYear(textAt(yearMatch.value, 1));
    if (year !== undefined) return Option.some(fixedYearPeriod(year, String(year)));
  }

  const monthYear = EffectString.match(/^([a-zçğıöşü]+\.?)(?:,)? (\d{4})$/u)(input);
  if (Option.isSome(monthYear)) {
    const month = monthNumber(textAt(monthYear.value, 1));
    const year = validYear(textAt(monthYear.value, 2));
    if (month !== undefined && year !== undefined) {
      return Option.some(
        fixedMonthPeriod(year, month, `${title(textAt(months, month - 1))} ${year}`),
      );
    }
  }

  const relativeMonth = EffectString.match(/^([a-zçğıöşü]+\.?) (geçen yıl|gelecek yıl|bu yıl)$/u)(
    input,
  );
  const relativeMonthYearFirst = EffectString.match(
    /^(geçen yıl|gelecek yıl|bu yıl) ([a-zçğıöşü]+\.?)$/u,
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

  if (["hafta sonu", "bu hafta sonu"].includes(input)) {
    return Option.some(relativeWeekend(0, "bu hafta sonu"));
  }
  if (["geçen hafta sonu", "önceki hafta sonu"].includes(input)) {
    return Option.some(relativeWeekend(-1, "geçen hafta sonu"));
  }
  if (["gelecek hafta sonu", "önümüzdeki hafta sonu"].includes(input)) {
    return Option.some(relativeWeekend(1, "gelecek hafta sonu"));
  }
  if (input === "geçen hafta sonundan önceki hafta sonu") {
    return Option.some(relativeWeekend(-2, input));
  }
  if (input === "gelecek hafta sonundan sonraki hafta sonu") {
    return Option.some(relativeWeekend(2, input));
  }
  return Option.none<Period>();
};

const parsePeriod = (input: string) => {
  const edge = EffectString.match(/^(.+?)(?:ın|in|un|ün) (başı|başlangıcı|sonu)$/u)(input);
  if (Option.isSome(edge)) {
    const period = parseBasePeriod(textAt(edge.value, 1));
    if (Option.isSome(period)) {
      const isEnd = textAt(edge.value, 2) === "sonu";
      const canonical = `${period.value.canonical} ${isEnd ? "sonu" : "başı"}`;
      return Option.some(
        isEnd ? periodEndDay(period.value, canonical) : periodStartDay(period.value, canonical),
      );
    }
  }
  const wrapper = ["boyunca ", "içinde ", "tüm "].find((prefix) => input.startsWith(prefix));
  return parseBasePeriod(wrapper === undefined ? input : input.slice(wrapper.length));
};

const countedUnit = (value: string) => unitAliases.find((entry) => entry[0] === value)?.[1];

const countedUnitPattern = "gün|gun|hafta|ay|çeyrek|ceyrek|yıl|yil|sene";
const countedPattern = (source: string) =>
  new RegExp(source.replace("UNIT", countedUnitPattern), "u");
const calendarPastPattern = countedPattern("^([1-9]\\d*) (UNIT) önce$");
const calendarFuturePatterns = [
  countedPattern("^([1-9]\\d*) (UNIT) sonra$"),
  countedPattern("^([1-9]\\d*) (UNIT) içinde$"),
];
const rollingPastPatterns = [
  countedPattern("^(?:son|geçen|önceki|geçtiğimiz) ([1-9]\\d*) (UNIT)$"),
  countedPattern("^([1-9]\\d*) (?:son|geçen|önceki) (UNIT)$"),
];
const rollingFuturePatterns = [
  countedPattern("^(?:gelecek|önümüzdeki|sonraki) ([1-9]\\d*) (UNIT)$"),
  countedPattern("^([1-9]\\d*) (?:gelecek|sonraki) (UNIT)$"),
];
const rollingSincePattern = countedPattern("^([1-9]\\d*) (UNIT) boyunca$");
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
    direction < 0 ? `${amount.value} ${noun} önce` : `${amount.value} ${noun} sonra`;
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
  const modifier = isFuture ? "gelecek" : "son";
  const noun = amount.value === 1 ? entry.singular : entry.plural;
  return Option.some(candidate(range, `${modifier} ${amount.value} ${noun}`));
};

const suffixBoundary = (input: string) => {
  const boundaries = [
    [EffectString.match(/^(.+?)'?(?:den|dan|ten|tan) itibaren$/u)(input), "since"],
    [EffectString.match(/^(.+) itibarıyla$/u)(input), "since"],
    [EffectString.match(/^(.+?)'?(?:den|dan|ten|tan) önce$/u)(input), "before"],
    [EffectString.match(/^(.+) öncesi$/u)(input), "before"],
    [EffectString.match(/^(.+?)'?(?:e|a|ye|ya) kadar$/u)(input), "through"],
    [EffectString.match(/^(.+) sonuna kadar$/u)(input), "through"],
    [EffectString.match(/^(.+?)'?(?:den|dan|ten|tan) sonra$/u)(input), "after"],
    [EffectString.match(/^(.+) sonrası$/u)(input), "after"],
  ] as const;
  for (const [match, boundary] of boundaries) {
    if (Option.isNone(match)) continue;
    const period = parsePeriod(textAt(match.value, 1));
    if (Option.isSome(period)) {
      return Option.some(periodBoundaryCandidate(period.value, boundary, input));
    }
  }
  return Option.none<ReturnType<typeof candidate>>();
};

const boundaryCandidate = (input: string) => {
  const suffix = suffixBoundary(input);
  if (Option.isSome(suffix)) return suffix;
  return openBoundaryCandidate(
    input,
    [
      ["itibaren ", "since"],
      ["önce ", "before"],
      ["kadar ", "through"],
      ["sonra ", "after"],
    ],
    parsePeriod,
  );
};

const parseTurkish = (input: string) => {
  const remaining = remainingPhrases.find((entry) => entry.phrase === input);
  if (remaining !== undefined) {
    return Option.some(
      candidate(remainingPeriodRange(remaining.entry.unit), remaining.entry.remaining),
    );
  }
  if (["bugüne kadar", "şimdiye kadar", "şu ana kadar"].includes(input)) {
    return Option.some(candidate(untilNowRange(), "şimdiye kadar"));
  }
  if (["bugünden itibaren", "şu andan itibaren", "bundan sonra"].includes(input)) {
    return Option.some(candidate(fromNowRange(), "bugünden itibaren"));
  }
  const offset = parseCalendarOffset(input);
  if (Option.isSome(offset)) return offset;
  const rolling = parseRollingPeriod(input);
  if (Option.isSome(rolling)) return rolling;
  const toDate = toDatePhrases.find((entry) => entry.phrase === input);
  if (toDate !== undefined) {
    return Option.some(candidate(periodToDateRange(toDate.entry.unit), toDate.entry.toDate));
  }

  const joinedInput = input.endsWith(" arası") ? input.slice(0, -6) : input;
  const nowBounded = joinedNowCandidate(
    joinedInput,
    [
      ["", " ile bugün"],
      ["", " ve bugün"],
    ],
    ["bugün ile ", "bugün ve "],
    parsePeriod,
    (period) => `${period} ile bugün arası`,
    (period) => `bugün ile ${period} arası`,
  );
  if (Option.isSome(nowBounded)) return nowBounded;

  const bounded = joinedPeriodCandidate(
    joinedInput,
    [
      ["", " ile "],
      ["", " ve "],
      ["", " - "],
      ["", " – "],
      ["", " — "],
    ],
    parsePeriod,
    (lower, upper) => `${lower} ile ${upper} arası`,
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
  "bu hafta sonu",
  "geçen hafta sonu",
  "gelecek hafta sonu",
  "geçen hafta sonundan önceki hafta sonu",
  "gelecek hafta sonundan sonraki hafta sonu",
  "bu haftanın başı",
  "bu haftanın sonu",
  "geçen haftanın başı",
  "geçen haftanın sonu",
  "gelecek haftanın başı",
  "gelecek haftanın sonu",
  "bu ayın başı",
  "bu ayın sonu",
  "geçen ayın başı",
  "geçen ayın sonu",
  "gelecek ayın başı",
  "gelecek ayın sonu",
  "bu yılın başı",
  "bu yılın sonu",
  "geçen yılın başı",
  "geçen yılın sonu",
  "gelecek yılın başı",
  "gelecek yılın sonu",
  ...[1, 2, 3, 4].flatMap((quarter) => [
    `ç${quarter}`,
    `ç${quarter} bu yıl`,
    `ç${quarter} geçen yıl`,
    `ç${quarter} gelecek yıl`,
  ]),
  ...months.flatMap((month) => [month, `${month} geçen yıl`, `${month} gelecek yıl`]),
];

const staticPeriods = periodsFromPhrases(staticPeriodPhrases, parsePeriod);
const boundaryPrefixes = ["itibaren ", "önce ", "kadar ", "sonra "];

const countedSuggestions = (input: string) => {
  const amount = naturalCount(input);
  if (amount === undefined) return [];
  return units.flatMap((entry) => {
    const noun = amount === 1 ? entry.singular : entry.plural;
    return [
      `son ${amount} ${noun}`,
      `geçen ${amount} ${noun}`,
      `${amount} ${noun}`,
      `gelecek ${amount} ${noun}`,
      `önümüzdeki ${amount} ${noun}`,
      `${amount} ${noun} önce`,
      `${amount} ${noun} sonra`,
    ];
  });
};

const turkishSuggestionPhrases = [
  ...units.map((entry) => entry.toDate),
  ...units.map((entry) => entry.remaining),
  ...staticPeriodPhrases,
  ...prefixNaturalPhrases(staticPeriodPhrases, boundaryPrefixes),
  "şimdiye kadar",
  "bugünden itibaren",
];

const suggestTurkish = (input: string, limit: number) => {
  const fixed = fixedCalendarPeriodPhrases(input, months).map((phrase) =>
    phrase.startsWith("q") ? `ç${phrase.slice(1)}` : phrase,
  );
  return completeNaturalPhrases(
    input,
    [
      ...turkishSuggestionPhrases,
      ...fixed,
      ...prefixNaturalPhrases(fixed, boundaryPrefixes),
      ...countedSuggestions(input),
    ],
    limit,
  );
};

const renderTurkish = (range: DateRangeExpr) => {
  const offset = calendarPeriodOffset(range);
  if (Option.isSome(offset) && Math.abs(offset.value.amount) > 1) {
    const entry = units.find((unit) => unit.unit === offset.value.unit);
    if (entry !== undefined) {
      const amount = Math.abs(offset.value.amount);
      const noun = amount === 1 ? entry.singular : entry.plural;
      return Option.some(
        offset.value.amount < 0 ? `${amount} ${noun} önce` : `${amount} ${noun} sonra`,
      );
    }
  }
  const future = futurePeriod(range);
  if (Option.isSome(future)) {
    const entry = units.find((unit) => unit.unit === future.value.unit);
    if (entry !== undefined) {
      const noun = future.value.amount === 1 ? entry.singular : entry.plural;
      return Option.some(`gelecek ${future.value.amount} ${noun}`);
    }
  }
  const trailing = trailingPeriod(range);
  if (Option.isSome(trailing)) {
    const entry = units.find((unit) => unit.unit === trailing.value.unit);
    if (entry !== undefined) {
      const noun = trailing.value.amount === 1 ? entry.singular : entry.plural;
      return Option.some(`son ${trailing.value.amount} ${noun}`);
    }
  }
  const periods = [
    ...staticPeriods,
    ...currentYearDatePeriods(range, currentDateLabel),
    ...periodsFromPhrases(
      [
        ...datedPeriods(range, months),
        ...datedQuarterPeriods(range).map((phrase) =>
          phrase.startsWith("Q") ? `Ç${phrase.slice(1)}` : phrase,
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
    (period) => `${period} itibarıyla`,
    (period) => `${period} öncesi`,
    (period) => `${period} sonuna kadar`,
    (period) => `${period} sonrası`,
    (lower, upper) => `${lower} ile ${upper} arası`,
    (period) => `${period} ile bugün arası`,
    (period) => `bugün ile ${period} arası`,
    () => "şimdiye kadar",
    () => "bugünden itibaren",
  );
};

const normalizeTurkish = (input: string, locale: string) =>
  normalizeNaturalText(input, locale).replaceAll("’", "'");

export const TurkishContribution = new BaseLanguageContribution({
  locale: "tr",
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
    "arası",
    "başı",
    "bugün",
    "gelecek",
    "geçen",
    "geri",
    "itibaren",
    "itibarıyla",
    "kadar",
    "kalanı",
    "önce",
    "önceki",
    "önümüzdeki",
    "son",
    "sonra",
    "sonrası",
    "şimdiye",
  ],
  normalize: normalizeTurkish,
  correct: correctWhitespaceSeparatedText,
  parseExact: parseTurkish,
  suggest: suggestTurkish,
  render: renderTurkish,
});

export const TurkishLanguage = defineLanguagePlugin({
  id: "chronolizer/language-tr",
  effect: (context) =>
    Effect.asVoid(context.register("chronolizer/language-tr", TurkishContribution)),
});

export const TurkishLanguageLayer = languagePluginsLayer([TurkishLanguage]);
