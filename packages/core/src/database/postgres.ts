import { PgClient, PgTypes } from "@effect/sql-pg";
import { Config, Effect, Layer, Result, type Redacted } from "effect";

const regclassOid = 2205;
const regclassCodec: PgTypes.Codec<number> = {
  decode: (bytes) =>
    bytes.length === 4
      ? Result.succeed(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0))
      : Result.fail(new PgTypes.CodecError({ message: "Expected four bytes for regclass" })),
  encode: (value) => {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value);
    return Result.succeed(bytes);
  },
};

const defaultTypes = PgTypes.makeRegistry();
defaultTypes.register(regclassOid, regclassCodec);

/**
 * Connection settings supplied by the owning program, with shared pool defaults.
 *
 * @category models
 * @since 0.1.0
 */
export interface Options extends PgClient.PgPoolConfig {
  readonly url: Redacted.Redacted<string>;
}

/**
 * Provides Effect's Postgres and SQL services. The pool is checked on acquisition
 * and closed with the layer scope. Environment variable names belong to callers.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = (options: Options) =>
  PgClient.layer({
    ...options,
    types: options.types ?? defaultTypes,
    applicationName: options.applicationName ?? "goho",
    maxConnections: options.maxConnections ?? 5,
    connectTimeout: options.connectTimeout ?? "5 seconds",
    idleTimeout: options.idleTimeout ?? "30 seconds",
  });

/**
 * Reads caller-supplied Effect configuration before constructing the pool.
 *
 * **Example** (Configure a server database)
 *
 * ```ts
 * import { Postgres } from "@goho/core";
 * import { Config } from "effect";
 *
 * const DatabaseLive = Postgres.layerConfig({
 *   url: Config.Redacted("DATABASE_URL"),
 *   applicationName: Config.succeed("goho-server"),
 * });
 * ```
 *
 * @category layers
 * @since 0.1.0
 */
export const layerConfig = (options: Config.Wrap<Options>) =>
  Layer.unwrap(Config.unwrap(options).pipe(Effect.map(layer)));
