import { GoogleAuth } from "@goho/core";
import { Config } from "effect";

/**
 * Provides Google authentication from server environment configuration.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = GoogleAuth.layerServiceAccountConfig({
  jsonKeyFile: Config.String("GOOGLE_SERVICE_ACCOUNT_JSON_KEY_FILE"),
  scopes: Config.String("GOOGLE_AUTH_SCOPES").pipe(
    Config.map((value) =>
      value
        .split(",")
        .map((scope) => scope.trim())
        .filter((scope) => scope.length > 0),
    ),
  ),
});
