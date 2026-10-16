import { Effect, FileSystem, Path, Stream } from "effect";
import { ChildProcess } from "effect/process";

/**
 * Captured output from one child process.
 *
 * @category testing
 * @since 0.1.0
 */
export interface ProcessResult {
  readonly code: number | null;
  readonly stderr: string;
  readonly stdout: string;
}

/**
 * Runs a Node script with exactly the given environment, so tests control
 * whether DATABASE_URL exists at all.
 *
 * @category testing
 * @since 0.1.0
 */
export const runNode = (
  scriptPath: string,
  args: ReadonlyArray<string>,
  env: Record<string, string>,
) =>
  Effect.gen(function* () {
    const child = yield* ChildProcess.make(process.execPath, [scriptPath, ...args], {
      env,
      extendEnv: false,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    return yield* Effect.all(
      {
        code: child.exitCode,
        stderr: child.stderr.pipe(Stream.decodeText(), Stream.mkString),
        stdout: child.stdout.pipe(Stream.decodeText(), Stream.mkString),
      },
      { concurrency: "unbounded" },
    );
  }).pipe(Effect.scoped);

/**
 * Runs the importer command.
 *
 * @category testing
 * @since 0.1.0
 */
export const runImporter = (args: ReadonlyArray<string>, env: Record<string, string> = {}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const mainPath = yield* path.fromFileUrl(new URL("../../src/main.ts", import.meta.url));
    const result: ProcessResult = yield* runNode(mainPath, args, env);
    return result;
  });

/**
 * Writes CSV text to a scoped temporary file and returns its absolute path.
 *
 * @category testing
 * @since 0.1.0
 */
export const writeCsv = (content: string) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fileSystem.makeTempDirectoryScoped();
    const file = path.join(directory, "raw.csv");
    yield* fileSystem.writeFileString(file, content);
    return file;
  });

/**
 * Builds RAW CSV text with the required header.
 *
 * @category testing
 * @since 0.1.0
 */
export const rawCsv = (...rows: ReadonlyArray<string>) =>
  ["store,date,category,item,price,source_file_id", ...rows].join("\n");
