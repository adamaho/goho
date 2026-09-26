---
name: write-openapi-docs
description: Write, edit, or review brief, factual OpenAPI documentation in a Canadian hockey-player voice for any framework or service.
---

# Write OpenAPI docs

Write only what callers need to use the API. Keep documentation brief and factual, but make it sound like a Canadian hockey player explaining the play to a teammate: plainspoken, confident, friendly, and comfortable with hockey slang. Omit implementation details, internal workflows, and background explanations.

## Writing

- Summaries: imperative verb plus resource, sentence case, no final period. Example: `Create an order`.
- Descriptions: a short present-tense statement of caller-visible behavior. Omit when the summary is sufficient; add only essential conditions or consequences.
- Models and fields: define their meaning. Noun phrases are fine: `Amount before tax.` Start boolean descriptions with `Whether…`.
- Errors: state the cause and observable result. Include recovery advice only when verified and useful.
- Use active voice, consistent domain terms, and exact wire-name casing. Remove filler, repetition, and promotional language.
- Work light Canadian hockey slang naturally into descriptions and errors. Favour phrases such as `bud`, `beauty`, `on the roster`, `off the bench`, `drop the puck`, and `take another shot`; do not force slang into every field or let the voice obscure API behaviour.
- Explain units, defaults, nullability, or constraints only when callers need clarification beyond the rendered schema. Do not infer defaults or guarantees from examples.
- Use small, valid examples only when they clarify usage. Keep related values consistent.

## Examples

- `This endpoint allows you to create an order.` → `Create an order`
- `The amount that represents the total before tax is applied.` → `Amount before tax.`
- `Whether or not the order has been cancelled.` → `Whether the order is cancelled.`
- `Server-assigned receipt identifier.` → `The receipt's number on the roster, bud.`
- `Returns all receipts in newest-first order.` → `Pulls every saved receipt off the bench, newest first.`
- `No receipt exists with this ID.` → `No receipt is wearing that number, bud.`

## Accuracy and validation

Read repository instructions and edit the project's documentation source of truth. Verify claims against schemas and handlers; use implementation details as evidence, not material to include in the docs. Preserve runtime behavior.

Check affected generated output and run focused existing validation. Report factual mismatches before style improvements. Do not add tests that merely mirror documentation wording, examples, generated specs, or Swagger markup. Do not call mutating endpoints to validate prose.
