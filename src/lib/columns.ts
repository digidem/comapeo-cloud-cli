import { CliError, EXIT } from "./errors.js";
import { countMedia } from "./filters.js";
import type { Column, Row } from "./format.js";
import type { Observation, Project, RemoteAlert } from "./types.js";

const dash = (value: unknown): string => {
  if (value === undefined || value === null || value === "") return "-";
  return String(value);
};

const mediaCell = (observation: Observation): string => {
  const media = countMedia(observation);
  if (media.total === 0) return "-";
  const parts: string[] = [];
  if (media.photos > 0) parts.push(`${media.photos}p`);
  if (media.audio > 0) parts.push(`${media.audio}a`);
  if (media.video > 0) parts.push(`${media.video}v`);
  return parts.join("/");
};

export const OBSERVATION_COLUMNS: Column[] = [
  { key: "id", header: "id" },
  { key: "created", header: "created" },
  { key: "updated", header: "updated" },
  { key: "category", header: "category" },
  { key: "notes", header: "notes", maxWidth: 32 },
  { key: "media", header: "media", align: "right" },
  { key: "photos", header: "photos", align: "right" },
  { key: "audio", header: "audio", align: "right" },
  { key: "lat", header: "lat", align: "right" },
  { key: "lon", header: "lon", align: "right" },
  { key: "preset", header: "preset" },
  { key: "device", header: "device" },
  { key: "deleted", header: "deleted" },
];

export const DEFAULT_OBSERVATION_COLUMNS = [
  "id",
  "created",
  "category",
  "notes",
  "media",
  "lat",
  "lon",
];

export const ALL_OBSERVATION_COLUMNS = OBSERVATION_COLUMNS.map(
  (column) => column.key,
);

/** Render full values (csv) instead of terminal-shaped cells (table). */
export interface RowDetail {
  full?: boolean;
}

export function observationRow(
  observation: Observation,
  detail: RowDetail = {},
): Row {
  const full = detail.full === true;
  const media = countMedia(observation);
  // Empty for csv, "-" for the table: "-" is a display placeholder that
  // would otherwise be imported as a real value.
  const cell = (value: unknown): string =>
    full
      ? value === undefined || value === null
        ? ""
        : String(value)
      : dash(value);
  const short = (value: string | undefined): string =>
    full ? (value ?? "") : (value ?? "").replace("T", " ").slice(0, 19);

  return {
    // csv gets the identifiers, timestamps and coordinates exactly as the
    // server sent them; the table gets cells sized for a terminal.
    id: full ? observation.docId : observation.docId.slice(0, 8),
    created: short(observation.createdAt),
    updated: short(observation.updatedAt),
    category: cell(observation.tags?.categoryId),
    notes: cell(observation.tags?.notes),
    media: mediaCell(observation),
    photos: media.photos,
    audio: media.audio,
    lat:
      observation.lat === undefined
        ? full
          ? ""
          : "-"
        : full
          ? observation.lat
          : observation.lat.toFixed(6),
    lon:
      observation.lon === undefined
        ? full
          ? ""
          : "-"
        : full
          ? observation.lon
          : observation.lon.toFixed(6),
    preset: full
      ? (observation.presetRef?.docId ?? "")
      : (observation.presetRef?.docId.slice(0, 8) ?? "-"),
    device: full
      ? (observation.createdBy ?? "")
      : (observation.createdBy?.slice(0, 8) ?? "-"),
    deleted: observation.deleted ? "yes" : "no",
  };
}

export const PROJECT_COLUMNS: Column[] = [
  { key: "projectId", header: "projectId" },
  { key: "name", header: "name" },
];

export function projectRow(project: Project): Row {
  return { projectId: project.projectId, name: project.name };
}

export const ALERT_COLUMNS: Column[] = [
  { key: "id", header: "id" },
  { key: "start", header: "detectionStart" },
  { key: "end", header: "detectionEnd" },
  { key: "alertType", header: "alertType" },
  { key: "sourceId", header: "sourceId" },
  { key: "lon", header: "lon", align: "right" },
  { key: "lat", header: "lat", align: "right" },
];

export function alertRow(alert: RemoteAlert, detail: RowDetail = {}): Row {
  const full = detail.full === true;
  const coordinates = alert.geometry?.coordinates ?? [];
  const cell = (value: unknown): string =>
    full
      ? value === undefined || value === null
        ? ""
        : String(value)
      : dash(value);
  const time = (value: string | undefined): string =>
    full ? (value ?? "") : (value ?? "").replace("T", " ").slice(0, 19);
  const coordinate = (value: unknown): string | number => {
    if (typeof value !== "number") return full ? "" : "-";
    return full ? value : value.toFixed(6);
  };

  return {
    id: full ? alert.docId : alert.docId.slice(0, 8),
    start: time(alert.detectionDateStart),
    end: time(alert.detectionDateEnd),
    alertType: cell(alert.metadata?.alert_type),
    sourceId: cell(alert.sourceId),
    lon: coordinate(coordinates[0]),
    lat: coordinate(coordinates[1]),
  };
}

/**
 * Resolve `--columns` against a known column set. Unknown names are a
 * usage error listing the valid ones, rather than silently empty cells.
 */
export function selectColumns(
  available: Column[],
  requested: string | undefined,
  fallback: string[],
): Column[] {
  const keys = requested
    ? requested
        .split(",")
        .map((key) => key.trim().toLowerCase())
        .filter((key) => key !== "")
    : fallback;

  const byKey = new Map(available.map((column) => [column.key, column]));
  const selected: Column[] = [];

  for (const key of keys) {
    const column = byKey.get(key);
    if (!column) {
      throw new CliError(
        `Unknown column "${key}". Available: ${available.map((c) => c.key).join(", ")}.`,
        EXIT.USAGE,
      );
    }
    selected.push(column);
  }

  return selected;
}
