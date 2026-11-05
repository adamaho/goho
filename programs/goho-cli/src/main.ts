#!/usr/bin/env node

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { ErrorResponse } from "@goho/goho-server-client/response";
import { Console, Effect } from "effect";
import { Command } from "effect/cli";

import { booksCommand } from "./commands/books.ts";
import { receiptsCommand } from "./commands/receipts.ts";
import { statusCommand } from "./commands/status.ts";
import * as GohoServer from "./goho-server.ts";

const command = Command.make("goho").pipe(
  Command.withDescription("Command-line interface for Goho"),
  Command.withSubcommands([receiptsCommand, booksCommand, statusCommand]),
);

Command.run(command, { version: "0.0.0" }).pipe(
  Effect.provide(GohoServer.layer),
  Effect.catchTag("GohoCli.CommandError", (error) =>
    Effect.gen(function* () {
      const response = yield* ErrorResponse.makeEffect({
        error: { code: error.code, message: error.message },
      });
      yield* Console.error(JSON.stringify(response, null, 2));
      process.exitCode = 1;
    }),
  ),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
