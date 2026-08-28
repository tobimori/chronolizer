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
  "leden",
  "únor",
  "březen",
  "duben",
  "květen",
  "červen",
  "červenec",
  "srpen",
  "září",
  "říjen",
  "listopad",
  "prosinec",
] as const;

const monthGenitives = [
  "ledna",
  "února",
  "března",
  "dubna",
  "května",
  "června",
  "července",
  "srpna",
  "září",
  "října",
  "listopadu",
  "prosince",
] as const;

const monthInstrumentals = [
  "lednem",
  "únorem",
  "březnem",
  "dubnem",
  "květnem",
  "červnem",
  "červencem",
  "srpnem",
  "zářím",
  "říjnem",
  "listopadem",
  "prosincem",
] as const;

const monthLocatives = [
  "lednu",
  "únoru",
  "březnu",
  "dubnu",
  "květnu",
  "červnu",
  "červenci",
  "srpnu",
  "září",
  "říjnu",
  "listopadu",
  "prosinci",
] as const;

const monthAbbreviations = [
  ["led"],
  ["úno", "uno"],
  ["bře", "bre"],
  ["dub"],
  ["kvě", "kve"],
  ["čvn", "cvn"],
  ["čvc", "cvc"],
  ["srp"],
  ["zář", "zar"],
  ["říj", "rij"],
  ["lis"],
  ["pro"],
] as const;

interface UnitForms {
  readonly unit: Unit;
  readonly singular: string;
  readonly few: string;
  readonly many: string;
  readonly pastSingular: string;
  readonly pastPlural: string;
  readonly current: string;
  readonly previous: string;
  readonly next: string;
  readonly toDate: string;
  readonly remaining: string;
}

const units: ReadonlyArray<UnitForms> = [
  {
    unit: "day",
    singular: "den",
    few: "dny",
    many: "dnů",
    pastSingular: "dnem",
    pastPlural: "dny",
    current: "dnes",
    previous: "včera",
    next: "zítra",
    toDate: "dnešek dosud",
    remaining: "zbytek dne",
  },
  {
    unit: "week",
    singular: "týden",
    few: "týdny",
    many: "týdnů",
    pastSingular: "týdnem",
    pastPlural: "týdny",
    current: "tento týden",
    previous: "minulý týden",
    next: "příští týden",
    toDate: "týden dosud",
    remaining: "zbytek týdne",
  },
  {
    unit: "month",
    singular: "měsíc",
    few: "měsíce",
    many: "měsíců",
    pastSingular: "měsícem",
    pastPlural: "měsíci",
    current: "tento měsíc",
    previous: "minulý měsíc",
    next: "příští měsíc",
    toDate: "měsíc dosud",
    remaining: "zbytek měsíce",
  },
  {
    unit: "quarter",
    singular: "čtvrtletí",
    few: "čtvrtletí",
    many: "čtvrtletí",
    pastSingular: "čtvrtletím",
    pastPlural: "čtvrtletími",
    current: "toto čtvrtletí",
    previous: "minulé čtvrtletí",
    next: "příští čtvrtletí",
    toDate: "čtvrtletí dosud",
    remaining: "zbytek čtvrtletí",
  },
  {
    unit: "year",
    singular: "rok",
    few: "roky",
    many: "let",
    pastSingular: "rokem",
    pastPlural: "lety",
    current: "tento rok",
    previous: "minulý rok",
    next: "příští rok",
    toDate: "rok dosud",
    remaining: "zbytek roku",
  },
];

const title = (value: string) => `${value.slice(0, 1).toLocaleUpperCase("cs")}${value.slice(1)}`;

const unitAliases = [
  ["den", "day"],
  ["dny", "day"],
  ["dnů", "day"],
  ["dnem", "day"],
  ["týden", "week"],
  ["týdny", "week"],
  ["týdnů", "week"],
  ["týdnem", "week"],
  ["měsíc", "month"],
  ["měsíce", "month"],
  ["měsíců", "month"],
  ["měsícem", "month"],
  ["měsíci", "month"],
  ["čtvrtletí", "quarter"],
  ["čtvrtletím", "quarter"],
  ["čtvrtletími", "quarter"],
  ["rok", "year"],
  ["roky", "year"],
  ["let", "year"],
  ["rokem", "year"],
  ["lety", "year"],
] as const satisfies ReadonlyArray<readonly [string, Unit]>;

const periodAliases = [
  ...units.flatMap((entry) => [
    [entry.current, entry.unit, 0, entry.current] as const,
    [entry.previous, entry.unit, -1, entry.previous] as const,
    [entry.next, entry.unit, 1, entry.next] as const,
  ]),
  ["tohoto týdne", "week", 0, "tento týden"],
  ["minulého týdne", "week", -1, "minulý týden"],
  ["příštího týdne", "week", 1, "příští týden"],
  ["tohoto měsíce", "month", 0, "tento měsíc"],
  ["minulého měsíce", "month", -1, "minulý měsíc"],
  ["příštího měsíce", "month", 1, "příští měsíc"],
  ["tohoto čtvrtletí", "quarter", 0, "toto čtvrtletí"],
  ["minulého čtvrtletí", "quarter", -1, "minulé čtvrtletí"],
  ["příštího čtvrtletí", "quarter", 1, "příští čtvrtletí"],
  ["tohoto roku", "year", 0, "tento rok"],
  ["minulého roku", "year", -1, "minulý rok"],
  ["příštího roku", "year", 1, "příští rok"],
  ["předevčírem", "day", -2, "předevčírem"],
  ["pozítří", "day", 2, "pozítří"],
  ["předminulý týden", "week", -2, "předminulý týden"],
  ["přespříští týden", "week", 2, "přespříští týden"],
  ["předminulý měsíc", "month", -2, "předminulý měsíc"],
  ["přespříští měsíc", "month", 2, "přespříští měsíc"],
  ["předminulé čtvrtletí", "quarter", -2, "předminulé čtvrtletí"],
  ["přespříští čtvrtletí", "quarter", 2, "přespříští čtvrtletí"],
  ["předminulý rok", "year", -2, "předminulý rok"],
  ["přespříští rok", "year", 2, "přespříští rok"],
] as const satisfies ReadonlyArray<readonly [string, Unit, number, string]>;

const toDatePhrases = units.flatMap((entry) => {
  const yearAliases =
    entry.unit === "year"
      ? ["od začátku roku", "od počátku roku", "od začátku roku do dneška", "letos dosud"]
      : [];
  return [entry.toDate, `${entry.current} dosud`, ...yearAliases].map((phrase) => ({
    entry,
    phrase,
  }));
});

const remainingPhrases = units.map((entry) => ({ entry, phrase: entry.remaining }));

const relativeYearDirection = (value: string) => {
  if (value.includes("minul")) return -1;
  if (value.includes("příšt")) return 1;
  return 0;
};

const relativeYearName = (direction: number) => {
  if (direction < 0) return "minulého roku";
  if (direction > 0) return "příštího roku";
  return "tohoto roku";
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

const parseNamedDate = (input: string) => {
  const named = EffectString.match(/^([0-3]?\d)\.?(?: )([a-záčďéěíňóřšťúůýž]+\.?) (\d{4})$/u)(
    input,
  );
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
  if (value.startsWith("q") && value.length === 2) {
    return Number(value.slice(1));
  }
  if (value === "1." || value === "první") return 1;
  if (value === "2." || value === "druhé") return 2;
  if (value === "3." || value === "třetí") return 3;
  return value === "4." || value === "čtvrté" ? 4 : undefined;
};

const parseQuarter = (input: string) => {
  const fixed = EffectString.match(
    /^(q[1-4]|1\.|první|2\.|druhé|3\.|třetí|4\.|čtvrté)(?: čtvrtletí)? (\d{4})$/u,
  )(input);
  if (Option.isSome(fixed)) {
    const quarter = quarterNumber(textAt(fixed.value, 1));
    const year = validYear(textAt(fixed.value, 2));
    if (quarter !== undefined && year !== undefined) {
      return Option.some(fixedQuarterPeriod(year, quarter, `Q${quarter} ${year}`));
    }
  }
  const relative = EffectString.match(/^(q[1-4]) (minulého roku|příštího roku|tohoto roku)$/u)(
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

  const monthYear = EffectString.match(/^([a-záčďéěíňóřšťúůýž]+\.?) (\d{4})$/u)(input);
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
    /^([a-záčďéěíňóřšťúůýž]+\.?) (minulého roku|příštího roku|tohoto roku)$/u,
  )(input);
  const relativeMonthYearFirst = EffectString.match(
    /^(minulého roku|příštího roku|tohoto roku) ([a-záčďéěíňóřšťúůýž]+\.?)$/u,
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

  if (["víkend", "tento víkend"].includes(input)) {
    return Option.some(relativeWeekend(0, "tento víkend"));
  }
  if (["minulý víkend", "předchozí víkend"].includes(input)) {
    return Option.some(relativeWeekend(-1, "minulý víkend"));
  }
  if (["příští víkend", "následující víkend"].includes(input)) {
    return Option.some(relativeWeekend(1, "příští víkend"));
  }
  if (input === "předminulý víkend") return Option.some(relativeWeekend(-2, input));
  if (input === "přespříští víkend") return Option.some(relativeWeekend(2, input));
  return Option.none<Period>();
};

const parsePeriod = (input: string) => {
  const edge = EffectString.match(/^(začátek|počátek|konec) (.+)$/u)(input);
  if (Option.isSome(edge)) {
    const period = parseBasePeriod(textAt(edge.value, 2));
    if (Option.isSome(period)) {
      const isEnd = textAt(edge.value, 1) === "konec";
      const canonical = `${isEnd ? "konec" : "začátek"} ${period.value.canonical}`;
      return Option.some(
        isEnd ? periodEndDay(period.value, canonical) : periodStartDay(period.value, canonical),
      );
    }
  }
  const wrapper = ["během ", "v ", "celý ", "celé "].find((prefix) => input.startsWith(prefix));
  return parseBasePeriod(wrapper === undefined ? input : input.slice(wrapper.length));
};

const countedUnit = (value: string) => unitAliases.find((entry) => entry[0] === value)?.[1];

const countedUnitPattern =
  "den|dny|dnů|dnem|týden|týdny|týdnů|týdnem|měsíc|měsíce|měsíců|měsícem|měsíci|čtvrtletí|čtvrtletím|čtvrtletími|rok|roky|let|rokem|lety";
const countedPattern = (source: string) =>
  new RegExp(source.replace("UNIT", countedUnitPattern), "u");
const calendarPastPattern = countedPattern("^před ([1-9]\\d*) (UNIT)$");
const calendarFuturePatterns = [countedPattern("^za ([1-9]\\d*) (UNIT)$")];
const rollingPastPatterns = [
  countedPattern("^(?:poslední|posledních|uplynulé|uplynulých) ([1-9]\\d*) (UNIT)$"),
];
const rollingFuturePatterns = [countedPattern("^(?:příští|následující) ([1-9]\\d*) (UNIT)$")];
const rollingSincePattern = countedPattern("^za poslední ([1-9]\\d*) (UNIT)$");
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
  const futureNoun = countNoun(amount.value, entry);
  const pastNoun = amount.value === 1 ? entry.pastSingular : entry.pastPlural;
  const canonical =
    direction < 0 ? `před ${amount.value} ${pastNoun}` : `za ${amount.value} ${futureNoun}`;
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
  const modifier = isFuture ? "příští" : "poslední";
  return Option.some(
    candidate(range, `${modifier} ${amount.value} ${countNoun(amount.value, entry)}`),
  );
};

const boundaryCandidate = (input: string) => {
  const included = EffectString.match(/^do (.+) včetně$/u)(input);
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
      ["do začátku ", "before"],
      ["počínaje ", "since"],
      ["od ", "since"],
      ["před ", "before"],
      ["do ", "through"],
      ["po ", "after"],
    ],
    parsePeriod,
  );
};

const parseCzech = (input: string) => {
  const remaining = remainingPhrases.find((entry) => entry.phrase === input);
  if (remaining !== undefined) {
    return Option.some(
      candidate(remainingPeriodRange(remaining.entry.unit), remaining.entry.remaining),
    );
  }
  if (["do dneška", "dosud", "do současnosti"].includes(input)) {
    return Option.some(candidate(untilNowRange(), "dosud"));
  }
  if (["od nynějška", "ode dneška", "od teď"].includes(input)) {
    return Option.some(candidate(fromNowRange(), "od nynějška"));
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
      ["od ", " do dneška"],
      ["mezi ", " a dneškem"],
    ],
    ["od dneška do ", "mezi dneškem a "],
    parsePeriod,
    (period) => `od ${period} do dneška`,
    (period) => `od dneška do ${period}`,
  );
  if (Option.isSome(nowBounded)) return nowBounded;

  const bounded = joinedPeriodCandidate(
    input,
    [
      ["od ", " do "],
      ["mezi ", " a "],
      ["", " - "],
      ["", " – "],
      ["", " — "],
    ],
    parsePeriod,
    (lower, upper) => `od ${lower} do ${upper} včetně`,
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
  "tento víkend",
  "minulý víkend",
  "příští víkend",
  "předminulý víkend",
  "přespříští víkend",
  ...periodAliases.flatMap((entry) => [`začátek ${entry[0]}`, `konec ${entry[0]}`]),
  ...[1, 2, 3, 4].flatMap((quarter) => [
    `q${quarter}`,
    `q${quarter} tohoto roku`,
    `q${quarter} minulého roku`,
    `q${quarter} příštího roku`,
  ]),
  ...months.flatMap((month) => [month, `${month} minulého roku`, `${month} příštího roku`]),
];

const staticPeriods = periodsFromPhrases(staticPeriodPhrases, parsePeriod);
const boundaryPrefixes = ["od ", "počínaje ", "před ", "do ", "po "];

const countedSuggestions = (input: string) => {
  const amount = naturalCount(input);
  if (amount === undefined) return [];
  return units.flatMap((entry) => {
    const noun = countNoun(amount, entry);
    const pastNoun = amount === 1 ? entry.pastSingular : entry.pastPlural;
    return [
      `poslední ${amount} ${noun}`,
      `uplynulé ${amount} ${noun}`,
      `${amount} ${noun}`,
      `příští ${amount} ${noun}`,
      `následující ${amount} ${noun}`,
      `před ${amount} ${pastNoun}`,
      `za ${amount} ${noun}`,
    ];
  });
};

const czechSuggestionPhrases = [
  ...units.map((entry) => entry.toDate),
  ...units.map((entry) => entry.remaining),
  ...staticPeriodPhrases,
  ...prefixNaturalPhrases(staticPeriodPhrases, boundaryPrefixes),
  "dosud",
  "od nynějška",
];

const suggestCzech = (input: string, limit: number) => {
  const fixed = fixedCalendarPeriodPhrases(input, months);
  return completeNaturalPhrases(
    input,
    [
      ...czechSuggestionPhrases,
      ...fixed,
      ...prefixNaturalPhrases(fixed, boundaryPrefixes),
      ...countedSuggestions(input),
    ],
    limit,
  );
};

const renderCzech = (range: DateRangeExpr) => {
  const offset = calendarPeriodOffset(range);
  if (Option.isSome(offset) && Math.abs(offset.value.amount) > 1) {
    const entry = units.find((unit) => unit.unit === offset.value.unit);
    if (entry !== undefined) {
      const amount = Math.abs(offset.value.amount);
      const noun = countNoun(amount, entry);
      const pastNoun = amount === 1 ? entry.pastSingular : entry.pastPlural;
      return Option.some(
        offset.value.amount < 0 ? `před ${amount} ${pastNoun}` : `za ${amount} ${noun}`,
      );
    }
  }
  const future = futurePeriod(range);
  if (Option.isSome(future)) {
    const entry = units.find((unit) => unit.unit === future.value.unit);
    if (entry !== undefined) {
      return Option.some(`příští ${future.value.amount} ${countNoun(future.value.amount, entry)}`);
    }
  }
  const trailing = trailingPeriod(range);
  if (Option.isSome(trailing)) {
    const entry = units.find((unit) => unit.unit === trailing.value.unit);
    if (entry !== undefined) {
      return Option.some(
        `poslední ${trailing.value.amount} ${countNoun(trailing.value.amount, entry)}`,
      );
    }
  }
  const periods = [
    ...staticPeriods,
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
    (period) => `od ${period}`,
    (period) => `před ${period}`,
    (period) => `do ${period} včetně`,
    (period) => `po ${period}`,
    (lower, upper) => `od ${lower} do ${upper} včetně`,
    (period) => `od ${period} do dneška`,
    (period) => `od dneška do ${period}`,
    () => "dosud",
    () => "od nynějška",
  );
};

export const CzechContribution = new BaseLanguageContribution({
  locale: "cs",
  vocabulary: [
    ...months,
    ...monthAbbreviations.flatMap((aliases) => aliases),
    ...units.flatMap((entry) => [
      entry.singular,
      entry.few,
      entry.many,
      entry.pastSingular,
      entry.pastPlural,
      ...entry.current.split(" "),
      ...entry.previous.split(" "),
      ...entry.next.split(" "),
    ]),
    ...toDatePhrases.flatMap((entry) => entry.phrase.split(" ")),
    ...remainingPhrases.flatMap((entry) => entry.phrase.split(" ")),
    "dosud",
    "dneška",
    "konec",
    "mezi",
    "minulý",
    "následující",
    "nynějška",
    "od",
    "počínaje",
    "poslední",
    "před",
    "příští",
    "uplynulé",
    "včetně",
    "začátek",
    "zbytek",
  ],
  normalize: normalizeNaturalText,
  correct: correctWhitespaceSeparatedText,
  parseExact: parseCzech,
  suggest: suggestCzech,
  render: renderCzech,
});

export const CzechLanguage = defineLanguagePlugin({
  id: "chronolizer/language-cs",
  effect: (context) =>
    Effect.asVoid(context.register("chronolizer/language-cs", CzechContribution)),
});

export const CzechLanguageLayer = languagePluginsLayer([CzechLanguage]);
