import { GoogleAuth } from "@goho/lib-core";
import { Config, Redacted } from "effect";

export const GoogleAuthLive = GoogleAuth.serviceAccountLayerConfig({
  clientEmail: Config.string("GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL"),
  privateKey: Config.redacted("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").pipe(
    Config.map((value) => Redacted.make(Redacted.value(value).replaceAll("\\n", "\n"))),
  ),
  scopes: Config.string("GOOGLE_AUTH_SCOPES").pipe(
    Config.map((value) =>
      value
        .split(",")
        .map((scope) => scope.trim())
        .filter((scope) => scope.length > 0),
    ),
  ),
});
