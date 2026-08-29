import { Array as EffectArray } from "effect";

import { containsPositiveShift, isCurrentPeriod } from "../ast/fold.ts";
import type { NaturalCandidate } from "../language/model.ts";

export const applyFuturePolicy = (
  candidates: ReadonlyArray<NaturalCandidate>,
  allowFuture: boolean | undefined,
) =>
  allowFuture === false
    ? EffectArray.filter(
        candidates,
        (candidate) => isCurrentPeriod(candidate.range) || !containsPositiveShift(candidate.range),
      )
    : candidates;
