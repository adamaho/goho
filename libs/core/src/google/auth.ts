import { Context, Effect, Layer, Schema } from "effect";
import { JWT, type AuthClient } from "google-auth-library";

// ---------------------------------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------------------------------

export class AuthenticationError extends Schema.TaggedErrorClass<AuthenticationError>()(
  "GoogleAuth.AuthenticationError",
  {
    operation: Schema.Literals(["authenticate", "getAccessToken", "getRequestHeaders"]),
    message: Schema.String,
  },
) {}

// ---------------------------------------------------------------------------------------------------------------------
// Service contract
// ---------------------------------------------------------------------------------------------------------------------

export interface Interface {
  readonly client: AuthClient;
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
    client,
    authenticate: authenticate(),
    getAccessToken: getAccessToken(),
    getRequestHeaders,
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Service account layer
// ---------------------------------------------------------------------------------------------------------------------

export interface ServiceAccountOptions {
  readonly clientEmail: string;
  readonly privateKey: string;
  readonly privateKeyId?: string;
  readonly scopes: string | ReadonlyArray<string>;
  /** A Workspace user to impersonate through domain-wide delegation. */
  readonly subject?: string;
}

/**
 * Provides Google authentication backed by service-account credentials.
 *
 * The resulting client obtains and refreshes short-lived access tokens without
 * interactive user authentication.
 *
 * @param options - The service-account credentials and OAuth scopes.
 * @returns A layer that provides the strategy-independent Google auth service.
 */
export function serviceAccountLayer(options: ServiceAccountOptions): Layer.Layer<Service> {
  return Layer.sync(Service, () => {
    const client = new JWT({
      email: options.clientEmail,
      key: options.privateKey,
      scopes: typeof options.scopes === "string" ? options.scopes : Array.from(options.scopes),
      ...(options.privateKeyId === undefined ? {} : { keyId: options.privateKeyId }),
      ...(options.subject === undefined ? {} : { subject: options.subject }),
    });

    return make(client);
  });
}
