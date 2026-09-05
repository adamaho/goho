import { Config, Context, Effect, Layer, Schema } from "effect";
import { GoogleAuth, type AuthClient } from "google-auth-library";

// ---------------------------------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Describes a failed Google authentication operation.
 *
 * @category errors
 * @since 0.1.0
 */
export class AuthenticationError extends Schema.TaggedError<AuthenticationError>()(
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

/**
 * Authentication operations used by Google API services.
 *
 * @category services
 * @since 0.1.0
 */
export interface Interface {
  readonly authenticate: Effect.Effect<AuthClient, AuthenticationError>;
  readonly getAccessToken: Effect.Effect<string, AuthenticationError>;
  readonly getRequestHeaders: (url?: string | URL) => Effect.Effect<Headers, AuthenticationError>;
}

/**
 * Service identifier for Google authentication.
 *
 * @category services
 * @since 0.1.0
 */
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
 * Constructs Google authentication from the configured service-account key and scopes.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.gen(function* () {
  const jsonKeyFile = yield* Config.string("GOOGLE_SERVICE_ACCOUNT_JSON_KEY_FILE");
  const scopes = yield* Config.string("GOOGLE_AUTH_SCOPES").pipe(
    Config.map((value) =>
      value
        .split(",")
        .map((scope) => scope.trim())
        .filter((scope) => scope.length > 0),
    ),
  );
  const client = yield* Effect.tryPromise({
    try: () => new GoogleAuth({ keyFilename: jsonKeyFile, scopes }).getClient(),
    catch: (error) =>
      new AuthenticationError({
        operation: "initialize",
        message: errorMessage(error),
      }),
  });

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
});

/**
 * Provides Google authentication from the configured service-account key and scopes.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(Service, make);
