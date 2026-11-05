import type { Command } from "commander";
import { handleError, requireProjectId } from "../lib/api.js";
import { ALERT_COLUMNS, alertRow, selectColumns } from "../lib/columns.js";
import { createContext } from "../lib/context.js";
import { CliError, EXIT } from "../lib/errors.js";
import { parseDateBound } from "../lib/filters.js";
import { renderCount, renderList, write } from "../lib/format.js";
import type { ApiList, RemoteAlert } from "../lib/types.js";
import { collect, assertPagination, paginate } from "./shared.js";

interface ListAlertsOptions {
  projectId?: string;
  count?: boolean;
  since?: string;
  until?: string;
  alertType?: string[];
  sourceId?: string[];
  includeDeleted?: boolean;
  onlyDeleted?: boolean;
  limit?: string;
  offset?: string;
  columns?: string;
}

interface CreateAlertOptions {
  projectId?: string;
  startDate: string;
  endDate: string;
  sourceId: string;
  alertType: string;
  lon: string;
  lat: string;
}

const parseCoordinate = (value: string, name: string, limit: number) => {
  // Number() rejects "12garbage" and "1,5"; parseFloat would accept both.
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  if (trimmed === "" || !Number.isFinite(parsed) || Math.abs(parsed) > limit) {
    throw new CliError(
      `--${name} must be a number between -${limit} and ${limit}, got "${value}".`,
      EXIT.USAGE,
    );
  }
  return parsed;
};

export function registerAlertCommands(program: Command): void {
  program
    .command("list-alerts")
    .description("List remote detection alerts for a project")
    .option(
      "-p, --project-id <id|name>",
      "Project public id or name (or $COMAPEO_PROJECT)",
    )
    .option("--count", "Print only the number of matching alerts")
    .option("--since <date>", "Only alerts detected on/after this date")
    .option("--until <date>", "Only alerts detected on/before this date")
    .option(
      "--alert-type <type>",
      "Filter by metadata.alert_type (repeatable)",
      collect,
    )
    .option("--source-id <id>", "Filter by source id (repeatable)", collect)
    .option("--include-deleted", "Include deleted alerts")
    .option("--only-deleted", "Show only deleted alerts")
    .option("--limit <n>", "Print at most n alerts")
    .option("--offset <n>", "Skip the first n alerts")
    .option("--columns <a,b,c>", "Columns for table/csv output")
    .action(async (options: ListAlertsOptions, cmd: Command) => {
      try {
        const context = createContext(cmd);

        // Validate flags (and build the column set) before the request so
        // a typo is a usage error rather than a connection failure.
        const since = options.since
          ? parseDateBound(options.since, "start")
          : undefined;
        const until = options.until
          ? parseDateBound(options.until, "end")
          : undefined;
        const alertTypes = new Set(
          (options.alertType ?? []).map((value) => value.toLowerCase()),
        );
        const sourceIds = new Set(options.sourceId ?? []);
        const columns = selectColumns(
          ALERT_COLUMNS,
          options.columns,
          ALERT_COLUMNS.map((column) => column.key),
        );
        assertPagination(options);

        const projectId = await requireProjectId(
          context.client,
          options.projectId,
        );

        const response = await context.client.get<ApiList<RemoteAlert>>(
          `/projects/${projectId}/remoteDetectionAlerts`,
        );
        const all = response.data?.data ?? [];

        const matching = all.filter((alert) => {
          if (options.onlyDeleted) {
            if (!alert.deleted) return false;
          } else if (!options.includeDeleted && alert.deleted) {
            return false;
          }

          if (since !== undefined || until !== undefined) {
            const detected = Date.parse(alert.detectionDateStart ?? "");
            if (Number.isNaN(detected)) return false;
            if (since !== undefined && detected < since) return false;
            if (until !== undefined && detected > until) return false;
          }

          if (alertTypes.size > 0) {
            const type = String(alert.metadata?.alert_type ?? "").toLowerCase();
            if (!alertTypes.has(type)) return false;
          }

          if (sourceIds.size > 0 && !sourceIds.has(alert.sourceId))
            return false;

          return true;
        });

        if (options.count) {
          write(renderCount(matching.length, undefined, context.format));
          return;
        }

        const page = paginate(matching, options);

        write(renderList(context.format, columns, page.map(alertRow), page));
      } catch (error) {
        handleError(error);
      }
    });

  program
    .command("create-alert")
    .description("Create a remote detection alert")
    .option(
      "-p, --project-id <id|name>",
      "Project public id or name (or $COMAPEO_PROJECT)",
    )
    .requiredOption("--start-date <date>", "Detection start (ISO timestamp)")
    .requiredOption("--end-date <date>", "Detection end (ISO timestamp)")
    .requiredOption("--source-id <id>", "Source id")
    .requiredOption("--alert-type <type>", "Alert type")
    .requiredOption("--lon <longitude>", "Longitude")
    .requiredOption("--lat <latitude>", "Latitude")
    .addHelpText(
      "after",
      `
This is the only write command in the CLI; everything else is read-only.
Dates are ISO timestamps, coordinates are decimal degrees.

Example:
  $ comapeo-cloud create-alert -p <id> \\
      --start-date 2026-01-01T00:00:00Z --end-date 2026-01-02T00:00:00Z \\
      --source-id src_123 --alert-type motion-detected \\
      --lon -67.890 --lat 12.345
`,
    )
    .action(async (options: CreateAlertOptions, cmd: Command) => {
      try {
        const context = createContext(cmd);
        const projectId = await requireProjectId(
          context.client,
          options.projectId,
        );

        const lon = parseCoordinate(options.lon, "lon", 180);
        const lat = parseCoordinate(options.lat, "lat", 90);

        const start = parseDateBound(options.startDate, "start");
        const end = parseDateBound(options.endDate, "end");
        if (end < start) {
          throw new CliError(
            "--end-date must be after --start-date.",
            EXIT.USAGE,
          );
        }

        const response = await context.client.post(
          `/projects/${projectId}/remoteDetectionAlerts`,
          {
            // Forward normalised ISO timestamps, not the raw input: the
            // server is promised ISO, and a date-only value would
            // otherwise be sent as "2026-01-01".
            detectionDateStart: new Date(start).toISOString(),
            detectionDateEnd: new Date(end).toISOString(),
            sourceId: options.sourceId,
            metadata: { alert_type: options.alertType },
            geometry: { type: "Point", coordinates: [lon, lat] },
          },
        );

        write("remote alert created");
        if (context.verbose) {
          write(JSON.stringify(response.data ?? {}, null, 2));
        }
      } catch (error) {
        handleError(error);
      }
    });
}
