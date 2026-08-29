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
  "styczeń",
  "luty",
  "marzec",
  "kwiecień",
  "maj",
  "czerwiec",
  "lipiec",
  "sierpień",
  "wrzesień",
  "październik",
  "listopad",
  "grudzień",
] as const;
const monthGenitives = [
  "stycznia",
  "lutego",
  "marca",
  "kwietnia",
  "maja",
  "czerwca",
  "lipca",
  "sierpnia",
  "września",
  "października",
  "listopada",
  "grudnia",
] as const;
const monthInstrumentals = [
  "styczniem",
  "lutym",
  "marcem",
  "kwietniem",
  "majem",
  "czerwcem",
  "lipcem",
  "sierpniem",
  "wrześniem",
  "październikiem",
  "listopadem",
  "grudniem",
] as const;
const monthLocatives = [
  "styczniu",
  "lutym",
  "marcu",
  "kwietniu",
  "maju",
  "czerwcu",
  "lipcu",
  "sierpniu",
  "wrześniu",
  "październiku",
  "listopadzie",
  "grudniu",
] as const;
const monthAbbreviations = [
  ["sty"],
  ["lut"],
  ["mar"],
  ["kwi"],
  ["maj"],
  ["cze"],
  ["lip"],
  ["sie"],
  ["wrz"],
  ["paź", "paz"],
  ["lis"],
  ["gru"],
] as const;

interface UnitForms {
  readonly unit: Unit;
  readonly singular: string;
  readonly few: string;
  readonly many: string;
  readonly current: string;
  readonly previous: string;
  readonly next: string;
  readonly toDate: string;
  readonly remaining: string;
}
const units: ReadonlyArray<UnitForms> = [
  {
    unit: "day",
    singular: "dzień",
    few: "dni",
    many: "dni",
    current: "dzisiaj",
    previous: "wczoraj",
    next: "jutro",
    toDate: "dzisiaj do tej pory",
    remaining: "reszta dnia",
  },
  {
    unit: "week",
    singular: "tydzień",
    few: "tygodnie",
    many: "tygodni",
    current: "ten tydzień",
    previous: "poprzedni tydzień",
    next: "następny tydzień",
    toDate: "tydzień do dziś",
    remaining: "reszta tygodnia",
  },
  {
    unit: "month",
    singular: "miesiąc",
    few: "miesiące",
    many: "miesięcy",
    current: "ten miesiąc",
    previous: "poprzedni miesiąc",
    next: "następny miesiąc",
    toDate: "miesiąc do dziś",
    remaining: "reszta miesiąca",
  },
  {
    unit: "quarter",
    singular: "kwartał",
    few: "kwartały",
    many: "kwartałów",
    current: "ten kwartał",
    previous: "poprzedni kwartał",
    next: "następny kwartał",
    toDate: "kwartał do dziś",
    remaining: "reszta kwartału",
  },
  {
    unit: "year",
    singular: "rok",
    few: "lata",
    many: "lat",
    current: "ten rok",
    previous: "poprzedni rok",
    next: "następny rok",
    toDate: "rok do dziś",
    remaining: "reszta roku",
  },
];
const title = (value: string) => `${value.slice(0, 1).toLocaleUpperCase("pl")}${value.slice(1)}`;
const unitAliases = [
  ["dzień", "day"],
  ["dni", "day"],
  ["tydzień", "week"],
  ["tygodnie", "week"],
  ["tygodni", "week"],
  ["miesiąc", "month"],
  ["miesiące", "month"],
  ["miesięcy", "month"],
  ["kwartał", "quarter"],
  ["kwartały", "quarter"],
  ["kwartałów", "quarter"],
  ["rok", "year"],
  ["lata", "year"],
  ["lat", "year"],
] as const satisfies ReadonlyArray<readonly [string, Unit]>;
const periodAliases = [
  ...units.flatMap((entry) => [
    [entry.current, entry.unit, 0, entry.current] as const,
    [entry.previous, entry.unit, -1, entry.previous] as const,
    [entry.next, entry.unit, 1, entry.next] as const,
  ]),
  ["zeszły tydzień", "week", -1, "poprzedni tydzień"],
  ["przyszły tydzień", "week", 1, "następny tydzień"],
  ["zeszły miesiąc", "month", -1, "poprzedni miesiąc"],
  ["przyszły miesiąc", "month", 1, "następny miesiąc"],
  ["zeszły kwartał", "quarter", -1, "poprzedni kwartał"],
  ["przyszły kwartał", "quarter", 1, "następny kwartał"],
  ["zeszły rok", "year", -1, "poprzedni rok"],
  ["przyszły rok", "year", 1, "następny rok"],
  ["tego tygodnia", "week", 0, "ten tydzień"],
  ["poprzedniego tygodnia", "week", -1, "poprzedni tydzień"],
  ["następnego tygodnia", "week", 1, "następny tydzień"],
  ["tego miesiąca", "month", 0, "ten miesiąc"],
  ["poprzedniego miesiąca", "month", -1, "poprzedni miesiąc"],
  ["następnego miesiąca", "month", 1, "następny miesiąc"],
  ["tego kwartału", "quarter", 0, "ten kwartał"],
  ["poprzedniego kwartału", "quarter", -1, "poprzedni kwartał"],
  ["następnego kwartału", "quarter", 1, "następny kwartał"],
  ["tego roku", "year", 0, "ten rok"],
  ["poprzedniego roku", "year", -1, "poprzedni rok"],
  ["następnego roku", "year", 1, "następny rok"],
  ["przedwczoraj", "day", -2, "przedwczoraj"],
  ["pojutrze", "day", 2, "pojutrze"],
  ["przedostatni tydzień", "week", -2, "przedostatni tydzień"],
  ["tydzień po następnym", "week", 2, "tydzień po następnym"],
  ["przedostatni miesiąc", "month", -2, "przedostatni miesiąc"],
  ["miesiąc po następnym", "month", 2, "miesiąc po następnym"],
  ["przedostatni rok", "year", -2, "przedostatni rok"],
  ["rok po następnym", "year", 2, "rok po następnym"],
] as const satisfies ReadonlyArray<readonly [string, Unit, number, string]>;
const toDatePhrases = units.flatMap((entry) => {
  const yearAliases =
    entry.unit === "year"
      ? ["od początku roku", "od początku roku do dziś", "w tym roku do dziś"]
      : [];
  return [entry.toDate, ...yearAliases].map((phrase) => ({ entry, phrase }));
});
const remainingPhrases = units.map((entry) => ({ entry, phrase: entry.remaining }));
const relativeYearDirection = (value: string) => {
  if (value.includes("poprzed")) return -1;
  if (value.includes("następn")) return 1;
  return 0;
};
const relativeYearName = (direction: number) => {
  if (direction < 0) return "poprzedniego roku";
  if (direction > 0) return "następnego roku";
  return "tego roku";
};

const monthNumber = (value: string) => {
  const normalized = value.endsWith(".") ? value.slice(0, -1) : value;
  const full = months.findIndex(
    (month, index) =>
      month === normalized ||
      textAt(monthGenitives, index) === normalized ||
      textAt(monthInstrumentals, index) === normalized ||
      textAt(monthLocatives, index) === normalized,
  );
  if (full !== -1) return full + 1;
  const short = monthAbbreviations.findIndex((aliases) =>
    aliases.some((alias) => alias === normalized),
  );
  return short === -1 ? undefined : short + 1;
};

const dateLabel = (day: number, month: number, year: number) =>
  `${day}. ${textAt(monthGenitives, month - 1)} ${year}`;

const currentDateLabel = (day: number, month: number) =>
  `${day}. ${textAt(monthGenitives, month - 1)}`;

const withMonthCase = (value: string, forms: ReadonlyArray<string>) => {
  const month = months.findIndex((name) => value.startsWith(title(name)) || value.startsWith(name));
  if (month === -1) return value;
  const name = textAt(months, month);
  return `${textAt(forms, month)}${value.slice(name.length)}`;
};

const parseNamedDate = (input: string) => {
  const named = EffectString.match(/^([0-3]?\d)\.?(?: )([a-ząćęłńóśźż]+\.?) (\d{4})$/u)(input);
  if (Option.isSome(named)) {
    return namedDatePeriod(
      textAt(named.value, 3),
      textAt(named.value, 2),
      textAt(named.value, 1),
      monthNumber,
      dateLabel,
    );
  }
  const numeric = EffectString.match(/^([0-3]?\d)(?:\. ?|[/-])([01]?\d)(?:\. ?|[/-])(\d{4})$/u)(
    input,
  );
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

  const current = EffectString.match(/^([0-3]?\d)\.? ([a-ząćęłńóśźż]+\.?)$/u)(input);
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
  if (value.startsWith("q") && value.length === 2) {
    return Number(value.slice(1));
  }
  if (value === "1." || value === "pierwszy") return 1;
  if (value === "2." || value === "drugi") return 2;
  if (value === "3." || value === "trzeci") return 3;
  return value === "4." || value === "czwarty" ? 4 : undefined;
};

const parseQuarter = (input: string) => {
  const fixed = EffectString.match(
    /^(q[1-4]|1\.|pierwszy|2\.|drugi|3\.|trzeci|4\.|czwarty)(?: kwartał)? (\d{4})$/u,
  )(input);
  if (Option.isSome(fixed)) {
    const quarter = quarterNumber(textAt(fixed.value, 1));
    const year = validYear(textAt(fixed.value, 2));
    if (quarter !== undefined && year !== undefined) {
      return Option.some(fixedQuarterPeriod(year, quarter, `Q${quarter} ${year}`));
    }
  }
  const relative = EffectString.match(/^(q[1-4]) (poprzedniego roku|następnego roku|tego roku)$/u)(
    input,
  );
  if (Option.isSome(relative)) {
    const quarter = quarterNumber(textAt(relative.value, 1));
    const direction = relativeYearDirection(textAt(relative.value, 2));
    if (quarter !== undefined) {
      return Option.some(
        quarterOfRelativeYear(quarter, direction, `Q${quarter} ${relativeYearName(direction)}`),
      );
    }
  }
  const standalone = EffectString.match(/^(q[1-4])$/u)(input);
  if (Option.isNone(standalone)) return Option.none<Period>();
  const quarter = quarterNumber(textAt(standalone.value, 1));
  return quarter === undefined
    ? Option.none<Period>()
    : Option.some(quarterOfRelativeYear(quarter, 0, `Q${quarter}`));
};

const parseBasePeriod = (input: string) => {
  if (isIsoDate(input) && input !== "9999-12-31") {
    return Option.some(fixedDatePeriod(input, input));
  }
  const namedDate = parseNamedDate(input);
  if (Option.isSome(namedDate)) return namedDate;
  const quarter = parseQuarter(input);
  if (Option.isSome(quarter)) return quarter;

  const yearMatch = EffectString.match(/^(?:rok |roku )?(\d{4})$/u)(input);
  if (Option.isSome(yearMatch)) {
    const year = validYear(textAt(yearMatch.value, 1));
    if (year !== undefined) return Option.some(fixedYearPeriod(year, String(year)));
  }

  const monthYear = EffectString.match(/^([a-ząćęłńóśźż]+\.?) (\d{4})$/u)(input);
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
    /^([a-ząćęłńóśźż]+\.?) (poprzedniego roku|następnego roku|tego roku)$/u,
  )(input);
  const relativeMonthYearFirst = EffectString.match(
    /^(poprzedniego roku|następnego roku|tego roku) ([a-ząćęłńóśźż]+\.?)$/u,
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

  if (["weekend", "ten weekend"].includes(input)) {
    return Option.some(relativeWeekend(0, "ten weekend"));
  }
  if (["poprzedni weekend", "zeszły weekend"].includes(input)) {
    return Option.some(relativeWeekend(-1, "poprzedni weekend"));
  }
  if (["następny weekend", "przyszły weekend"].includes(input)) {
    return Option.some(relativeWeekend(1, "następny weekend"));
  }
  if (input === "weekend przed poprzednim") return Option.some(relativeWeekend(-2, input));
  if (input === "weekend po następnym") return Option.some(relativeWeekend(2, input));
  return Option.none<Period>();
};

const parsePeriod = (input: string) => {
  const edge = EffectString.match(/^(początek|koniec) (.+)$/u)(input);
  if (Option.isSome(edge)) {
    const period = parseBasePeriod(textAt(edge.value, 2));
    if (Option.isSome(period)) {
      const isEnd = textAt(edge.value, 1) === "koniec";
      const canonical = `${isEnd ? "koniec" : "początek"} ${period.value.canonical}`;
      return Option.some(
        isEnd ? periodEndDay(period.value, canonical) : periodStartDay(period.value, canonical),
      );
    }
  }
  const wrapper = ["w ", "przez ", "cały ", "całe "].find((prefix) => input.startsWith(prefix));
  return parseBasePeriod(wrapper === undefined ? input : input.slice(wrapper.length));
};

const countedUnit = (value: string) => unitAliases.find((entry) => entry[0] === value)?.[1];

const countedUnitPattern =
  "dzień|dni|tydzień|tygodnie|tygodni|miesiąc|miesiące|miesięcy|kwartał|kwartały|kwartałów|rok|lata|lat";
const countedPattern = (source: string) =>
  new RegExp(source.replace("UNIT", countedUnitPattern), "u");
const calendarPastPattern = countedPattern("^([1-9]\\d*) (UNIT) temu$");
const calendarFuturePattern = countedPattern("^za ([1-9]\\d*) (UNIT)$");
const rollingPastPatterns = [
  countedPattern("^(?:ostatni|ostatnie|ostatnich|miniony|minione|minionych) ([1-9]\\d*) (UNIT)$"),
];
const rollingFuturePatterns = [
  countedPattern("^(?:następny|następne|następnych|kolejny|kolejne|kolejnych) ([1-9]\\d*) (UNIT)$"),
];
const rollingBarePattern = countedPattern("^([1-9]\\d*) (UNIT)$");

const firstPatternMatch = (input: string, patterns: ReadonlyArray<RegExp>) =>
  Option.firstSomeOf(patterns.map((pattern) => EffectString.match(pattern)(input)));

const countNoun = (amount: number, entry: UnitForms) => {
  if (amount === 1) return entry.singular;
  const lastTwo = amount % 100;
  const last = amount % 10;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? entry.few : entry.many;
};

const parseCalendarOffset = (input: string) => {
  const past = EffectString.match(calendarPastPattern)(input);
  const future = EffectString.match(calendarFuturePattern)(input);
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
  const noun = countNoun(amount.value, entry);
  const canonical = direction < 0 ? `${amount.value} ${noun} temu` : `za ${amount.value} ${noun}`;
  return Option.some(candidate(periodRange(relativePeriod(unit, direction, canonical)), canonical));
};

const rollingModifier = (amount: number, future: boolean) => {
  if (amount === 1) return future ? "następny" : "ostatni";
  const lastTwo = amount % 100;
  const last = amount % 10;
  const isFew = last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14);
  if (isFew) return future ? "następne" : "ostatnie";
  return future ? "następnych" : "ostatnich";
};

const parseRollingPeriod = (input: string) => {
  const past = firstPatternMatch(input, rollingPastPatterns);
  const bare = EffectString.match(rollingBarePattern)(input);
  const future = firstPatternMatch(input, rollingFuturePatterns);
  const match = Option.firstSomeOf([past, bare, future]);
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
  const modifier = rollingModifier(amount.value, isFuture);
  return Option.some(
    candidate(range, `${modifier} ${amount.value} ${countNoun(amount.value, entry)}`),
  );
};

const boundaryCandidate = (input: string) => {
  const included = EffectString.match(/^do (.+) włącznie$/u)(input);
  if (Option.isSome(included)) {
    return openBoundaryCandidate(
      `do ${textAt(included.value, 1)}`,
      [["do ", "through"]],
      parsePeriod,
    );
  }
  return openBoundaryCandidate(
    input,
    [
      ["do początku ", "before"],
      ["począwszy od ", "since"],
      ["od ", "since"],
      ["przed ", "before"],
      ["do ", "through"],
      ["po ", "after"],
    ],
    parsePeriod,
  );
};

const parsePolish = (input: string) => {
  const remaining = remainingPhrases.find((entry) => entry.phrase === input);
  if (remaining !== undefined) {
    return Option.some(
      candidate(remainingPeriodRange(remaining.entry.unit), remaining.entry.remaining),
    );
  }
  if (["do dziś", "dotychczas", "do teraz"].includes(input)) {
    return Option.some(candidate(untilNowRange(), "do dziś"));
  }
  if (["od teraz", "od dziś"].includes(input)) {
    return Option.some(candidate(fromNowRange(), "od teraz"));
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
      ["od ", " do dziś"],
      ["między ", " a dziś"],
    ],
    ["od dziś do ", "między dziś a "],
    parsePeriod,
    (period) => `od ${period} do dziś`,
    (period) => `od dziś do ${period}`,
  );
  if (Option.isSome(nowBounded)) return nowBounded;

  const bounded = joinedPeriodCandidate(
    input,
    [
      ["od ", " do "],
      ["między ", " a "],
      ["", " - "],
      ["", " – "],
      ["", " — "],
    ],
    parsePeriod,
    (lower, upper) => `od ${lower} do ${upper} włącznie`,
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
  "ten weekend",
  "poprzedni weekend",
  "następny weekend",
  "weekend przed poprzednim",
  "weekend po następnym",
  ...periodAliases.flatMap((entry) => [`początek ${entry[0]}`, `koniec ${entry[0]}`]),
  ...[1, 2, 3, 4].flatMap((quarter) => [
    `q${quarter}`,
    `q${quarter} tego roku`,
    `q${quarter} poprzedniego roku`,
    `q${quarter} następnego roku`,
  ]),
  ...months.flatMap((month) => [month, `${month} poprzedniego roku`, `${month} następnego roku`]),
];

const staticPeriods = periodsFromPhrases(staticPeriodPhrases, parsePeriod);
const boundaryPrefixes = ["od ", "począwszy od ", "przed ", "do ", "po "];

const countedSuggestions = (input: string) => {
  const amount = naturalCount(input);
  if (amount === undefined) return [];
  return units.flatMap((entry) => {
    const noun = countNoun(amount, entry);
    return [
      `${rollingModifier(amount, false)} ${amount} ${noun}`,
      `${amount} ${noun}`,
      `${rollingModifier(amount, true)} ${amount} ${noun}`,
      `${amount} ${noun} temu`,
      `za ${amount} ${noun}`,
    ];
  });
};

const polishSuggestionPhrases = [
  ...units.map((entry) => entry.toDate),
  ...units.map((entry) => entry.remaining),
  ...staticPeriodPhrases,
  ...prefixNaturalPhrases(staticPeriodPhrases, boundaryPrefixes),
  "do dziś",
  "od teraz",
];

const suggestPolish = (input: string, limit: number) => {
  const fixed = fixedCalendarPeriodPhrases(input, months);
  return completeNaturalPhrases(
    input,
    [
      ...polishSuggestionPhrases,
      ...fixed,
      ...prefixNaturalPhrases(fixed, boundaryPrefixes),
      ...countedSuggestions(input),
    ],
    limit,
  );
};

const renderPolish = (range: DateRangeExpr) => {
  const offset = calendarPeriodOffset(range);
  if (Option.isSome(offset) && Math.abs(offset.value.amount) > 1) {
    const entry = units.find((unit) => unit.unit === offset.value.unit);
    if (entry !== undefined) {
      const amount = Math.abs(offset.value.amount);
      const noun = countNoun(amount, entry);
      return Option.some(
        offset.value.amount < 0 ? `${amount} ${noun} temu` : `za ${amount} ${noun}`,
      );
    }
  }
  const future = futurePeriod(range);
  if (Option.isSome(future)) {
    const entry = units.find((unit) => unit.unit === future.value.unit);
    if (entry !== undefined) {
      return Option.some(
        `${rollingModifier(future.value.amount, true)} ${future.value.amount} ${countNoun(future.value.amount, entry)}`,
      );
    }
  }
  const trailing = trailingPeriod(range);
  if (Option.isSome(trailing)) {
    const entry = units.find((unit) => unit.unit === trailing.value.unit);
    if (entry !== undefined) {
      return Option.some(
        `${rollingModifier(trailing.value.amount, false)} ${trailing.value.amount} ${countNoun(trailing.value.amount, entry)}`,
      );
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
    (period) => `od ${withMonthCase(period, monthGenitives)}`,
    (period) => `przed ${withMonthCase(period, monthInstrumentals)}`,
    (period) => `do ${withMonthCase(period, monthGenitives)} włącznie`,
    (period) => `po ${withMonthCase(period, monthLocatives)}`,
    (lower, upper) =>
      `od ${withMonthCase(lower, monthGenitives)} do ${withMonthCase(upper, monthGenitives)} włącznie`,
    (period) => `od ${withMonthCase(period, monthGenitives)} do dziś`,
    (period) => `od dziś do ${withMonthCase(period, monthGenitives)}`,
    () => "do dziś",
    () => "od teraz",
  );
};

export const PolishContribution = new BaseLanguageContribution({
  locale: "pl",
  vocabulary: [
    ...months,
    ...monthGenitives,
    ...monthInstrumentals,
    ...monthLocatives,
    ...monthAbbreviations.flatMap((aliases) => aliases),
    ...units.flatMap((entry) => [
      entry.singular,
      entry.few,
      entry.many,
      ...entry.current.split(" "),
      ...entry.previous.split(" "),
      ...entry.next.split(" "),
    ]),
    ...toDatePhrases.flatMap((entry) => entry.phrase.split(" ")),
    ...remainingPhrases.flatMap((entry) => entry.phrase.split(" ")),
    "dziś",
    "dotychczas",
    "koniec",
    "kolejne",
    "między",
    "minione",
    "następne",
    "od",
    "ostatnie",
    "po",
    "początek",
    "począwszy",
    "poprzedni",
    "przed",
    "teraz",
    "temu",
    "włącznie",
    "za",
  ],
  normalize: normalizeNaturalText,
  correct: correctWhitespaceSeparatedText,
  parseExact: parsePolish,
  suggest: suggestPolish,
  render: renderPolish,
});

export const PolishLanguage = defineLanguagePlugin({
  id: "chronolizer/language-pl",
  effect: (context) =>
    Effect.asVoid(context.register("chronolizer/language-pl", PolishContribution)),
});

export const PolishLanguageLayer = languagePluginsLayer([PolishLanguage]);
