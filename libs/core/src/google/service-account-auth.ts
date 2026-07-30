import { Layer } from "effect";
import { JWT } from "google-auth-library";

import * as GoogleAuth from "./auth.ts";

export interface Options {
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
export function layer(options: Options): Layer.Layer<GoogleAuth.Service> {
  return Layer.sync(GoogleAuth.Service, () => {
    const client = new JWT({
      email: options.clientEmail,
      key: options.privateKey,
      scopes: typeof options.scopes === "string" ? options.scopes : Array.from(options.scopes),
      ...(options.privateKeyId === undefined ? {} : { keyId: options.privateKeyId }),
      ...(options.subject === undefined ? {} : { subject: options.subject }),
    });

    return GoogleAuth.make(client);
  });
}
