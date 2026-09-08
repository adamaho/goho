# @goho/core

Shared, framework-independent core logic for Goho programs.

Keep domain rules and reusable service behavior here. Runtime wiring, transport
handlers, and deployment concerns belong in the program packages that consume
this library.

## PostgreSQL

`Postgres.layer(options)` provides Effect's `PgClient` and `SqlClient` services.
Use `Postgres.layerConfig(options)` for Effect Config values. The owning program
chooses environment variable names, migrations, and persistence error policy.

```ts
import { Postgres } from "@goho/core";
import { Config } from "effect";

const DatabaseLive = Postgres.layerConfig({
  url: Config.redacted("DATABASE_URL"),
  applicationName: Config.succeed("goho-server"),
});
```

Defaults are five connections, a five-second connection timeout, and a
30-second idle timeout. All can be overridden. Layer acquisition verifies
connectivity and releases the pool when its scope closes. Credentials remain
redacted in configuration values; never log the connection URL.

Run the Postgres integration test using the dedicated database described in
[local infrastructure](../../infra/local/README.md).
