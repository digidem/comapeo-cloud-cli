import chalk from "chalk";
import { CliError, EXIT } from "./errors.js";

export type OutputFormat = "table" | "json" | "ndjson" | "csv";

const FORMATS: OutputFormat[] = ["table", "json", "ndjson", "csv"];

/**
 * Default to a table on a terminal and JSON when piped, so `| jq` keeps
 * working unchanged while interactive use stays readable.
 */
export function resolveFormat(explicit?: string): OutputFormat {
  if (explicit === undefined || explicit === "") {
    return process.stdout.isTTY ? "table" : "json";
  }
  const normalised = explicit.toLowerCase();
  if (!FORMATS.includes(normalised as OutputFormat)) {
    throw new CliError(
      `Unknown --format "${explicit}". Use one of: ${FORMATS.join(", ")}.`,
      EXIT.USAGE,
    );
  }
  return normalised as OutputFormat;
}

export interface Column {
  key: string;
  header: string;
  align?: "left" | "right";
  maxWidth?: number;
}

export type Row = Record<string, string | number | null | undefined>;

const truncate = (value: string, maxWidth?: number): string => {
  if (!maxWidth || value.length <= maxWidth) return value;
  if (maxWidth <= 1) return value.slice(0, maxWidth);
  return `${value.slice(0, maxWidth - 1)}…`;
};

const cellText = (row: Row, column: Column): string => {
  const raw = row[column.key];
  if (raw === undefined || raw === null) return "";
  return truncate(String(raw), column.maxWidth);
};

const pad = (value: string, width: number, align: "left" | "right"): string =>
  align === "right" ? value.padStart(width) : value.padEnd(width);

/** Plain two-space-separated table with a dim rule under the header. */
export function renderTable(columns: Column[], rows: Row[]): string {
  if (rows.length === 0) return chalk.dim("(no matches)");

  const widths = columns.map((column) =>
    Math.max(
      column.header.length,
      ...rows.map((row) => cellText(row, column).length),
    ),
  );

  const header = columns
    .map((column, index) => pad(column.header, widths[index], "left"))
    .join("  ");
  const rule = widths.map((width) => "─".repeat(width)).join("  ");

  const body = rows.map((row) =>
    columns
      .map((column, index) =>
        pad(cellText(row, column), widths[index], column.align ?? "left"),
      )
      .join("  "),
  );

  return [chalk.bold(header), chalk.dim(rule), ...body].join("\n");
}

const csvEscape = (value: string): string =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export function renderCsv(columns: Column[], rows: Row[]): string {
  const lines = [columns.map((column) => csvEscape(column.header)).join(",")];
  for (const row of rows) {
    lines.push(
      columns.map((column) => csvEscape(cellText(row, column))).join(","),
    );
  }
  return lines.join("\n");
}

/**
 * Render a list for the chosen format.
 *
 * `table` and `csv` project through `columns`; `json` and `ndjson`
 * always emit the untouched records so nothing is lost to column
 * selection when piping into jq.
 */
export function renderList<T>(
  format: OutputFormat,
  columns: Column[],
  rows: Row[],
  records: T[],
): string {
  switch (format) {
    case "table":
      return renderTable(columns, rows);
    case "csv":
      return renderCsv(columns, rows);
    case "ndjson":
      return records.map((record) => JSON.stringify(record)).join("\n");
    case "json":
      return JSON.stringify(records, null, 2);
  }
}

/**
 * `--count` output: a bare number with no decoration, because the whole
 * point is `$(comapeo-cloud ... --count)` inside a script.
 * Grouped counts are tab-separated so `| column -t` still works.
 */
export function renderCount(
  total: number,
  counts: Array<[string, number]> | undefined,
  format: OutputFormat,
): string {
  if (!counts) return String(total);

  if (format === "json") {
    return JSON.stringify(Object.fromEntries(counts), null, 2);
  }
  if (format === "csv") {
    return [
      "value,count",
      ...counts.map(([key, n]) => `${csvEscape(key)},${n}`),
    ].join("\n");
  }
  return counts.map(([key, n]) => `${key}\t${n}`).join("\n");
}

export interface SummaryLine {
  label: string;
  value: string;
}

export function renderSummary(lines: SummaryLine[]): string {
  if (lines.length === 0) return "";
  const width = Math.max(...lines.map((line) => line.label.length));
  return lines
    .map(
      (line) =>
        `${chalk.dim(line.label.padEnd(width))}  ${chalk.bold(line.value)}`,
    )
    .join("\n");
}

export function write(text: string): void {
  if (text === "") return;
  process.stdout.write(`${text}\n`);
}
