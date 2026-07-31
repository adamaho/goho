import { Config, Context, Effect, Layer, Schema } from "effect";
import { GoogleAuth, type AuthClient } from "google-auth-library";

// ---------------------------------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------------------------------

export class AuthenticationError extends Schema.TaggedErrorClass<AuthenticationError>()(
  "GoogleAuth.AuthenticationError",
  {
    operation: Schema.Literals([
      "initialize",
      "authenticate",
      "getAccessToken",
      "getRequestHeaders",
    ]),
    message: Schema.String,
  },
) {}

// ---------------------------------------------------------------------------------------------------------------------
// Service contract
// ---------------------------------------------------------------------------------------------------------------------

export interface Interface {
  readonly authenticate: Effect.Effect<AuthClient, AuthenticationError>;
  readonly getAccessToken: Effect.Effect<string, AuthenticationError>;
  readonly getRequestHeaders: (url?: string | URL) => Effect.Effect<Headers, AuthenticationError>;
}

export class Service extends Context.Service<Service, Interface>()("@goho/google/Auth") {}

// ---------------------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Returns a safe message for an unknown authentication failure.
 *
 * @param error - The value caught at the Google client boundary.
 * @returns A message suitable for the typed authentication error.
 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Google authentication failed";
}

// ---------------------------------------------------------------------------------------------------------------------
// Service construction
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Adapts a Google authentication client to the application authentication service.
 *
 * Credential-specific layers construct their client and use this function to create
 * the strategy-independent service implementation.
 *
 * @param client - A configured Google authentication client.
 * @returns The strategy-independent authentication service implementation.
 */
export function make(client: AuthClient): Interface {
  const accessToken = Effect.fn("GoogleAuth.accessToken")(function* (
    operation: "authenticate" | "getAccessToken",
  ) {
    const response = yield* Effect.tryPromise({
      try: () => client.getAccessToken(),
      catch: (error) =>
        new AuthenticationError({
          operation,
          message: errorMessage(error),
        }),
    });

    if (response.token === null || response.token === undefined) {
      return yield* new AuthenticationError({
        operation,
        message: "Google did not return an access token",
      });
    }

    return response.token;
  });

  const authenticate = Effect.fn("GoogleAuth.authenticate")(function* () {
    yield* accessToken("authenticate");
    return client;
  });

  const getAccessToken = Effect.fn("GoogleAuth.getAccessToken")(function* () {
    return yield* accessToken("getAccessToken");
  });

  const getRequestHeaders = Effect.fn("GoogleAuth.getRequestHeaders")(function* (
    url?: string | URL,
  ) {
    return yield* Effect.tryPromise({
      try: () => client.getRequestHeaders(url),
      catch: (error) =>
        new AuthenticationError({
          operation: "getRequestHeaders",
          message: errorMessage(error),
        }),
    });
  });

  return Service.of({
    authenticate: authenticate(),
    getAccessToken: getAccessToken(),
    getRequestHeaders,
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Service account layer
// ---------------------------------------------------------------------------------------------------------------------

export interface ServiceAccountOptions {
  readonly jsonKeyFile: string;
  readonly scopes: string | ReadonlyArray<string>;
}

/**
 * Creates the service implementation for concrete service-account options.
 *
 * @param options - The service-account JSON key file and OAuth scopes.
 * @returns The configured Google authentication service.
 */
const makeServiceAccount = Effect.fn("GoogleAuth.initialize")(function* (
  options: ServiceAccountOptions,
) {
  const client = yield* Effect.tryPromise({
    try: () =>
      new GoogleAuth({
        keyFilename: options.jsonKeyFile,
        scopes: typeof options.scopes === "string" ? options.scopes : Array.from(options.scopes),
      }).getClient(),
    catch: (error) =>
      new AuthenticationError({
        operation: "initialize",
        message: errorMessage(error),
      }),
  });

  return make(client);
});

/**
 * Provides Google authentication backed by concrete service-account credentials.
 *
 * @param options - The service-account JSON key file and OAuth scopes.
 * @returns A layer that provides the strategy-independent Google auth service.
 */
export function serviceAccountLayer(
  options: ServiceAccountOptions,
): Layer.Layer<Service, AuthenticationError> {
  return Layer.effect(Service, makeServiceAccount(options));
}

/**
 * Provides Google authentication backed by effect configuration.
 *
 * @param config - Config recipes that produce the service-account options.
 * @returns A layer that loads its credentials while being built.
 */
export function serviceAccountLayerConfig(
  config: Config.Wrap<ServiceAccountOptions>,
): Layer.Layer<Service, Config.ConfigError | AuthenticationError> {
  return Layer.effect(Service, Config.unwrap(config).pipe(Effect.flatMap(makeServiceAccount)));
}
