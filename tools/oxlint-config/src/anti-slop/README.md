# Anti-slop Oxlint plugin

This directory vendors and adapts the MIT-licensed rules from
[dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop) and the copy used by
[humanlayer/effect-machine](https://github.com/humanlayer/effect-machine/tree/main/tools/oxlint/anti-slop).

The source is kept in the repository intentionally. These rules are policy, not
a black-box dependency: update them when the repository's conventions change.

## Local policy

The shared Oxlint config enables rules that preserve type evidence and prevent
agents from compiling through uncertainty:

- chained and undocumented type assertions are rejected
- known values may not be widened and asserted back later
- vague object, dictionary, unknown-return, and unknown-alias contracts are
  rejected
- Vitest and Jest module mocking is rejected in favor of dependency seams
- Effect service constructors stay inside their owning modules

The Effect plugin adds two repository conventions:

- every `Effect.fn` has a static operation name for traces and diagnostics
- every `Context.Service` key uses the repository's configured npm-scope
  prefix

The generic `unknown` parameter rule permits parameters named `cause` and
`error`, plus explicit type guards. Those are legitimate boundary-adaptation
patterns rather than unparsed public contracts.

## Deliberately disabled rules

`no-conditional-empty-object-spread` is disabled because conditional spreads
preserve property omission under `exactOptionalPropertyTypes`.

`no-runtime-typeof` is disabled because a small runtime check is often the
clearest validation for an already typed third-party response.

`no-shape-in-symbol-names` is disabled because it is a naming preference, not
a correctness or evidence rule.

Tests relax assertion-oriented rules so fixtures can represent malformed and
otherwise unconstructable inputs. Module mocking remains prohibited.
