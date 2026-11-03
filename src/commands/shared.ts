import type { Command } from "commander";
import { CliError, EXIT } from "../lib/errors.js";
import type { FilterOptions } from "../lib/filters.js";

/** Repeatable option collector: `--tag a=b --tag c=d` -> ["a=b", "c=d"]. */
export const collect = (value: string, previous: string[] = []): string[] => [
  ...previous,
  value,
];

export interface FilterCliOptions {
  category?: string[];
  tag?: string[];
  preset?: string;
  since?: string;
  until?: string;
  bbox?: string;
  has?: string[];
  missing?: string[];
  search?: string;
  includeDeleted?: boolean;
  onlyDeleted?: boolean;
}

/**
 * The filter flag set shared by `list-observations` and `export-geojson`,
 * so whatever you can list you can also export.
 */
export function addFilterOptions(command: Command): Command {
  return command
    .option(
      "--category <id[,id]>",
      "Filter by tags.categoryId (repeatable, comma separated)",
      collect,
      [],
    )
    .option(
      "--tag <key=value>",
      "Filter by any tag; repeatable, use v1|v2 for OR",
      collect,
      [],
    )
    .option("--preset <docId>", "Filter by preset docId prefix")
    .option(
      "--since <date>",
      "Only records created on/after this date (YYYY-MM-DD or ISO)",
    )
    .option("--until <date>", "Only records created on/before this date")
    .option(
      "--bbox <w,s,e,n>",
      "Only observations inside a lon/lat bounding box",
    )
    .option(
      "--has <kind>",
      "Only with photo|audio|video|attachment|location|notes|preset (repeatable)",
      collect,
      [],
    )
    .option(
      "--missing <kind>",
      "Only without photo|audio|video|attachment|location|notes|preset (repeatable)",
      collect,
      [],
    )
    .option("--search <text>", "Substring match over notes and tag values")
    .option("--include-deleted", "Include deleted (tombstoned) documents")
    .option("--only-deleted", "Show only deleted documents");
}

export function toFilterOptions(options: FilterCliOptions): FilterOptions {
  return {
    category: options.category,
    tag: options.tag,
    preset: options.preset,
    since: options.since,
    until: options.until,
    bbox: options.bbox,
    has: options.has,
    missing: options.missing,
    search: options.search,
    includeDeleted: options.includeDeleted,
    onlyDeleted: options.onlyDeleted,
  };
}

/** Validate `--limit` / `--offset` without needing the data. */
export function assertPagination(options: {
  limit?: string;
  offset?: string;
}): void {
  for (const [name, raw] of [
    ["limit", options.limit],
    ["offset", options.offset],
  ] as const) {
    if (raw === undefined) continue;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 0 || `${parsed}` !== raw.trim()) {
      throw new CliError(
        `--${name} must be a non-negative integer, got "${raw}".`,
        EXIT.USAGE,
      );
    }
  }
}

/** `--limit` / `--offset` applied after filtering and sorting. */
export function paginate<T>(
  items: T[],
  options: { limit?: string; offset?: string },
): T[] {
  assertPagination(options);
  const offset = options.offset ? Number.parseInt(options.offset, 10) : 0;
  const limit = options.limit ? Number.parseInt(options.limit, 10) : undefined;
  const end = limit === undefined ? undefined : offset + limit;
  return items.slice(offset, end);
}
