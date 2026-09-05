import { Effect, Match } from "effect";

import { dateLiteral, now, shift, startOf } from "../ast/constructors.ts";
import { foldInstant } from "../ast/fold.ts";
import { isIsoDate } from "../ast/schemas.ts";
import type { InstantExpr, IsoDate, Unit } from "../ast/schemas.ts";
import { FilterExpressionParseError } from "./errors.ts";

const unitFromSymbol = (symbol: string) =>
  Match.value(symbol).pipe(
    Match.when("d", () => "day" as const),
    Match.when("w", () => "week" as const),
    Match.when("M", () => "month" as const),
    Match.when("q", () => "quarter" as const),
    Match.when("y", () => "year" as const),
    Match.orElse(() => undefined),
  );

const symbolFromUnit = (unit: Unit) =>
  Match.value(unit).pipe(
    Match.when("day", () => "d"),
    Match.when("week", () => "w"),
    Match.when("month", () => "M"),
    Match.when("quarter", () => "q"),
    Match.when("year", () => "y"),
    Match.exhaustive,
  );

const failAt = (input: string, offset: number, expected: string) =>
  Effect.fail(new FilterExpressionParseError({ input, offset, expected }));

const isDigit = (value: string) => value >= "0" && value <= "9";
const isFirstPositiveDigit = (value: string) => value >= "1" && value <= "9";

interface ParsedAnchor {
  readonly expression: InstantExpr;
  readonly cursor: number;
  readonly fixed: boolean;
}

const parseAnchor = Effect.fn(function* (input: string) {
  if (input.startsWith("now")) {
    const expression: InstantExpr = now();
    return { expression, cursor: 3, fixed: false } satisfies ParsedAnchor;
  }
  const candidate = input.slice(0, 10);
  if (!isIsoDate(candidate)) {
    return yield* failAt(input, 0, '"now" or an ISO date (YYYY-MM-DD)');
  }
  const expression: InstantExpr = dateLiteral(candidate);
  return { expression, cursor: 10, fixed: true } satisfies ParsedAnchor;
});

const operationStart = Effect.fn(function* (input: string, anchor: ParsedAnchor) {
  if (!anchor.fixed || anchor.cursor === input.length) return anchor.cursor;
  if (input.slice(anchor.cursor, anchor.cursor + 2) !== "||") {
    return yield* failAt(input, anchor.cursor, '"||" before date operations');
  }
  const cursor = anchor.cursor + 2;
  if (cursor === input.length) {
    return yield* failAt(input, cursor, 'an operation beginning with "+", "-", or "/"');
  }
  return cursor;
});

export const parseInstantExpression = Effect.fn(function* (input: string) {
  const anchor = yield* parseAnchor(input);
  let expression: InstantExpr = anchor.expression;
  let cursor = yield* operationStart(input, anchor);

  while (cursor < input.length) {
    const operator = input[cursor];
    if (operator === "/") {
      const unit = unitFromSymbol(input[cursor + 1] ?? "");
      if (unit === undefined) {
        return yield* failAt(input, cursor + 1, "a date unit: d, w, M, q, or y");
      }
      expression = startOf(expression, unit);
      cursor += 2;
      continue;
    }
    if (operator !== "+" && operator !== "-") {
      return yield* failAt(input, cursor, 'an operation beginning with "+", "-", or "/"');
    }

    const amountStart = cursor + 1;
    if (!isFirstPositiveDigit(input[amountStart] ?? "")) {
      return yield* failAt(input, amountStart, "a positive integer without a leading zero");
    }
    cursor = amountStart + 1;
    while (cursor < input.length && isDigit(input[cursor] ?? "")) cursor += 1;
    const amount = Number(input.slice(amountStart, cursor));
    if (!Number.isSafeInteger(amount)) {
      return yield* failAt(input, amountStart, "a safe positive integer");
    }
    const unit = unitFromSymbol(input[cursor] ?? "");
    if (unit === undefined) {
      return yield* failAt(input, cursor, "a date unit: d, w, M, q, or y");
    }
    expression = shift(expression, operator === "+" ? amount : -amount, unit);
    cursor += 1;
  }

  return expression;
});

interface PrintedExpression {
  readonly text: string;
  readonly fixedAnchor: boolean;
}

const appendOperation = (base: PrintedExpression, operation: string) => ({
  text: `${base.text}${base.fixedAnchor ? "||" : ""}${operation}`,
  fixedAnchor: false,
});

export const formatInstantExpression = (expression: InstantExpr) =>
  foldInstant<PrintedExpression>(expression, {
    now: () => ({ text: "now", fixedAnchor: false }),
    dateLiteral: (value: IsoDate) => ({ text: value, fixedAnchor: true }),
    shift: (base, amount, unit) =>
      amount === 0
        ? base
        : appendOperation(
            base,
            `${amount < 0 ? "-" : "+"}${Math.abs(amount)}${symbolFromUnit(unit)}`,
          ),
    startOf: (base, unit) => appendOperation(base, `/${symbolFromUnit(unit)}`),
  }).text;
