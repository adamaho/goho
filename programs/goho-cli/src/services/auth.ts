import { GoogleAuth } from "@goho/core";
import { Config } from "effect";

export const GoogleAuthLive = GoogleAuth.serviceAccountLayerConfig({
  jsonKeyFile: Config.string("GOOGLE_SERVICE_ACCOUNT_JSON_KEY_FILE"),
  scopes: Config.string("GOOGLE_AUTH_SCOPES").pipe(
    Config.map((value) =>
      value
        .split(",")
        .map((scope) => scope.trim())
        .filter((scope) => scope.length > 0),
    ),
  ),
});
