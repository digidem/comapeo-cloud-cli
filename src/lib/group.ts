import { CliError, EXIT } from "./errors.js";
import { countMedia } from "./filters.js";
import type { Observation } from "./types.js";

export type GroupKey =
  | "category"
  | "preset"
  | "day"
  | "device"
  | "media"
  | `tag:${string}`;

const UNKNOWN = "(none)";

const short = (value: string | undefined, length = 8): string =>
  value ? value.slice(0, length) : UNKNOWN;

/**
 * The deployed servers we have verified do not expose `/presets`, so a
 * preset can only be referenced by its docId prefix. Grouping therefore
 * yields `preset:abb1b841`, not a human preset name.
 */
export function groupValue(observation: Observation, key: GroupKey): string {
  if (key.startsWith("tag:")) {
    const tag = key.slice("tag:".length);
    const value = observation.tags?.[tag];
    if (value === undefined || value === null) return UNKNOWN;
    if (Array.isArray(value))
      return value.length > 0 ? value.join(",") : UNKNOWN;
    return String(value) || UNKNOWN;
  }

  switch (key as "category" | "preset" | "day" | "device" | "media") {
    case "category":
      return String(observation.tags?.categoryId ?? "") || UNKNOWN;
    case "preset":
      return `preset:${short(observation.presetRef?.docId)}`;
    case "day":
      return (observation.createdAt ?? "").slice(0, 10) || UNKNOWN;
    case "device":
      return short(observation.createdBy);
    case "media": {
      const media = countMedia(observation);
      if (media.total === 0) return "none";
      const parts: string[] = [];
      if (media.photos > 0) parts.push("photo");
      if (media.audio > 0) parts.push("audio");
      if (media.video > 0) parts.push("video");
      return parts.join("+") || "other";
    }
  }
}

export function isValidGroupKey(value: string): value is GroupKey {
  return (
    value === "category" ||
    value === "preset" ||
    value === "day" ||
    value === "device" ||
    value === "media" ||
    (value.startsWith("tag:") && value.length > "tag:".length)
  );
}

export function assertGroupKey(value: string): GroupKey {
  if (!isValidGroupKey(value)) {
    throw new CliError(
      `Unknown --group-by "${value}". Use category, preset, day, device, media or tag:<field>.`,
      EXIT.USAGE,
    );
  }
  return value;
}

/** Counts per distinct group value, most frequent first, then alphabetical. */
export function groupCounts(
  observations: Observation[],
  key: GroupKey,
): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const observation of observations) {
    const value = groupValue(observation, key);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
}

export interface Summary {
  total: number;
  active: number;
  deleted: number;
  withoutLocation: number;
  withoutAttachments: number;
  photos: number;
  audio: number;
  devices: number;
  categories: number;
  firstCreatedAt: string | null;
  lastCreatedAt: string | null;
}

/**
 * Summarise the observations that survived filtering, so the numbers
 * always agree with what `--count` reports for the same flags.
 */
export function summarize(observations: Observation[]): Summary {
  let active = 0;
  let deleted = 0;
  let withoutLocation = 0;
  let withoutAttachments = 0;
  let photos = 0;
  let audio = 0;
  const devices = new Set<string>();
  const categories = new Set<string>();
  let first: string | null = null;
  let last: string | null = null;

  for (const observation of observations) {
    if (observation.deleted) deleted += 1;
    else active += 1;

    if (
      typeof observation.lat !== "number" ||
      typeof observation.lon !== "number"
    ) {
      withoutLocation += 1;
    }

    const media = countMedia(observation);
    photos += media.photos;
    audio += media.audio;
    if (media.total === 0) withoutAttachments += 1;

    if (observation.createdBy) devices.add(observation.createdBy);
    const category = observation.tags?.categoryId;
    if (category) categories.add(String(category));

    const created = observation.createdAt;
    if (created) {
      if (first === null || created < first) first = created;
      if (last === null || created > last) last = created;
    }
  }

  return {
    total: observations.length,
    active,
    deleted,
    withoutLocation,
    withoutAttachments,
    photos,
    audio,
    devices: devices.size,
    categories: categories.size,
    firstCreatedAt: first,
    lastCreatedAt: last,
  };
}
