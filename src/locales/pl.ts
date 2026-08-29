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
const polishCountWords = [
  ["dwa", "dwie", "dwóch"],
  ["trzy"],
  ["cztery"],
  ["pi\u0119\u0107"],
  ["sześć"],
  ["siedem"],
  ["osiem"],
  ["dziewięć"],
  ["dziesięć"],
  ["jedenaście"],
  ["dwanaście"],
  ["trzynaście"],
  ["czternaście"],
  ["piętnaście"],
  ["szesnaście"],
  ["siedemnaście"],
  ["osiemnaście"],
  ["dziewiętnaście"],
  ["dwadzieścia"],
] as const;
const polishCountOnes = [
  [1, "jeden"],
  [2, "dwa"],
  [3, "trzy"],
  [4, "cztery"],
  [5, "pi\u0119\u0107"],
  [6, "sześć"],
  [7, "siedem"],
  [8, "osiem"],
  [9, "dziewięć"],
] as const;
const polishCountAliases = [
  ...sequentialCountAliases([["jeden", "jedna", "jedno"]], 1),
  ...sequentialCountAliases(polishCountWords, 2),
  ...compoundCountAliases(
    decimalTens([
      "dwadzieścia",
      "trzydzieści",
      "czterdzieści",
      "pięćdziesiąt",
      "sześćdziesiąt",
      "siedemdziesiąt",
      "osiemdziesiąt",
      "dziewięćdziesiąt",
    ]),
    polishCountOnes,
    (ten, one) => [`${ten} ${one}`],
  ),
];
const normalizePolishCounts = compileCountAliasNormalizer(polishCountAliases);
const polishCountVocabulary = new Set(countAliasVocabulary(polishCountAliases));
const correctPolish = (input: string, vocabulary: ReadonlyArray<string>) =>
  correctWhitespaceSeparatedText(input, vocabulary, polishCountVocabulary);
const normalizePolish = (input: string, locale: string) =>
  normalizePolishCounts(normalizeNaturalText(input, locale));

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
    toDate: "od początku dnia",
    remaining: "do końca tego dnia",
  },
  {
    unit: "week",
    singular: "tydzień",
    few: "tygodnie",
    many: "tygodni",
    current: "ten tydzień",
    previous: "poprzedni tydzień",
    next: "następny tydzień",
    toDate: "od początku tygodnia",
    remaining: "do końca tego tygodnia",
  },
  {
    unit: "month",
    singular: "miesiąc",
    few: "miesiące",
    many: "miesięcy",
    current: "ten miesiąc",
    previous: "poprzedni miesiąc",
    next: "następny miesiąc",
    toDate: "od początku miesiąca",
    remaining: "do końca tego miesiąca",
  },
  {
    unit: "quarter",
    singular: "kwartał",
    few: "kwartały",
    many: "kwartałów",
    current: "ten kwartał",
    previous: "poprzedni kwartał",
    next: "następny kwartał",
    toDate: "od początku kwartału",
    remaining: "do końca tego kwartału",
  },
  {
    unit: "year",
    singular: "rok",
    few: "lata",
    many: "lat",
    current: "ten rok",
    previous: "poprzedni rok",
    next: "następny rok",
    toDate: "od początku roku",
    remaining: "do końca tego roku",
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
const declinedUnits = [
  ["week", "tydzień", "tygodnia", "tygodniem", "tygodniu"],
  ["month", "miesiąc", "miesiąca", "miesiącem", "miesiącu"],
  ["quarter", "kwartał", "kwartału", "kwartałem", "kwartale"],
  ["year", "rok", "roku", "rokiem", "roku"],
] as const satisfies ReadonlyArray<readonly [Unit, string, string, string, string]>;
const relativeAdjectives = [
  [0, "ten", "tego", "tym"],
  [-1, "poprzedni", "poprzedniego", "poprzednim"],
  [1, "następny", "następnego", "następnym"],
] as const;
const declinedPeriods = declinedUnits.flatMap(
  ([unit, nominativeNoun, genitiveNoun, instrumentalNoun, locativeNoun]) =>
    relativeAdjectives.map(
      ([direction, nominative, genitive, oblique]) =>
        [
          `${nominative} ${nominativeNoun}`,
          unit,
          direction,
          `${genitive} ${genitiveNoun}`,
          `${oblique} ${instrumentalNoun}`,
          `${oblique} ${locativeNoun}`,
        ] as const,
    ),
);
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
  ...declinedPeriods.flatMap(([canonical, unit, direction, genitive, instrumental, locative]) => [
    [genitive, unit, direction, canonical] as const,
    [instrumental, unit, direction, canonical] as const,
    [locative, unit, direction, canonical] as const,
  ]),
  ["zeszłym tygodniu", "week", -1, "poprzedni tydzień"],
  ["zeszłym miesiącu", "month", -1, "poprzedni miesiąc"],
  ["zeszłym kwartale", "quarter", -1, "poprzedni kwartał"],
  ["zeszłym roku", "year", -1, "poprzedni rok"],
  ["dziś", "day", 0, "dzisiaj"],
  ["przedwczoraj", "day", -2, "przedwczoraj"],
  ["pojutrze", "day", 2, "pojutrze"],
  ["przedostatni tydzień", "week", -2, "przedostatni tydzień"],
  ["tydzień po następnym", "week", 2, "tydzień po następnym"],
  ["przedostatni miesiąc", "month", -2, "przedostatni miesiąc"],
  ["miesiąc po następnym", "month", 2, "miesiąc po następnym"],
  ["przedostatni rok", "year", -2, "przedostatni rok"],
  ["rok po następnym", "year", 2, "rok po następnym"],
] as const satisfies ReadonlyArray<readonly [string, Unit, number, string]>;
const legacyToDatePhrases = [
  "dzisiaj do tej pory",
  "tydzień do dziś",
  "miesiąc do dziś",
  "kwartał do dziś",
  "rok do dziś",
] as const;
const toDatePhrases = units.flatMap((entry, index) => {
  const aliases = [entry.toDate, textAt(legacyToDatePhrases, index)];
  if (entry.unit === "year") aliases.push("od początku roku do dziś", "w tym roku do dziś");
  return aliases.map((phrase) => ({ entry, phrase }));
});
const remainingPhrases = units.flatMap((entry) => {
  const implicit = entry.remaining.replace("tego ", "");
  const legacy = entry.remaining.replace("do końca tego", "reszta");
  return [entry.remaining, implicit, legacy].map((phrase) => ({ entry, phrase }));
});
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

const periodCaseIndexes = {
  genitive: 3,
  instrumental: 4,
  locative: 5,
} as const;
const monthCases = {
  genitive: monthGenitives,
  instrumental: monthInstrumentals,
  locative: monthLocatives,
} as const;
type PeriodCase = keyof typeof periodCaseIndexes;

const withPeriodCase = (value: string, grammaticalCase: PeriodCase) => {
  const period = declinedPeriods.find((entry) => entry[0] === value);
  return period === undefined
    ? withMonthCase(value, monthCases[grammaticalCase])
    : period[periodCaseIndexes[grammaticalCase]];
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
  const absoluteDate = absoluteDatePeriod(input, "pl");
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

// RETURN TYPE: Recursive period offsets require an explicit result type.
const parsePeriod = (input: string): Option.Option<Period> => {
  const shifted = EffectString.match(
    /^(.+) (?:([1-9]\d*) (dzień|dni|tydzień|tygodnie|tygodni|miesiąc|miesiące|miesięcy|kwartał|kwartały|kwartałów|rok|lata|lat) (temu)|za ([1-9]\d*) (dzień|dni|tydzień|tygodnie|tygodni|miesiąc|miesiące|miesięcy|kwartał|kwartały|kwartałów|rok|lata|lat))$/u,
  )(input);
  if (Option.isSome(shifted)) {
    const past = textAt(shifted.value, 4) === "temu";
    const amount = parseTrailingCount(textAt(shifted.value, past ? 2 : 5));
    const alias = unitAliases.find((unit) => unit[0] === textAt(shifted.value, past ? 3 : 6));
    const entry = alias === undefined ? undefined : units.find((unit) => unit.unit === alias[1]);
    const period = parsePeriod(textAt(shifted.value, 1));
    if (Option.isSome(amount) && entry !== undefined && Option.isSome(period)) {
      const direction = past ? -amount.value : amount.value;
      const noun = countNoun(amount.value, entry);
      const canonical = past
        ? `${period.value.canonical} ${amount.value} ${noun} temu`
        : `${period.value.canonical} za ${amount.value} ${noun}`;
      return Option.some(shiftPeriod(period.value, direction, entry.unit, canonical));
    }
  }

  const edge = EffectString.match(/^(początek|koniec) (.+)$/u)(input);
  if (Option.isSome(edge)) {
    const period = parseBasePeriod(textAt(edge.value, 2));
    if (Option.isSome(period)) {
      const isEnd = textAt(edge.value, 1) === "koniec";
      const canonical = `${isEnd ? "koniec" : "początek"} ${withPeriodCase(period.value.canonical, "genitive")}`;
      return Option.some(
        isEnd ? periodEndDay(period.value, canonical) : periodStartDay(period.value, canonical),
      );
    }
  }
  const wrapper = ["w ", "we ", "przez ", "cały ", "całe "].find((prefix) =>
    input.startsWith(prefix),
  );
  return parseBasePeriod(wrapper === undefined ? input : input.slice(wrapper.length));
};

const countedUnit = (value: string) => unitAliases.find((entry) => entry[0] === value)?.[1];

const countedUnitPattern =
  "dzień|dni|tydzień|tygodnie|tygodni|miesiąc|miesiące|miesięcy|kwartał|kwartały|kwartałów|rok|lata|lat";
const countedPattern = (source: string) =>
  new RegExp(source.replace("UNIT", countedUnitPattern), "u");
const calendarPastPattern = countedPattern("^(?:dokładnie )?(?:([1-9]\\d*) )?(UNIT) temu$");
const calendarFuturePattern = countedPattern("^za (?:([1-9]\\d*) )?(UNIT)$");
const rollingPastPatterns = [
  countedPattern("^(?:ostatni|ostatnie|ostatnich|miniony|minione|minionych) ([1-9]\\d*) (UNIT)$"),
  countedPattern("^w ciągu (?:ostatniego|ostatnich|minionego|minionych) ([1-9]\\d*) (UNIT)$"),
];
const rollingFuturePatterns = [
  countedPattern("^(?:następny|następne|następnych|kolejny|kolejne|kolejnych) ([1-9]\\d*) (UNIT)$"),
  countedPattern("^w ciągu (?:najbliższego|najbliższych) ([1-9]\\d*) (UNIT)$"),
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
  const amountText = textAt(match.value, 1);
  const unitText = textAt(match.value, 2);
  const amount = parseTrailingCount(amountText || "1");
  const unit = countedUnit(unitText);
  if (Option.isNone(amount) || unit === undefined) {
    return Option.none<ReturnType<typeof candidate>>();
  }
  const entry = units.find((item) => item.unit === unit);
  if (entry === undefined || (amountText.length === 0 && unitText !== entry.singular)) {
    return Option.none<ReturnType<typeof candidate>>();
  }
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

const boundaries = [
  ["do początku ", "before", (period: string) => `przed ${withPeriodCase(period, "instrumental")}`],
  ["począwszy od ", "since", (period: string) => `od ${withPeriodCase(period, "genitive")}`],
  ["od ", "since", (period: string) => `od ${withPeriodCase(period, "genitive")}`],
  ["przed ", "before", (period: string) => `przed ${withPeriodCase(period, "instrumental")}`],
  ["do ", "through", (period: string) => `do ${withPeriodCase(period, "genitive")} włącznie`],
  ["po ", "after", (period: string) => `po ${withPeriodCase(period, "locative")}`],
] as const;

const boundaryCandidate = (input: string) => {
  const included = EffectString.match(/^do (.+) włącznie$/u)(input);
  if (Option.isSome(included)) {
    const period = parsePeriod(textAt(included.value, 1));
    return period.pipe(
      Option.map((value) =>
        periodBoundaryCandidate(
          value,
          "through",
          `do ${withPeriodCase(value.canonical, "genitive")} włącznie`,
        ),
      ),
    );
  }

  for (const [prefix, boundary, canonical] of boundaries) {
    if (!input.startsWith(prefix)) continue;
    const period = parsePeriod(input.slice(prefix.length));
    if (Option.isSome(period)) {
      return Option.some(
        periodBoundaryCandidate(period.value, boundary, canonical(period.value.canonical)),
      );
    }
  }
  return Option.none<ReturnType<typeof candidate>>();
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

  const elidedDayRange = EffectString.match(
    /^(?:(?:między|pomiędzy) ([0-3]?\d)\.? a |([0-3]?\d)\.?[–—])([0-3]?\d)\.? ([a-ząćęłńóśźż]+\.?)(?: (\d{4}))?$/u,
  )(input);
  if (Option.isSome(elidedDayRange)) {
    const lowerDay = textAt(elidedDayRange.value, 1) || textAt(elidedDayRange.value, 2);
    const upperDay = textAt(elidedDayRange.value, 3);
    const month = textAt(elidedDayRange.value, 4);
    const year = textAt(elidedDayRange.value, 5);
    const suffix = year.length === 0 ? "" : ` ${year}`;
    const expanded = `między ${lowerDay} ${month}${suffix} a ${upperDay} ${month}${suffix}`;
    const joined = joinedPeriodCandidate(
      expanded,
      [
        ["między ", " a "],
        ["pomiędzy ", " a "],
      ],
      parsePeriod,
      (lower, upper) => `od ${lower} do ${upper} włącznie`,
    );
    if (Option.isSome(joined)) return joined;
  }

  const nowBounded = joinedNowCandidate(
    input,
    [
      ["od ", " do dziś"],
      ["między ", " a dziś"],
      ["pomiędzy ", " a dziś"],
    ],
    ["od dziś do ", "między dziś a ", "pomiędzy dziś a "],
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
      ["pomiędzy ", " a "],
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
  return parsePeriod(input).pipe(
    Option.map((period) => candidate(periodRange(period), period.canonical)),
  );
};

const edgeBasePhrases = [...declinedPeriods.map((entry) => entry[3]), ...monthGenitives];
const edgePhrases = edgeBasePhrases.flatMap((phrase) => [`początek ${phrase}`, `koniec ${phrase}`]);
const canonicalPeriodPhrases = [
  ...units.flatMap((entry) => [entry.current, entry.previous, entry.next]),
  "przedwczoraj",
  "pojutrze",
  "przedostatni tydzień",
  "tydzień po następnym",
  "przedostatni miesiąc",
  "miesiąc po następnym",
  "przedostatni rok",
  "rok po następnym",
  "ten weekend",
  "poprzedni weekend",
  "następny weekend",
  "weekend przed poprzednim",
  "weekend po następnym",
];
const staticPeriodPhrases = [
  ...periodAliases.map((entry) => entry[0]),
  ...canonicalPeriodPhrases,
  ...edgePhrases,
  ...[1, 2, 3, 4].flatMap((quarter) => [
    `q${quarter}`,
    `q${quarter} tego roku`,
    `q${quarter} poprzedniego roku`,
    `q${quarter} następnego roku`,
  ]),
  ...months.flatMap((month) => [month, `${month} poprzedniego roku`, `${month} następnego roku`]),
];

const staticPeriods = periodsFromPhrases(staticPeriodPhrases, parsePeriod);
const monthBoundaryPhrases = months.flatMap((_, index) => {
  const genitive = textAt(monthGenitives, index);
  const instrumental = textAt(monthInstrumentals, index);
  const locative = textAt(monthLocatives, index);
  return [
    `od ${genitive}`,
    `począwszy od ${genitive}`,
    `przed ${instrumental}`,
    `do ${genitive} włącznie`,
    `po ${locative}`,
  ];
});

const fixedBoundaryPhrases = (phrases: ReadonlyArray<string>) =>
  phrases.flatMap((phrase) => [
    `od ${withMonthCase(phrase, monthGenitives)}`,
    `przed ${withMonthCase(phrase, monthInstrumentals)}`,
    `do ${withMonthCase(phrase, monthGenitives)} włącznie`,
    `po ${withMonthCase(phrase, monthLocatives)}`,
  ]);

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
  ...toDatePhrases.map((entry) => entry.phrase),
  ...remainingPhrases.map((entry) => entry.phrase),
  ...canonicalPeriodPhrases,
  ...edgePhrases,
  ...[1, 2, 3, 4].flatMap((quarter) => [
    `q${quarter}`,
    `q${quarter} tego roku`,
    `q${quarter} poprzedniego roku`,
    `q${quarter} następnego roku`,
  ]),
  ...months,
  ...monthBoundaryPhrases,
  "do dziś",
  "od teraz",
];

const suggestPolish = (input: string, limit: number) => {
  const correctedInput = input.startsWith("do koniec")
    ? `do końca${input.slice("do koniec".length)}`
    : input;
  const fixed = fixedCalendarPeriodPhrases(correctedInput, months);
  return completeNaturalPhrases(
    correctedInput,
    [
      ...polishSuggestionPhrases,
      ...fixed,
      ...fixedBoundaryPhrases(fixed),
      ...countedSuggestions(correctedInput),
    ],
    limit,
  );
};

// RETURN TYPE: Recursive shifted-period rendering requires an explicit result type.
const renderPolish = (range: DateRangeExpr): Option.Option<string> => {
  const shifted = decomposeShiftedPeriodRange(range);
  if (Option.isSome(shifted)) {
    const base = renderPolish(shifted.value.baseRange);
    const entry = units.find((unit) => unit.unit === shifted.value.unit);
    if (Option.isSome(base) && entry !== undefined) {
      const amount = Math.abs(shifted.value.amount);
      const noun = countNoun(amount, entry);
      return Option.some(
        shifted.value.amount < 0
          ? `${base.value} ${amount} ${noun} temu`
          : `${base.value} za ${amount} ${noun}`,
      );
    }
  }

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
    (period) => `od ${withPeriodCase(period, "genitive")}`,
    (period) => `przed ${withPeriodCase(period, "instrumental")}`,
    (period) => `do ${withPeriodCase(period, "genitive")} włącznie`,
    (period) => `po ${withPeriodCase(period, "locative")}`,
    (lower, upper) =>
      `od ${withPeriodCase(lower, "genitive")} do ${withPeriodCase(upper, "genitive")} włącznie`,
    (period) => `od ${withPeriodCase(period, "genitive")} do dziś`,
    (period) => `od dziś do ${withPeriodCase(period, "genitive")}`,
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
    ...periodAliases.flatMap((entry) => entry[0].split(" ")),
    "ciągu",
    "dokładnie",
    "dziś",
    "dotychczas",
    "koniec",
    "końca",
    "kolejne",
    "między",
    "minione",
    "najbliższych",
    "następne",
    "od",
    "ostatnie",
    "po",
    "początek",
    "począwszy",
    "pomiędzy",
    "poprzedni",
    "przed",
    "teraz",
    "temu",
    "włącznie",
    "we",
    "za",
  ],
  normalize: normalizePolish,
  correct: correctPolish,
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
