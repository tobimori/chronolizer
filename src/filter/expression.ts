import { Effect } from "effect";

import { foldInstant } from "../ast/fold.ts";
import { normalizeInstant } from "../ast/normalize.ts";
import { isIsoDate } from "../ast/schemas.ts";
import type { InstantExpr, IsoDate, Unit } from "../ast/schemas.ts";
import { FilterExpressionParseError } from "./errors.ts";

const unitFromSymbol = (symbol: string) => {
  switch (symbol) {
    case "d":
      return "day";
    case "w":
      return "week";
    case "M":
      return "month";
    case "q":
      return "quarter";
    case "y":
      return "year";
    default:
      return undefined;
  }
};

const symbolFromUnit = (unit: Unit) => {
  switch (unit) {
    case "day":
      return "d";
    case "week":
      return "w";
    case "month":
      return "M";
    case "quarter":
      return "q";
    case "year":
      return "y";
  }
};

const failAt = (input: string, offset: number, expected: string) =>
  Effect.fail(new FilterExpressionParseError({ input, offset, expected }));

const isDigit = (value: string) => value >= "0" && value <= "9";
const isFirstPositiveDigit = (value: string) => value >= "1" && value <= "9";

export const parseInstantExpression = (input: string) =>
  Effect.gen(function* () {
    let cursor = 0;
    let expression: InstantExpr;
    let fixedAnchor = false;

    if (input.startsWith("now")) {
      expression = { _tag: "Now" };
      cursor = 3;
    } else {
      const candidate = input.slice(0, 10);
      if (!isIsoDate(candidate)) {
        return yield* failAt(input, 0, '"now" or an ISO date (YYYY-MM-DD)');
      }
      expression = { _tag: "DateLiteral", value: candidate };
      cursor = 10;
      fixedAnchor = true;
    }

    if (fixedAnchor && cursor < input.length) {
      if (input.slice(cursor, cursor + 2) !== "||") {
        return yield* failAt(input, cursor, '"||" before date operations');
      }
      cursor += 2;
    }

    while (cursor < input.length) {
      const operator = input[cursor];
      if (operator === "/") {
        const unit = unitFromSymbol(input[cursor + 1] ?? "");
        if (unit === undefined) {
          return yield* failAt(input, cursor + 1, "a date unit: d, w, M, q, or y");
        }
        expression = { _tag: "StartOf", base: expression, unit };
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
      expression = {
        _tag: "Shift",
        base: expression,
        amount: operator === "+" ? amount : -amount,
        unit,
      };
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
  foldInstant<PrintedExpression>(normalizeInstant(expression), {
    now: () => ({ text: "now", fixedAnchor: false }),
    dateLiteral: (value: IsoDate) => ({ text: value, fixedAnchor: true }),
    shift: (base, amount, unit) =>
      appendOperation(base, `${amount < 0 ? "-" : "+"}${Math.abs(amount)}${symbolFromUnit(unit)}`),
    startOf: (base, unit) => appendOperation(base, `/${symbolFromUnit(unit)}`),
  }).text;
