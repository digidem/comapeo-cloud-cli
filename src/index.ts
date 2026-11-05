#!/usr/bin/env node
import { CommanderError } from "commander";
import { buildProgram } from "./cli.js";
import { EXIT } from "./lib/errors.js";

export const program = buildProgram();

// exitOverride() stops Commander from calling process.exit() itself, which
// both avoids truncating piped output and lets usage errors exit with the
// documented code 2 instead of Commander's default 1. It must be applied to
// subcommands too: an unknown option on `list-observations` is raised by that
// command, not by the root program.
const disableProcessExit = (command: typeof program): void => {
  command.exitOverride();
  for (const subcommand of command.commands) disableProcessExit(subcommand);
};

disableProcessExit(program);

try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof CommanderError) {
    // --help and --version throw with exitCode 0 after writing output.
    process.exitCode = error.exitCode === 0 ? EXIT.OK : EXIT.USAGE;
  } else {
    throw error;
  }
}
