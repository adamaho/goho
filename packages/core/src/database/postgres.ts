import { PgClient } from "@effect/sql-pg";
import { Config, Effect, Layer, type Redacted } from "effect";

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
    applicationName: options.applicationName ?? "goho",
    maxConnections: options.maxConnections ?? 5,
    connectTimeout: options.connectTimeout ?? "5 seconds",
    idleTimeout: options.idleTimeout ?? "30 seconds",
  });

/**
 * Reads caller-supplied Effect configuration before constructing the pool.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerConfig = (options: Config.Wrap<Options>) =>
  Layer.unwrap(Config.unwrap(options).pipe(Effect.map(layer)));
