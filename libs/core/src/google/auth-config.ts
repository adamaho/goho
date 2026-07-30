import { Config, Option, Redacted } from "effect";

import * as GoogleAuth from "./auth.ts";

// ---------------------------------------------------------------------------------------------------------------------
// Environment keys
// ---------------------------------------------------------------------------------------------------------------------

const clientEmail = Config.string("GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL");
const privateKey = Config.redacted("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
const privateKeyId = Config.option(Config.string("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID"));
const scopes = Config.string("GOOGLE_AUTH_SCOPES").pipe(
  Config.map((value) =>
    value
      .split(",")
      .map((scope) => scope.trim())
      .filter((scope) => scope.length > 0),
  ),
);
const subject = Config.option(Config.string("GOOGLE_SERVICE_ACCOUNT_SUBJECT"));

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
  privateKeyId,
  scopes,
  subject,
}).pipe(
  Config.map((config) => ({
    clientEmail: config.clientEmail,
    privateKey: Redacted.value(config.privateKey).replaceAll("\\n", "\n"),
    scopes: config.scopes,
    ...(Option.isSome(config.privateKeyId) ? { privateKeyId: config.privateKeyId.value } : {}),
    ...(Option.isSome(config.subject) ? { subject: config.subject.value } : {}),
  })),
);
