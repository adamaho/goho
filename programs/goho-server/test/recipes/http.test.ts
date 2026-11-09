import { NodeHttpServer } from "@effect/platform-node";
import { it } from "@effect/vitest";
import { api } from "@goho/goho-api/api";
import {
  RecipeUpload,
  RecipeUploadConflict,
  RecipeUploadId,
  RecipeUploadNotFound,
  RecipeUploadsUnavailable,
} from "@goho/goho-api/recipe-uploads";
import {
  type CreateRecipeRequest,
  Recipe,
  RecipeId,
  RecipeImageNotFound,
  RecipeNotFound,
  type RecipeSource,
  RecipesUnavailable,
  RecipeSummary,
  RecipeUrl,
} from "@goho/goho-api/recipes";
import * as Client from "@goho/goho-server-client/client";
import { Effect, Layer } from "effect";
import { HttpBody, HttpClient, type HttpClientResponse, HttpRouter } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { expect } from "vitest";

import * as BookUploads from "#src/book-uploads/service.ts";
import * as Books from "#src/books/service.ts";
import * as Http from "#src/http/routes.ts";
import * as ReceiptUploads from "#src/receipt-uploads/service.ts";
import * as Receipts from "#src/receipts/service.ts";
import * as RecipeUploads from "#src/recipe-uploads/service.ts";
import type { RecipeImageContentType } from "#src/recipes/model.ts";
import * as Recipes from "#src/recipes/service.ts";

const whole = { numerator: 1, denominator: 1 };

const pancakes = {
  title: "Pancakes",
  ingredients: [
    {
      id: "flour",
      name: "flour",
      quantity: { kind: "exact", value: { numerator: 3, denominator: 2 } },
      unit: "cup",
    },
  ],
  steps: [
    {
      segments: [
        { kind: "text", text: "Whisk " },
        { kind: "mark", content: { kind: "ingredient", ingredientId: "flour", portion: whole } },
        { kind: "text", text: "  well." },
      ],
    },
  ],
} satisfies CreateRecipeRequest;

const summary = RecipeSummary.make({
  id: RecipeId.make("5"),
  title: "Pancakes",
  source: null,
  totalTimeSeconds: null,
  hasImage: false,
  createdAt: "2026-11-08 14:03:11.52+00",
  updatedAt: "2026-11-08 14:03:11.52+00",
});

const recipe = Recipe.make({ ...summary, ...pancakes, yield: null });

const source: RecipeSource = {
  kind: "url",
  url: RecipeUrl.make("https://example.com/recipes/pancakes#top"),
};

const upload = RecipeUpload.make({
  id: RecipeUploadId.make("7c1e4b2a-9d3f-4a6b-8c5d-2e1f0a9b8c7d"),
  source,
  status: "queued",
  recipeId: null,
  failureCode: null,
  createdAt: "2026-11-08 14:03:11.52+00",
  updatedAt: "2026-11-08 14:03:11.52+00",
});

const photo = { bytes: new Uint8Array([7, 8, 9]), contentType: "image/png" as const };

// Records what reaches the services, so boundary rejections can prove nothing did.
const testLayer = (
  recipes: Partial<Recipes.Interface> = {},
  uploads: Partial<RecipeUploads.Interface> = {},
) => {
  const calls: Array<unknown> = [];
  const record =
    <Args extends ReadonlyArray<unknown>, A>(name: string, result: A) =>
    (...args: Args) =>
      Effect.sync(() => {
        calls.push([name, ...args]);
        return result;
      });
  const layer = HttpRouter.serve(
    Http.layer.pipe(
      Layer.provide([
        Layer.succeed(
          Recipes.Service,
          Recipes.Service.of({
            create: record<[CreateRecipeRequest], Recipe>("create", recipe),
            list: record<[], ReadonlyArray<RecipeSummary>>("list", [summary])(),
            get: record<[RecipeId], Recipe>("get", recipe),
            delete: record<[RecipeId], void>("delete", undefined),
            getImage: record<
              [RecipeId],
              { readonly bytes: Uint8Array; readonly contentType: RecipeImageContentType }
            >("getImage", photo),
            ...recipes,
          }),
        ),
        Layer.succeed(
          RecipeUploads.Service,
          RecipeUploads.Service.of({
            create: record<[RecipeSource], RecipeUpload>("createUpload", upload),
            list: record<[], ReadonlyArray<RecipeUpload>>("listUploads", [upload])(),
            get: record<[RecipeUploadId], RecipeUpload>("getUpload", upload),
            delete: record<[RecipeUploadId], void>("deleteUpload", undefined),
            ...uploads,
          }),
        ),
        Layer.mock(Books.Service, {}),
        Layer.mock(BookUploads.Service, {}),
        Layer.mock(Receipts.Service, {}),
        Layer.mock(ReceiptUploads.Service, {}),
      ]),
    ),
  ).pipe(Layer.provideMerge(NodeHttpServer.layerTest));
  return { calls, layer };
};

const validationProblem = {
  type: "about:blank",
  status: 400,
  title: "Bad Request",
  detail: "Request validation failed",
};

it.effect("creates, lists, gets, and deletes recipes through the typed client", () => {
  const { calls, layer } = testLayer();
  return Effect.gen(function* () {
    const client = yield* Client.make("");
    // Titles are trimmed, while step text keeps its spaces.
    const created = yield* HttpClient.post("/recipes", {
      body: yield* HttpBody.json({ ...pancakes, title: " Pancakes ", yield: null }),
    });
    expect(created.status).toBe(200);
    expect(yield* created.json).toEqual({ data: recipe });
    expect(yield* client.recipes.create({ payload: pancakes })).toEqual({ data: recipe });
    expect(yield* client.recipes.list()).toEqual({ data: [summary] });
    expect(yield* client.recipes.get({ params: { recipeId: recipe.id } })).toEqual({
      data: recipe,
    });
    const deleted = yield* HttpClient.del(`/recipes/${recipe.id}`);
    expect(deleted.status).toBe(204);
    expect(yield* deleted.text).toBe("");
    yield* client.recipes.delete({ params: { recipeId: RecipeId.make("9223372036854775807") } });
    expect(calls).toEqual([
      ["create", { ...pancakes, yield: null }],
      ["create", pancakes],
      ["list"],
      ["get", recipe.id],
      ["delete", recipe.id],
      ["delete", "9223372036854775807"],
    ]);
  }).pipe(Effect.provide(layer));
});

it.effect("serves recipe photos as bytes with their MIME type", () =>
  Effect.forEach(
    ["image/jpeg", "image/png", "image/webp"] as const,
    (contentType) => {
      const { layer } = testLayer({
        getImage: () => Effect.succeed({ bytes: photo.bytes, contentType }),
      });
      return Effect.gen(function* () {
        const response = yield* HttpClient.get(`/recipes/${recipe.id}/image`);
        expect(response.status).toBe(200);
        expect(response.headers["content-type"]).toBe(contentType);
        expect(response.headers["cache-control"]).toBe("private, no-store");
        expect(new Uint8Array(yield* response.arrayBuffer)).toEqual(photo.bytes);
        const client = yield* Client.make("");
        const image = yield* client.recipes.getImage({ params: { recipeId: recipe.id } });
        expect([new Uint8Array(image.body), image.headers["content-type"]]).toEqual([
          photo.bytes,
          contentType,
        ]);
      }).pipe(Effect.provide(layer));
    },
    { discard: true },
  ),
);

// Captures the raw response next to the typed client's decoded value.
const captureClient = Effect.gen(function* () {
  const responses: Array<HttpClientResponse.HttpClientResponse> = [];
  const client = yield* HttpApiClient.make(api, {
    baseUrl: "",
    transformClient: HttpClient.tap((response) =>
      Effect.sync(() => {
        responses.push(response);
      }),
    ),
  });
  return { client, responses };
});

it.effect("returns 202 with the new import for every submission", () => {
  const { calls, layer } = testLayer();
  return Effect.gen(function* () {
    // The URL is trimmed and otherwise passed on as sent, fragment included.
    const body = yield* HttpBody.json({ source: { kind: "url", url: ` ${source.url} ` } });
    for (let submission = 0; submission < 2; submission++) {
      const accepted = yield* HttpClient.post("/recipe-uploads", { body });
      expect(accepted.status).toBe(202);
      expect(yield* accepted.json).toEqual({ data: upload });
    }
    const { client, responses } = yield* captureClient;
    expect(yield* client.recipeUploads.create({ payload: { source } })).toEqual({ data: upload });
    expect(responses.map((response) => response.status)).toEqual([202]);
    expect(calls).toEqual([
      ["createUpload", source],
      ["createUpload", source],
      ["createUpload", source],
    ]);
  }).pipe(Effect.provide(layer));
});

it.effect("lists, gets, and deletes recipe imports", () => {
  const { calls, layer } = testLayer();
  return Effect.gen(function* () {
    const client = yield* Client.make("");
    expect(yield* client.recipeUploads.list()).toEqual({ data: [upload] });
    expect(yield* client.recipeUploads.get({ params: { uploadId: upload.id } })).toEqual({
      data: upload,
    });
    const deleted = yield* HttpClient.del(`/recipe-uploads/${upload.id}`);
    expect(deleted.status).toBe(204);
    expect(yield* deleted.text).toBe("");
    expect(calls).toEqual([["listUploads"], ["getUpload", upload.id], ["deleteUpload", upload.id]]);
  }).pipe(Effect.provide(layer));
});

// Schema rules are tested with the API package; these prove each route decodes with them.
it.effect("rejects invalid recipes, imports, and IDs before the services", () => {
  const { calls, layer } = testLayer();
  return Effect.gen(function* () {
    const mark = (ingredientId: string) => [
      {
        segments: [{ kind: "mark", content: { kind: "ingredient", ingredientId, portion: whole } }],
      },
    ];
    for (const payload of [
      {},
      { ...pancakes, steps: mark("sugar") },
      { ...pancakes, source: null },
      { ...pancakes, hasImage: false },
      { ...pancakes, ingredients: [{ ...pancakes.ingredients[0], note: "sifted" }] },
      null,
    ]) {
      const response = yield* HttpClient.post("/recipes", { body: yield* HttpBody.json(payload) });
      expect(response.status, JSON.stringify(payload)).toBe(400);
      expect(yield* response.json).toEqual(validationProblem);
    }
    for (const url of ["ftp://example.com/pancakes", "https://cook:secret@example.com/pancakes"]) {
      const response = yield* HttpClient.post("/recipe-uploads", {
        body: yield* HttpBody.json({ source: { kind: "url", url } }),
      });
      expect(response.status, url).toBe(400);
      expect(yield* response.json).toEqual(validationProblem);
    }
    for (const payload of [
      {},
      { source: { kind: "file", url: source.url } },
      { source, recipeId: "5" },
    ]) {
      const response = yield* HttpClient.post("/recipe-uploads", {
        body: yield* HttpBody.json(payload),
      });
      expect(response.status, JSON.stringify(payload)).toBe(400);
      expect(yield* response.json).toEqual(validationProblem);
    }
    for (const id of ["0", "01", "1.0", "abc", "9223372036854775808"]) {
      for (const request of [
        HttpClient.get(`/recipes/${id}`),
        HttpClient.get(`/recipes/${id}/image`),
        HttpClient.del(`/recipes/${id}`),
      ]) {
        expect((yield* request).status, id).toBe(400);
      }
    }
    for (const request of [
      HttpClient.get("/recipe-uploads/not-a-uuid"),
      HttpClient.del("/recipe-uploads/5"),
    ]) {
      const response = yield* request;
      expect(response.status).toBe(400);
      expect(yield* response.json).toEqual(validationProblem);
    }
    expect(calls).toEqual([]);
  }).pipe(Effect.provide(layer));
});

const problem = (error: unknown, type: string, status: number, title: string) => ({
  error,
  status,
  body: { type: `goho:problem:${type}`, status, title },
});
const recipeNotFound = problem(RecipeNotFound, "recipe-not-found", 404, "Recipe not found");
const imageNotFound = problem(
  RecipeImageNotFound,
  "recipe-image-not-found",
  404,
  "Recipe image not found",
);
const recipesUnavailable = problem(
  RecipesUnavailable,
  "recipes-unavailable",
  500,
  "Recipes unavailable",
);
const uploadNotFound = problem(
  RecipeUploadNotFound,
  "recipe-upload-not-found",
  404,
  "Recipe upload not found",
);
const uploadConflict = problem(
  RecipeUploadConflict,
  "recipe-upload-conflict",
  409,
  "Recipe upload cannot be deleted",
);
const uploadsUnavailable = problem(
  RecipeUploadsUnavailable,
  "recipe-uploads-unavailable",
  500,
  "Recipe uploads unavailable",
);

const recipeParams = { params: { recipeId: recipe.id } };
const uploadParams = { params: { uploadId: upload.id } };

type TestClient = Effect.Success<ReturnType<typeof Client.make>>;

const problemCases: ReadonlyArray<{
  readonly name: string;
  readonly fixture: ReturnType<typeof testLayer>;
  readonly expected: ReturnType<typeof problem>;
  readonly call: (client: TestClient) => Effect.Effect<unknown, unknown>;
}> = [
  {
    name: "list recipes: unavailable",
    fixture: testLayer({ list: Effect.fail(new RecipesUnavailable()) }),
    expected: recipesUnavailable,
    call: (client) => client.recipes.list(),
  },
  {
    name: "create recipe: unavailable",
    fixture: testLayer({ create: () => Effect.fail(new RecipesUnavailable()) }),
    expected: recipesUnavailable,
    call: (client) => client.recipes.create({ payload: pancakes }),
  },
  {
    name: "get recipe: missing",
    fixture: testLayer({ get: () => Effect.fail(new RecipeNotFound()) }),
    expected: recipeNotFound,
    call: (client) => client.recipes.get(recipeParams),
  },
  {
    name: "delete recipe: missing",
    fixture: testLayer({ delete: () => Effect.fail(new RecipeNotFound()) }),
    expected: recipeNotFound,
    call: (client) => client.recipes.delete(recipeParams),
  },
  {
    name: "delete recipe: unavailable",
    fixture: testLayer({ delete: () => Effect.fail(new RecipesUnavailable()) }),
    expected: recipesUnavailable,
    call: (client) => client.recipes.delete(recipeParams),
  },
  {
    name: "get photo: missing",
    fixture: testLayer({ getImage: () => Effect.fail(new RecipeImageNotFound()) }),
    expected: imageNotFound,
    call: (client) => client.recipes.getImage(recipeParams),
  },
  {
    name: "get photo: unavailable",
    fixture: testLayer({ getImage: () => Effect.fail(new RecipesUnavailable()) }),
    expected: recipesUnavailable,
    call: (client) => client.recipes.getImage(recipeParams),
  },
  {
    name: "import recipe: unavailable",
    fixture: testLayer({}, { create: () => Effect.fail(new RecipeUploadsUnavailable()) }),
    expected: uploadsUnavailable,
    call: (client) => client.recipeUploads.create({ payload: { source } }),
  },
  {
    name: "list imports: unavailable",
    fixture: testLayer({}, { list: Effect.fail(new RecipeUploadsUnavailable()) }),
    expected: uploadsUnavailable,
    call: (client) => client.recipeUploads.list(),
  },
  {
    name: "get import: missing",
    fixture: testLayer({}, { get: () => Effect.fail(new RecipeUploadNotFound()) }),
    expected: uploadNotFound,
    call: (client) => client.recipeUploads.get(uploadParams),
  },
  {
    name: "delete import: missing",
    fixture: testLayer({}, { delete: () => Effect.fail(new RecipeUploadNotFound()) }),
    expected: uploadNotFound,
    call: (client) => client.recipeUploads.delete(uploadParams),
  },
  {
    name: "delete import: not failed",
    fixture: testLayer({}, { delete: () => Effect.fail(new RecipeUploadConflict()) }),
    expected: uploadConflict,
    call: (client) => client.recipeUploads.delete(uploadParams),
  },
];

it.effect.each(problemCases)(
  "returns a client-decodable problem for $name",
  ({ call, expected, fixture }) =>
    Effect.gen(function* () {
      const { client, responses } = yield* captureClient;
      const failure = yield* call(client).pipe(Effect.flip);
      expect(failure).toBeInstanceOf(expected.error);
      const [response] = responses;
      expect(response?.status).toBe(expected.status);
      expect(response?.headers["content-type"]).toContain("application/problem+json");
      expect(
        yield* Effect.fromNullishOr(response).pipe(Effect.flatMap((raw) => raw.json)),
      ).toStrictEqual(expected.body);
    }).pipe(Effect.provide(fixture.layer)),
);
