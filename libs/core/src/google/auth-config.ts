import { Config, Effect, Redacted, Schema } from "effect";

import * as GoogleAuth from "./auth.ts";

// ---------------------------------------------------------------------------------------------------------------------
// Environment keys
// ---------------------------------------------------------------------------------------------------------------------

const nonEmptyTrimmedString = Schema.Trim.check(Schema.isMinLength(1));

const clientEmail = Config.schema(nonEmptyTrimmedString, "GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL");
const privateKey = Config.schema(
  Schema.Redacted(Schema.NonEmptyString),
  "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
);
const scopes = Config.string("GOOGLE_AUTH_SCOPES").pipe(
  Config.map((value) =>
    value
      .split(",")
      .map((scope) => scope.trim())
      .filter((scope) => scope.length > 0),
  ),
  Config.mapOrFail((values) =>
    Schema.decodeUnknownEffect(Schema.NonEmptyArray(Schema.NonEmptyString))(values).pipe(
      Effect.mapError((error) => new Config.ConfigError(error)),
    ),
  ),
);

// ---------------------------------------------------------------------------------------------------------------------
// Service account config
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Service-account authentication loaded from environment variables.
 *
 * `GOOGLE_AUTH_SCOPES` is a comma-separated list. The private key accepts both
 * real newlines and escaped `\\n` sequences commonly used by secret stores.
 */
export const serviceAccount: Config.Config<GoogleAuth.ServiceAccountOptions> = Config.all({
  clientEmail,
  privateKey,
  scopes,
}).pipe(
  Config.map((config) => ({
    clientEmail: config.clientEmail,
    privateKey: Redacted.make(Redacted.value(config.privateKey).replaceAll("\\n", "\n")),
    scopes: config.scopes,
  })),
);
