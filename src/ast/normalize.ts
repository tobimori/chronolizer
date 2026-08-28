import type { DateRangeExpr, InstantExpr, LowerBound, UpperBound } from "./schemas.ts";

// RETURN TYPE: TypeScript needs the recursive function contract before initialization.
export const normalizeInstant = (expression: InstantExpr): InstantExpr => {
  switch (expression._tag) {
    case "Now":
    case "DateLiteral":
      return expression;
    case "StartOf":
      return {
        _tag: "StartOf",
        base: normalizeInstant(expression.base),
        unit: expression.unit,
      };
    case "Shift": {
      const base = normalizeInstant(expression.base);
      if (expression.amount === 0) return base;
      if (base._tag === "Shift" && base.unit === expression.unit) {
        const amount = base.amount + expression.amount;
        if (Number.isSafeInteger(amount)) {
          return normalizeInstant({
            _tag: "Shift",
            base: base.base,
            amount,
            unit: expression.unit,
          });
        }
      }
      return {
        _tag: "Shift",
        base,
        amount: expression.amount,
        unit: expression.unit,
      };
    }
  }
};

const normalizeLower = (bound: LowerBound) =>
  ({
    _tag: bound._tag,
    value: normalizeInstant(bound.value),
  }) satisfies LowerBound;

const normalizeUpper = (bound: UpperBound) =>
  ({
    _tag: bound._tag,
    value: normalizeInstant(bound.value),
  }) satisfies UpperBound;

export const normalizeRange = (range: DateRangeExpr) => {
  if (range.lower !== undefined && range.upper !== undefined) {
    return {
      _tag: "DateRange",
      lower: normalizeLower(range.lower),
      upper: normalizeUpper(range.upper),
    } satisfies DateRangeExpr;
  }
  if (range.lower !== undefined) {
    return {
      _tag: "DateRange",
      lower: normalizeLower(range.lower),
    } satisfies DateRangeExpr;
  }
  if (range.upper !== undefined) {
    return {
      _tag: "DateRange",
      upper: normalizeUpper(range.upper),
    } satisfies DateRangeExpr;
  }
  throw new Error("DateRangeExpr must contain at least one bound");
};
