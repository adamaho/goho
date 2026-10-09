import { Config, Effect, Option, Path, Schema, Stream } from "effect";
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
 * The image and deploy tasks use the same commit-tagged image.
 *
 * @category utilities
 * @since 0.1.0
 */
export const imageReference = Effect.gen(function* () {
  const registry = yield* Config.String("GOHO_IMAGE_REGISTRY").pipe(
    Config.withDefault("ghcr.io/adamaho"),
  );
  const sha = yield* Config.option(Config.String("GITHUB_SHA"));
  const tag = Option.isSome(sha) ? sha.value : yield* git("rev-parse", "HEAD");
  const repository = `${registry}/${name}`;
  return { repository, image: `${repository}:${tag}` };
});

/**
 * Loads the commit-tagged image into Docker so deployment can publish it
 * without rebuilding. The repository root supplies the workspace build context.
 *
 * @category utilities
 * @since 0.1.0
 */
export const buildImage = Effect.gen(function* () {
  const root = yield* git("rev-parse", "--show-toplevel");
  const { image } = yield* imageReference;
  const path = yield* Path.Path;
  const dockerfile = yield* path.fromFileUrl(new URL("../Dockerfile", import.meta.url));
  yield* run("docker", ["buildx", "build", "--load", "--file", dockerfile, "--tag", image, root]);
  return image;
});
