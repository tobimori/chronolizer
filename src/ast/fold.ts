import type { InstantExpr, IsoDate, Unit } from "./schemas.ts";

export interface InstantAlgebra<A> {
  readonly now: () => A;
  readonly dateLiteral: (value: IsoDate) => A;
  readonly shift: (base: A, amount: number, unit: Unit) => A;
  readonly startOf: (base: A, unit: Unit) => A;
}

// RETURN TYPE: TypeScript needs the recursive generic contract before initialization.
export const foldInstant = <A>(expression: InstantExpr, algebra: InstantAlgebra<A>): A => {
  switch (expression._tag) {
    case "Now":
      return algebra.now();
    case "DateLiteral":
      return algebra.dateLiteral(expression.value);
    case "Shift":
      return algebra.shift(
        foldInstant(expression.base, algebra),
        expression.amount,
        expression.unit,
      );
    case "StartOf":
      return algebra.startOf(foldInstant(expression.base, algebra), expression.unit);
  }
};
