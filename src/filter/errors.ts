import { Schema } from "effect";

export class FilterExpressionParseError extends Schema.TaggedError<FilterExpressionParseError>()(
  "FilterExpressionParseError",
  {
    input: Schema.String,
    offset: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    expected: Schema.String,
  },
) {}

export class InvalidDateFilterError extends Schema.TaggedError<InvalidDateFilterError>()(
  "InvalidDateFilterError",
  {
    message: Schema.String,
  },
) {}
