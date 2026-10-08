import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Config, Console, Effect, FileSystem, Path } from "effect";

import { imageReference, run } from "./image.ts";

const program = "goho-server";
const directory = `/opt/goho/${program}`;
const sshOptions = [
  "-o",
  "BatchMode=yes",
  "-o",
  "StrictHostKeyChecking=accept-new",
  "-o",
  "LogLevel=ERROR",
];

// Publishes the image produced by the build task, then applies this program's
// Compose stack over Tailscale SSH. Turbo runs build before deploy.
Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const host = yield* Config.String("GOHO_DEPLOY_HOST");
  const target = `goho@${host}`;
  const dockerConfig = yield* Config.String("GOHO_DEPLOY_DOCKER_CONFIG").pipe(
    Config.withDefault(""),
  );
  const read = (specifier: string) =>
    path
      .fromFileUrl(new URL(specifier, import.meta.url))
      .pipe(Effect.flatMap((file) => fileSystem.readFile(file)));
  const compose = yield* read("../compose.yml");
  const remoteDeploy = yield* read("./remote-deploy.sh");

  const { image, repository } = yield* imageReference;
  yield* run("docker", ["push", image]);
  yield* run("docker", ["tag", image, `${repository}:dev`]);
  yield* run("docker", ["push", `${repository}:dev`]);
  yield* run(
    "ssh",
    [...sshOptions, target, `mkdir -p ${directory} && cat > ${directory}/compose.yml`],
    {
      stdin: compose,
    },
  );
  yield* run(
    "ssh",
    [
      ...sshOptions,
      target,
      "bash",
      "-s",
      "--",
      program,
      image,
      ...(dockerConfig ? [dockerConfig] : []),
    ],
    {
      stdin: remoteDeploy,
    },
  );
  yield* Console.log(`Deployed ${image} to ${host}`);
}).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
