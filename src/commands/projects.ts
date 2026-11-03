import type { Command } from "commander";
import { handleError } from "../lib/api.js";
import { PROJECT_COLUMNS, projectRow, selectColumns } from "../lib/columns.js";
import { createContext } from "../lib/context.js";
import { renderCount, renderList, write } from "../lib/format.js";
import type { ApiList, Project } from "../lib/types.js";

interface ListProjectsOptions {
  count?: boolean;
  search?: string;
  columns?: string;
}

export function registerListProjectsCommand(program: Command): void {
  program
    .command("list-projects")
    .description("List all projects")
    .option("--count", "Print only the number of projects")
    .option("--search <text>", "Filter by project name (case-insensitive)")
    .option(
      "--columns <a,b,c>",
      "Columns for table/csv output (projectId,name)",
    )
    .action(async (options: ListProjectsOptions, cmd: Command) => {
      try {
        const context = createContext(cmd);
        const response =
          await context.client.get<ApiList<Project>>("/projects");
        const all = response.data?.data ?? [];

        const needle = options.search?.trim().toLowerCase();
        const projects = needle
          ? all.filter((project) => project.name.toLowerCase().includes(needle))
          : all;

        if (options.count) {
          write(renderCount(projects.length, undefined, context.format));
          return;
        }

        const columns = selectColumns(
          PROJECT_COLUMNS,
          options.columns,
          PROJECT_COLUMNS.map((column) => column.key),
        );

        write(
          renderList(
            context.format,
            columns,
            projects.map(projectRow),
            projects,
          ),
        );
      } catch (error) {
        handleError(error);
      }
    });
}
