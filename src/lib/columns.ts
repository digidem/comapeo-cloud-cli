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

export function observationRow(observation: Observation): Row {
  const media = countMedia(observation);
  return {
    id: observation.docId.slice(0, 8),
    created: (observation.createdAt ?? "").replace("T", " ").slice(0, 19),
    updated: (observation.updatedAt ?? "").replace("T", " ").slice(0, 19),
    category: dash(observation.tags?.categoryId),
    notes: dash(observation.tags?.notes),
    media: mediaCell(observation),
    photos: media.photos,
    audio: media.audio,
    lat: observation.lat === undefined ? "-" : observation.lat.toFixed(6),
    lon: observation.lon === undefined ? "-" : observation.lon.toFixed(6),
    preset: observation.presetRef?.docId.slice(0, 8) ?? "-",
    device: observation.createdBy?.slice(0, 8) ?? "-",
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

export function alertRow(alert: RemoteAlert): Row {
  const coordinates = alert.geometry?.coordinates ?? [];
  return {
    id: alert.docId.slice(0, 8),
    start: (alert.detectionDateStart ?? "").replace("T", " ").slice(0, 19),
    end: (alert.detectionDateEnd ?? "").replace("T", " ").slice(0, 19),
    alertType: dash(alert.metadata?.alert_type),
    sourceId: dash(alert.sourceId),
    lon: typeof coordinates[0] === "number" ? coordinates[0].toFixed(6) : "-",
    lat: typeof coordinates[1] === "number" ? coordinates[1].toFixed(6) : "-",
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
