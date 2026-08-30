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

const weekdays = ["pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota", "neděle"] as const;
const weekdayGenitives = [
  "pondělí",
  "úterý",
  "středy",
  "čtvrtka",
  "pátku",
  "soboty",
  "neděle",
] as const;
const nextWeekdays = weekdays.flatMap((weekday, day) => [
  { phrase: `příští ${weekday}`, day, canonical: `příští ${weekday}` },
  {
    phrase: `příštího ${textAt(weekdayGenitives, day)}`,
    day,
    canonical: `příští ${weekday}`,
  },
]);

const czechCountWords = [
  ["dva", "dvě", "dvou", "dvěma"],
  ["tři", "tří", "třemi"],
  ["čtyři", "čtyř", "čtyřmi"],
  ["pět", "pěti"],
  ["šest", "šesti"],
  ["sedm", "sedmi"],
  ["osm", "osmi"],
  ["devět", "devíti"],
  ["deset", "deseti"],
  ["jedenáct", "jedenácti"],
  ["dvanáct", "dvanácti"],
  ["třináct", "třinácti"],
  ["čtrnáct", "čtrnácti"],
  ["patnáct", "patnácti"],
  ["šestnáct", "šestnácti"],
  ["sedmnáct", "sedmnácti"],
  ["osmnáct", "osmnácti"],
  ["devatenáct", "devatenácti"],
  ["dvacet", "dvaceti"],
] as const;
const czechCountOnes = [
  [1, "jedna"],
  [2, "dva"],
  [3, "tři"],
  [4, "čtyři"],
  [5, "pět"],
  [6, "šest"],
  [7, "sedm"],
  [8, "osm"],
  [9, "devět"],
] as const;
const czechObliqueCountOnes = [
  [1, "jedním"],
  [2, "dvěma"],
  [3, "třemi"],
  [4, "čtyřmi"],
  [5, "pěti"],
  [6, "šesti"],
  [7, "sedmi"],
  [8, "osmi"],
  [9, "devíti"],
] as const;
const czechCountAliases = [
  ...sequentialCountAliases([["jeden", "jedna", "jedno", "jedním", "jednou"]], 1),
  ...sequentialCountAliases(czechCountWords, 2),
  ...compoundCountAliases(
    decimalTens([
      "dvacet",
      "třicet",
      "čtyřicet",
      "padesát",
      "šedesát",
      "sedmdesát",
      "osmdesát",
      "devadesát",
    ]),
    czechCountOnes,
    (ten, one) => [`${ten} ${one}`],
  ),
  ...compoundCountAliases(
    decimalTens([
      "dvaceti",
      "třiceti",
      "čtyřiceti",
      "padesáti",
      "šedesáti",
      "sedmdesáti",
      "osmdesáti",
      "devadesáti",
    ]),
    czechObliqueCountOnes,
    (ten, one) => [`${ten} ${one}`],
  ),
];
const normalizeCzechCounts = compileCountAliasNormalizer(czechCountAliases);
const czechCountVocabulary = new Set(countAliasVocabulary(czechCountAliases));
const correctCzech = (input: string, vocabulary: ReadonlyArray<string>) =>
  correctWhitespaceSeparatedText(input, vocabulary, czechCountVocabulary);
const normalizeCzech = (input: string, locale: string) =>
  normalizeCzechCounts(normalizeNaturalText(input, locale));

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
  readonly durationGenitive: string;
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
    durationGenitive: "dne",
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
    durationGenitive: "týdne",
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
    durationGenitive: "měsíce",
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
    durationGenitive: "čtvrtletí",
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
    durationGenitive: "roku",
    current: "tento rok",
    previous: "minulý rok",
    next: "příští rok",
    toDate: "rok dosud",
    remaining: "zbytek roku",
  },
];

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

const currentDateLabel = (day: number, month: number) =>
  `${day}. ${textAt(monthGenitives, month - 1)}`;

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

  const current = EffectString.match(/^([0-3]?\d)\.? ([a-záčďéěíňóřšťúůýž]+\.?)$/u)(input);
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
  const absoluteDate = absoluteDatePeriod(input, "cs");
  if (Option.isSome(absoluteDate)) return absoluteDate;
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
      return Option.some(fixedMonthPeriod(year, month, `${textAt(months, month - 1)} ${year}`));
    }
  }

  const prefixedRelativeMonth = EffectString.match(
    /^(minulý|tento|příští) ([a-záčďéěíňóřšťúůýž]+\.?)$/u,
  )(input);
  if (Option.isSome(prefixedRelativeMonth)) {
    const month = monthNumber(textAt(prefixedRelativeMonth.value, 2));
    if (month !== undefined) {
      const modifier = textAt(prefixedRelativeMonth.value, 1);
      const direction = relativeYearDirection(modifier);
      return Option.some(
        monthOfRelativeYear(month, direction, `${modifier} ${textAt(months, month - 1)}`),
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

  const weekday = nextWeekdays.find((entry) => entry.phrase === input);
  return weekday === undefined
    ? Option.none<Period>()
    : Option.some(relativeWeekday(weekday.day, 1, weekday.canonical));
};

// RETURN TYPE: Recursive period offsets require an explicit result type.
const parsePeriod = (input: string): Option.Option<Period> => {
  const shifted = EffectString.match(
    /^(.+) (před|za) ([1-9]\d*) (den|dny|dnů|dnem|týden|týdny|týdnů|týdnem|měsíc|měsíce|měsíců|měsícem|měsíci|čtvrtletí|čtvrtletím|čtvrtletími|rok|roky|let|rokem|lety)$/u,
  )(input);
  if (Option.isSome(shifted)) {
    const amount = parseTrailingCount(textAt(shifted.value, 3));
    const alias = unitAliases.find((unit) => unit[0] === textAt(shifted.value, 4));
    const entry = alias === undefined ? undefined : units.find((unit) => unit.unit === alias[1]);
    const period = parsePeriod(textAt(shifted.value, 1));
    if (Option.isSome(amount) && entry !== undefined && Option.isSome(period)) {
      const past = textAt(shifted.value, 2) === "před";
      const direction = past ? -amount.value : amount.value;
      const pastNoun = amount.value === 1 ? entry.pastSingular : entry.pastPlural;
      const noun = past ? pastNoun : countNoun(amount.value, entry);
      const canonical = `${period.value.canonical} ${past ? "před" : "za"} ${amount.value} ${noun}`;
      return Option.some(shiftPeriod(period.value, direction, entry.unit, canonical));
    }
  }

  const edge = EffectString.match(/^(začátek|počátek|konec) (.+)$/u)(input);
  if (Option.isSome(edge)) {
    const periodText = textAt(edge.value, 2);
    const basePeriod = parseBasePeriod(periodText);
    const implicit = units.find((entry) => entry.durationGenitive === periodText);
    const period =
      Option.isSome(basePeriod) || implicit === undefined
        ? basePeriod
        : Option.some(relativePeriod(implicit.unit, 0, implicit.current));
    if (Option.isSome(period)) {
      const isEnd = textAt(edge.value, 1) === "konec";
      const canonical = `${isEnd ? "konec" : "začátek"} ${period.value.canonical}`;
      return Option.some(
        isEnd ? periodEndDay(period.value, canonical) : periodStartDay(period.value, canonical),
      );
    }
  }
  const wrapper = ["během ", "v ", "celý ", "celé "].find((prefix) => input.startsWith(prefix));
  const base = parseBasePeriod(wrapper === undefined ? input : input.slice(wrapper.length));
  return Option.isSome(base) ? base : parseCalendarOffset(input);
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

const singularRollingPhrases = units.flatMap((entry) => [
  { phrase: `poslední ${entry.singular}`, entry, future: false },
  { phrase: `během posledního ${entry.durationGenitive}`, entry, future: false },
  { phrase: `během následujícího ${entry.durationGenitive}`, entry, future: true },
]);

const singularRollingCanonical = (entry: UnitForms, future: boolean) =>
  `během ${future ? "následujícího" : "posledního"} ${entry.durationGenitive}`;

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
  if (Option.isNone(match)) return Option.none<Period>();
  const amount = parseTrailingCount(textAt(match.value, 1));
  const unit = countedUnit(textAt(match.value, 2));
  if (Option.isNone(amount) || unit === undefined) return Option.none<Period>();
  const entry = units.find((item) => item.unit === unit);
  if (entry === undefined) return Option.none<Period>();
  const direction = Option.isSome(past) ? -amount.value : amount.value;
  const futureNoun = countNoun(amount.value, entry);
  const pastNoun = amount.value === 1 ? entry.pastSingular : entry.pastPlural;
  const canonical =
    direction < 0 ? `před ${amount.value} ${pastNoun}` : `za ${amount.value} ${futureNoun}`;
  return Option.some(relativePeriod(unit, direction, canonical));
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
  const unit = countedUnit(textAt(match.value, 2));
  if (Option.isNone(amount) || unit === undefined) {
    return Option.none<ReturnType<typeof candidate>>();
  }
  const entry = units.find((item) => item.unit === unit);
  if (entry === undefined) return Option.none<ReturnType<typeof candidate>>();
  const isFuture = Option.isSome(future);
  const range = isFuture ? futureRange(amount.value, unit) : trailingRange(amount.value, unit);
  if (amount.value === 1) {
    return Option.some(candidate(range, singularRollingCanonical(entry, isFuture)));
  }
  const modifier = isFuture ? "příští" : "poslední";
  return Option.some(
    candidate(range, `${modifier} ${amount.value} ${countNoun(amount.value, entry)}`),
  );
};

const parseElidedDateRange = (input: string) => {
  const joined = EffectString.match(
    /^od ([0-3]?\d)\.?(?: do) ([0-3]?\d)\.? ([a-záčďéěíňóřšťúůýž]+\.?)(?: (\d{4}))?$/u,
  )(input);
  const dashed = EffectString.match(
    /^([0-3]?\d)\.?[–—-]([0-3]?\d)\.? ([a-záčďéěíňóřšťúůýž]+\.?)(?: (\d{4}))?$/u,
  )(input);
  const match = Option.firstSomeOf([joined, dashed]);
  if (Option.isNone(match)) return Option.none<ReturnType<typeof candidate>>();
  const lowerDay = textAt(match.value, 1);
  const upperDay = textAt(match.value, 2);
  const month = textAt(match.value, 3);
  const year = textAt(match.value, 4);
  const suffix = year.length === 0 ? "" : ` ${year}`;
  return joinedPeriodCandidate(
    `od ${lowerDay}. ${month}${suffix} do ${upperDay}. ${month}${suffix}`,
    [["od ", " do "]],
    parsePeriod,
    (lower, upper) => `od ${lower} do ${upper} včetně`,
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
      ["od ", " do dneška"],
      ["mezi ", " a dneškem"],
    ],
    ["od dneška do ", "mezi dneškem a ", "dnešek až "],
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
  return parsePeriod(input).pipe(
    Option.map((period) => candidate(periodRange(period), period.canonical)),
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
  ...nextWeekdays.map((entry) => entry.phrase),
  ...months.flatMap((month) => [`minulý ${month}`, `příští ${month}`]),
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
  ...singularRollingPhrases.map((entry) => entry.phrase),
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

// RETURN TYPE: Recursive shifted-period rendering requires an explicit result type.
const renderCzech = (range: DateRangeExpr): Option.Option<string> => {
  const shifted = decomposeShiftedPeriodRange(range);
  if (Option.isSome(shifted)) {
    const base = renderCzech(shifted.value.baseRange);
    const entry = units.find((unit) => unit.unit === shifted.value.unit);
    if (Option.isSome(base) && entry !== undefined) {
      const amount = Math.abs(shifted.value.amount);
      const pastNoun = amount === 1 ? entry.pastSingular : entry.pastPlural;
      const noun = shifted.value.amount < 0 ? pastNoun : countNoun(amount, entry);
      const direction = shifted.value.amount < 0 ? "před" : "za";
      return Option.some(`${base.value} ${direction} ${amount} ${noun}`);
    }
  }

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
      return Option.some(
        future.value.amount === 1
          ? singularRollingCanonical(entry, true)
          : `příští ${future.value.amount} ${countNoun(future.value.amount, entry)}`,
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
          : `poslední ${trailing.value.amount} ${countNoun(trailing.value.amount, entry)}`,
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
    ...weekdays,
    ...weekdayGenitives,
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
  normalize: normalizeCzech,
  correct: correctCzech,
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
