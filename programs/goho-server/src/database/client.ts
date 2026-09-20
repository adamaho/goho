import { Postgres } from "@goho/core";
import { Config } from "effect";

/**
 * Server-owned configuration shared by the HTTP runtime and migration command.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Postgres.layerConfig({
  url: Config.Redacted("DATABASE_URL"),
  applicationName: Config.succeed("goho-server"),
});
