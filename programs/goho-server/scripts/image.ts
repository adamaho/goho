import { Config, Effect, Option, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

/**
 * A build or deploy command that exited unsuccessfully.
 *
 * @category errors
 * @since 0.1.0
 */
export class DeploymentCommandError extends Schema.TaggedError<DeploymentCommandError>()(
  "GohoServer.DeploymentCommandError",
  { message: Schema.String },
) {}

const name = "goho-server";

/**
 * Runs a command with inherited output and fails unless it exits successfully.
 *
 * @category utilities
 * @since 0.1.0
 */
export const run = (
  command: string,
  args: ReadonlyArray<string>,
  options?: { readonly stdin?: Uint8Array },
) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const handle = yield* spawner.spawn(
      ChildProcess.make(command, args, {
        stdin: options?.stdin === undefined ? "inherit" : Stream.make(options.stdin),
        stdout: "inherit",
        stderr: "inherit",
      }),
    );
    const exitCode = yield* handle.exitCode;
    if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
      return yield* new DeploymentCommandError({
        message: `${command} ${args.join(" ")} exited with code ${exitCode}`,
      });
    }
  }).pipe(Effect.scoped);

const git = (...args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const output = yield* spawner.string(ChildProcess.make("git", args));
    return output.trim();
  });

/**
 * Builds the server image from the repository root, which the Dockerfile
 * needs for `turbo prune`. Tags it with the commit. With `push`, also tags it
 * `dev`, pushes both tags and uses the registry build cache.
 *
 * @category utilities
 * @since 0.1.0
 */
export const buildImage = (options: { readonly push: boolean }) =>
  Effect.gen(function* () {
    const root = yield* git("rev-parse", "--show-toplevel");
    const registry = yield* Config.String("GOHO_IMAGE_REGISTRY").pipe(
      Config.withDefault("ghcr.io/adamaho"),
    );
    const sha = yield* Config.option(Config.String("GITHUB_SHA"));
    const tag = Option.isSome(sha) ? sha.value : yield* git("rev-parse", "HEAD");
    const repository = `${registry}/${name}`;
    const image = `${repository}:${tag}`;
    const dockerfile = new URL("../Dockerfile", import.meta.url).pathname;

    const args = ["buildx", "build", "--file", dockerfile, "--tag", image];
    if (options.push) {
      args.push(
        "--push",
        "--tag",
        `${repository}:dev`,
        "--cache-from",
        `type=registry,ref=${repository}:buildcache`,
        "--cache-to",
        `type=registry,ref=${repository}:buildcache,mode=max`,
      );
    }
    yield* run("docker", [...args, root]);
    return image;
  });
