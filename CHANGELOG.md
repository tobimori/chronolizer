# chronolizer

## 0.4.0

### Minor Changes

- 881571a: Parse written counts through ninety-nine and apply counted calendar offsets to existing periods in every supported language.

### Patch Changes

- 0714a9f: Use plain language in public errors and package documentation.

## 0.3.0

### Minor Changes

- 989390d: Improve Polish parsing, rendering, and autocomplete with contextual cases, idiomatic period boundaries, implicit singular offsets, public-source grammar review, and joined day ranges.
- d7434b6: Add genitive Czech singular rolling periods, lowercase month output, and elided day ranges.
- 573864c: Distinguish English rolling singular durations from calendar periods, add idiomatic boundaries and elided date ranges, and improve canonical autocomplete text.
- 5e47180: Add case-aware German boundaries and period edges, distinguish rolling singular durations, and parse idiomatic elided date ranges.
- 0732a56: Parse and render named days without a year in every locale, and compose English `the day before` expressions with recognized periods.
- a3347f7: Add distinct Dutch rolling singular periods, word offsets, counted noun validation, and elided day ranges.
- 729c089: Add gender-aware Spanish rolling periods, idiomatic calendar aliases, explicit inclusive boundaries, and elided day ranges.
- 2212e45: Define recursive instant AST nodes with Effect Schema tagged classes and remove direct tag access.
- bad56a7: Add distinct Turkish singular rolling periods, word offsets, and suffix-based elided day ranges.
- 9cd1211: Format absolute dates with locale-aware numeric output from `Intl.DateTimeFormat`.
- f96a7a8: Add gender-aware French rolling periods, locale contractions, singular word offsets, and elided day ranges.

### Patch Changes

- 269f963: Use Effect Match for exhaustive value branching.
- d1c27bf: Keep complete current calendar periods when `allowFuture` is disabled.
- 266a1e8: Collect language parser results with Effect Array and Option operations.
- 266a1e8: Validate language contributions directly with their Effect Schema.
- 266a1e8: Share one Effect Schema for counted past and future periods.
- 266a1e8: Share the natural candidate Schema with parse alternatives.
- 42b365d: Use linear Option pipelines in the remaining language parser fallbacks.

## 0.2.0

### Minor Changes

- 1db5694: Add locale-aware `suggestNatural` autocomplete with prefix, typo, count, year, limit, and future-range support.
- b11140d: Add the separately exported Czech language pack.
- b11140d: Add the separately exported Dutch language pack.
- b11140d: Add the separately exported French language pack.
- b11140d: Add the separately exported Polish language pack.
- b11140d: Use one tree-shakeable main API entry and separate locale entries. Remove redundant wrapper entries and the default language alias.
- b11140d: Add the separately exported Spanish language pack.
- b11140d: Add the separately exported Turkish language pack.

### Patch Changes

- b11140d: Preserve language extension priority when selecting a natural parse.

## 0.1.0

### Minor Changes

- 7c383d9: Add bidirectional English and German natural-language date ranges for Effect.
