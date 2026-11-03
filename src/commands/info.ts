import type { Command } from "commander";
import { handleError } from "../lib/api.js";
import { createContext } from "../lib/context.js";
import { write } from "../lib/format.js";
import type { ApiItem } from "../lib/types.js";

export function registerServerCommands(program: Command): void {
  program
    .command("info")
    .description("Get server information")
    .action(async (_options: unknown, cmd: Command) => {
      try {
        const context = createContext(cmd);
        const response =
          await context.client.get<ApiItem<Record<string, unknown>>>("/info");
        write(JSON.stringify(response.data, null, 2));
      } catch (error) {
        handleError(error);
      }
    });

  program
    .command("healthcheck")
    .description("Check the health of the server")
    .action(async (_options: unknown, cmd: Command) => {
      try {
        const context = createContext(cmd);
        await context.client.get("/healthcheck");
        write("ok");
      } catch (error) {
        handleError(error);
      }
    });
}
