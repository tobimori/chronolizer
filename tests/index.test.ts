import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

it.effect("runs Effect tests with Vite+", () =>
  Effect.gen(function* () {
    const value = yield* Effect.succeed("chronolizer");

    expect(value).toBe("chronolizer");
  }),
);
