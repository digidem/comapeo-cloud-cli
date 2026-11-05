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
    .option("--timeout <ms>", "HTTP timeout in milliseconds (default 30000)")
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

  program.addHelpText(
    "after",
    `
Output:
  Lists render as a table on a terminal and as JSON when piped, so
  "comapeo-cloud list-observations -p <id> | jq ." works unchanged.
  Use --format table|json|ndjson|csv to choose explicitly.

  Deleted (tombstoned) records are hidden by default; the API returns them
  mixed in with live records. Add --include-deleted or --only-deleted.

Configuration:
  SERVER_URL and SERVER_BEARER_TOKEN (or COMAPEO_SERVER_URL /
  COMAPEO_SERVER_TOKEN), readable from a .env file in the current
  directory, plus -s/--server-url and -t/--server-token overrides.
  COMAPEO_PROJECT sets a default project for -p.

Exit codes:
  0 success   1 API or runtime failure   2 usage error   3 not found

Examples:
  $ comapeo-cloud list-projects
  $ comapeo-cloud list-observations -p "Expedição 2026" --count
  $ comapeo-cloud list-observations -p <id> --count --group-by category
  $ comapeo-cloud list-observations -p <id> --has audio --since 2026-10-26
  $ comapeo-cloud export-geojson -p <id> -o export.zip
`,
  );

  return program;
}
