import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Config, Console, Effect, FileSystem, Path } from "effect";

import { buildImage, run } from "./image.ts";

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

// Pushes the image, then starts it on the Goho server over Tailscale SSH with
// the Compose stack from @goho/infra-deployment.
Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const host = yield* Config.String("GOHO_DEPLOY_HOST");
  const target = `goho@${host}`;
  const read = (specifier: string) =>
    path
      .fromFileUrl(new URL(import.meta.resolve(specifier)))
      .pipe(Effect.flatMap((file) => fileSystem.readFile(file)));
  const compose = yield* read(`@goho/infra-deployment/${program}/compose.yml`);
  const remoteDeploy = yield* read("@goho/infra-deployment/remote-deploy.sh");

  const image = yield* buildImage({ push: true });
  yield* run(
    "ssh",
    [...sshOptions, target, `mkdir -p ${directory} && cat > ${directory}/compose.yml`],
    {
      stdin: compose,
    },
  );
  yield* run("ssh", [...sshOptions, target, "bash", "-s", "--", program, image], {
    stdin: remoteDeploy,
  });
  yield* Console.log(`Deployed ${image} to ${host}`);
}).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
