import chalk from "chalk";
import type { Command } from "commander";
import { handleError, requireProjectId } from "../lib/api.js";
import {
  ALL_OBSERVATION_COLUMNS,
  DEFAULT_OBSERVATION_COLUMNS,
  OBSERVATION_COLUMNS,
  observationRow,
  selectColumns,
} from "../lib/columns.js";
import { createContext } from "../lib/context.js";
import { buildPredicate, sortObservations } from "../lib/filters.js";
import {
  renderCount,
  renderList,
  renderSummary,
  write,
  type SummaryLine,
} from "../lib/format.js";
import { assertGroupKey, groupCounts, summarize } from "../lib/group.js";
import { assertSortKey, fetchObservations } from "../lib/observations.js";
import {
  addFilterOptions,
  assertPagination,
  paginate,
  toFilterOptions,
  type FilterCliOptions,
} from "./shared.js";

interface ObservationCliOptions extends FilterCliOptions {
  projectId?: string;
  count?: boolean;
  groupBy?: string;
  summary?: boolean;
  sort?: string;
  reverse?: boolean;
  limit?: string;
  offset?: string;
  columns?: string;
}

const summaryLines = (summary: ReturnType<typeof summarize>): SummaryLine[] => {
  const lines: SummaryLine[] = [
    { label: "matching", value: String(summary.total) },
  ];

  if (summary.deleted > 0) {
    lines.push({
      label: "active/deleted",
      value: `${summary.active} / ${summary.deleted}`,
    });
  }

  lines.push({
    label: "date range",
    value:
      summary.firstCreatedAt && summary.lastCreatedAt
        ? `${summary.firstCreatedAt.slice(0, 10)} → ${summary.lastCreatedAt.slice(0, 10)}`
        : "n/a",
  });

  lines.push({ label: "devices", value: String(summary.devices) });
  lines.push({
    label: "media",
    value: `${summary.photos} photos, ${summary.audio} audio`,
  });

  if (summary.withoutAttachments > 0) {
    lines.push({
      label: "no attachments",
      value: String(summary.withoutAttachments),
    });
  }

  if (summary.withoutLocation > 0) {
    lines.push({
      label: "no location",
      value: String(summary.withoutLocation),
    });
  }

  lines.push({ label: "categories", value: String(summary.categories) });

  return lines;
};

export function registerListObservationsCommand(program: Command): void {
  const command = program
    .command("list-observations")
    .description(
      "List observations for a project. Filtering and counting happen client-side.",
    )
    .option(
      "-p, --project-id <id|name>",
      "Project public id or name (or $COMAPEO_PROJECT)",
    )
    .option("--count", "Print only the number of matching observations")
    .option(
      "--group-by <field>",
      "With --count/--summary: group by category|preset|day|device|media|tag:<field>",
    )
    .option(
      "--summary",
      "Print a summary block instead of individual observations",
    )
    .option(
      "--sort <key>",
      "Sort by createdAt|updatedAt|category|notes|media|id (default: createdAt)",
    )
    .option("--reverse", "Reverse the sort order")
    .option("--limit <n>", "Print at most n observations")
    .option("--offset <n>", "Skip the first n observations")
    .option(
      "--columns <a,b,c>",
      `Columns for table/csv output (default: ${DEFAULT_OBSERVATION_COLUMNS.join(",")})`,
    )
    .addHelpText(
      "after",
      `
All filters combine. Every filter runs client-side: the API returns the
whole project in one response, so there is no server-side query to learn.

Deleted observations are hidden by default (the API also returns
tombstones). Add --include-deleted to see them.

Examples:
  $ comapeo-cloud list-observations -p <id> --count
  $ comapeo-cloud list-observations -p <id> --count --group-by category
  $ comapeo-cloud list-observations -p <id> --summary
  $ comapeo-cloud list-observations -p <id> --tag tipo-de-corpo-dagua=rio --has audio
  $ comapeo-cloud list-observations -p <id> --missing attachment --format csv
  $ comapeo-cloud list-observations -p <id> --reverse --limit 20 --format table
`,
    );

  addFilterOptions(command).action(
    async (options: ObservationCliOptions, cmd: Command) => {
      try {
        const context = createContext(cmd);

        // Validate every flag before touching the network, so a typo is a
        // usage error rather than a round trip that fails afterwards.
        const predicate = buildPredicate(toFilterOptions(options));
        const groupKey = options.groupBy
          ? assertGroupKey(options.groupBy)
          : undefined;
        const sortKey = assertSortKey(options.sort ?? "createdAt");
        // Only validate columns when a list is actually rendered: --count
        // and --summary ignore them, so a composed command should not fail
        // on a column that would never be used.
        const rendersColumns = !options.count && !options.summary;
        const columns = rendersColumns
          ? selectColumns(
              OBSERVATION_COLUMNS,
              options.columns,
              context.format === "csv"
                ? ALL_OBSERVATION_COLUMNS
                : DEFAULT_OBSERVATION_COLUMNS,
            )
          : [];
        assertPagination(options);

        const projectId = await requireProjectId(
          context.client,
          options.projectId,
        );
        const all = await fetchObservations(context.client, projectId);
        const matching = all.filter(predicate);

        const counts = groupKey ? groupCounts(matching, groupKey) : undefined;

        if (options.count) {
          write(renderCount(matching.length, counts, context.format));
          return;
        }

        if (options.summary) {
          const summary = summarize(matching);
          if (context.format === "json" || context.format === "ndjson") {
            write(
              JSON.stringify(
                {
                  projectId,
                  summary,
                  ...(counts ? { groups: Object.fromEntries(counts) } : {}),
                },
                null,
                2,
              ),
            );
            return;
          }

          const blocks = [renderSummary(summaryLines(summary))];
          if (counts) {
            blocks.push(
              "",
              chalk.dim(`by ${groupKey}`),
              renderCount(matching.length, counts, "table"),
            );
          }
          write(blocks.join("\n"));
          return;
        }

        const sorted = sortObservations(matching, sortKey, options.reverse);
        const page = paginate(sorted, options);

        write(
          renderList(context.format, columns, page.map(observationRow), page),
        );
      } catch (error) {
        handleError(error);
      }
    },
  );
}
