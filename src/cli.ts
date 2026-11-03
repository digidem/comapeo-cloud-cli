import chalk from "chalk";
import { Command } from "commander";
import { registerAlertCommands } from "./commands/alerts.js";
import { registerGetAttachmentCommand } from "./commands/attachments.js";
import { registerExportCommand } from "./commands/export.js";
import { registerServerCommands } from "./commands/info.js";
import { registerListObservationsCommand } from "./commands/observations.js";
import { registerListProjectsCommand } from "./commands/projects.js";
import { getVersion } from "./lib/version.js";

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("comapeo-cloud")
    .description("CLI tool for interacting with the CoMapeo Cloud API")
    .version(getVersion(), "-V, --version", "output the version number")
    .option("-s, --server-url <url>", "Server URL (overrides SERVER_URL)")
    .option(
      "-t, --server-token <token>",
      "Bearer token (overrides SERVER_BEARER_TOKEN)",
    )
    .option(
      "--format <format>",
      "Output format: table|json|ndjson|csv (default: table on a TTY, json when piped)",
    )
    .option("--timeout <ms>", "HTTP timeout in milliseconds", "30000")
    .option("--no-color", "Disable coloured output")
    .option("-v, --verbose", "Verbose progress on stderr")
    .showHelpAfterError();

  program.hook("preAction", (_thisCommand, actionCommand) => {
    const options = actionCommand.optsWithGlobals() as { color?: boolean };
    if (options.color === false) {
      chalk.level = 0;
    }
  });

  registerServerCommands(program);
  registerListProjectsCommand(program);
  registerListObservationsCommand(program);
  registerExportCommand(program);
  registerGetAttachmentCommand(program);
  registerAlertCommands(program);

  return program;
}
