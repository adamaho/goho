import { CreateRecipeRequest, Recipe, Step } from "@goho/goho-server-client/recipes";
import { Schema, SchemaTransformation } from "effect";

// The recipe tools still take and return one flat list of steps. Goho groups
// steps into sections: a flat list is saved as one untitled section, and a
// saved recipe's sections are read back as their steps in order, without titles.
// Both reshape the wire form; the API schemas validate the result.

const Steps = Schema.NonEmptyArray(Step).annotate({
  description: "Steps in order; ingredient marks point at this recipe's ingredients.",
});

type Steps = typeof Steps.Encoded;
type Sections = typeof Recipe.fields.sections.Encoded;

const flatten = ([first, ...rest]: Sections): Steps => [
  ...first.steps,
  ...rest.flatMap((section) => section.steps),
];

const untitled = (steps: Steps): Sections => [{ title: null, steps }];

const { sections: _createSections, ...createFields } = CreateRecipeRequest.fields;

/**
 * Direct recipe creation input with a flat `steps` list, decoded into a
 * `CreateRecipeRequest` with those steps as one untitled section.
 *
 * @category models
 * @since 0.1.0
 */
export const FlatCreateRecipeRequest = Schema.toEncoded(
  Schema.Struct({ ...createFields, steps: Steps }),
).pipe(
  Schema.decodeTo(
    CreateRecipeRequest,
    SchemaTransformation.transform({
      decode: ({ steps, ...recipe }) => ({ ...recipe, sections: untitled(steps) }),
      encode: ({ sections, ...recipe }) => ({ ...recipe, steps: flatten(sections) }),
    }),
  ),
);

const { sections: _recipeSections, ...recipeFields } = Recipe.fields;

/**
 * A saved recipe as the tools return it: its sections' steps as one flat
 * `steps` list, in order and without section titles.
 *
 * @category models
 * @since 0.1.0
 */
export const FlatRecipe = Schema.toEncoded(Schema.Struct({ ...recipeFields, steps: Steps })).pipe(
  Schema.decodeTo(
    Recipe,
    SchemaTransformation.transform({
      decode: ({ steps, ...recipe }) => ({ ...recipe, sections: untitled(steps) }),
      encode: ({ sections, ...recipe }) => ({ ...recipe, steps: flatten(sections) }),
    }),
  ),
);
