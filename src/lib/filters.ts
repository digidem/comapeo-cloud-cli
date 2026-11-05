import { CliError, EXIT } from "./errors.js";
import type { MediaKind, Observation, TagValue } from "./types.js";

/**
 * All filtering in this CLI happens client-side: the server's
 * `/projects/:id/observations` route accepts no query parameters and
 * always returns every document, tombstones included. These functions
 * are therefore pure and take a plain observation, which keeps them
 * testable without a network or a fixtures server.
 */

export interface FilterOptions {
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

/** `.../attachments/<driveId>/<kind>/<name>` -> kind */
export function mediaKind(url: string | undefined): MediaKind {
  if (!url) return "unknown";
  const match = url.match(/\/attachments\/[^/]+\/([^/]+)\/[^/]+$/);
  if (!match) return "unknown";
  const kind = match[1].toLowerCase();
  if (kind === "photo" || kind === "audio" || kind === "video") return kind;
  return "unknown";
}

export function countMedia(observation: Observation): {
  photos: number;
  audio: number;
  video: number;
  total: number;
} {
  let photos = 0;
  let audio = 0;
  let video = 0;
  for (const attachment of observation.attachments ?? []) {
    const kind = mediaKind(attachment.url);
    if (kind === "photo") photos += 1;
    else if (kind === "audio") audio += 1;
    else if (kind === "video") video += 1;
  }
  return {
    photos,
    audio,
    video,
    total: (observation.attachments ?? []).length,
  };
}

/**
 * Split `12.5` / `2026-10-29` / `2026-10-29T13:00:00Z` into epoch ms.
 * Date-only values are anchored to the start or end of the UTC day
 * depending on the bound, so `--until 2026-10-29` includes all of the
 * 29th rather than excluding everything after midnight.
 */
export function parseDateBound(value: string, bound: "start" | "end"): number {
  const trimmed = value.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const iso = dateOnly
    ? `${trimmed}T${bound === "start" ? "00:00:00.000" : "23:59:59.999"}Z`
    : trimmed;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    throw new CliError(
      `Cannot parse date "${value}". Use YYYY-MM-DD or a full ISO timestamp.`,
      EXIT.USAGE,
    );
  }
  return parsed;
}

export interface BoundingBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Parse `west,south,east,north` (the GeoJSON / Overpass bbox order). */
export function parseBbox(value: string): BoundingBox {
  const parts = value.split(",").map((part) => part.trim());
  // Number() rather than parseFloat(): parseFloat("10junk") is 10, which
  // would silently accept a typo'd box.
  if (
    parts.length !== 4 ||
    parts.some((part) => part === "" || !Number.isFinite(Number(part)))
  ) {
    throw new CliError(
      `--bbox expects "west,south,east,north" in degrees, got "${value}".`,
      EXIT.USAGE,
    );
  }
  const [west, south, east, north] = parts.map(Number);
  if (west > east || south > north) {
    throw new CliError(
      `--bbox bounds are inverted: expected west<=east and south<=north, got "${value}". Antimeridian-crossing boxes are not supported.`,
      EXIT.USAGE,
    );
  }
  return { west, south, east, north };
}

/**
 * Parse a repeatable `--tag key=value` expression.
 * Values may be a `|`-separated set (`rio|igarape`) and are compared
 * against both scalar tags and array-valued tags.
 */
export interface TagExpression {
  key: string;
  values: string[];
}

export function parseTagExpression(value: string): TagExpression {
  const separator = value.indexOf("=");
  if (separator <= 0) {
    throw new CliError(
      `--tag expects "key=value", got "${value}". Example: --tag tipo-de-corpo-dagua=rio`,
      EXIT.USAGE,
    );
  }
  const key = value.slice(0, separator).trim();
  const raw = value.slice(separator + 1).trim();
  const values = raw
    .split("|")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part !== "");
  if (key === "" || values.length === 0) {
    throw new CliError(
      `--tag expects "key=value", got "${value}".`,
      EXIT.USAGE,
    );
  }
  return { key, values };
}

export const flattenTagValue = (value: TagValue | undefined): string[] => {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value))
    return value.map((item) => String(item).toLowerCase());
  return [String(value).toLowerCase()];
};

const tagValueText = (value: TagValue | undefined): string =>
  flattenTagValue(value).join(" ");

const matchesTagExpression = (
  observation: Observation,
  expression: TagExpression,
): boolean => {
  const present = flattenTagValue(observation.tags?.[expression.key]);
  if (present.length === 0) return false;
  return expression.values.some((wanted) => present.includes(wanted));
};

const HAS_TOKENS = [
  "photo",
  "photos",
  "audio",
  "video",
  "attachment",
  "attachments",
  "media",
  "location",
  "coords",
  "notes",
  "preset",
] as const;

const assertHasToken = (token: string): void => {
  if (!(HAS_TOKENS as readonly string[]).includes(token)) {
    throw new CliError(
      `Unknown --has/--missing value "${token}". Use photo, audio, video, attachment, location, notes or preset.`,
      EXIT.USAGE,
    );
  }
};

const matchesHas = (observation: Observation, token: string): boolean => {
  assertHasToken(token);
  const media = countMedia(observation);
  switch (token) {
    case "photo":
    case "photos":
      return media.photos > 0;
    case "audio":
      return media.audio > 0;
    case "video":
      return media.video > 0;
    case "attachment":
    case "attachments":
    case "media":
      return media.total > 0;
    case "location":
    case "coords":
      return (
        typeof observation.lat === "number" &&
        typeof observation.lon === "number"
      );
    case "notes":
      return String(observation.tags?.notes ?? "").trim() !== "";
    case "preset":
      return Boolean(observation.presetRef?.docId);
    default:
      return false;
  }
};

/** Build the predicate for a set of CLI filter options. */
export function buildPredicate(
  options: FilterOptions,
): (observation: Observation) => boolean {
  const parsedTags = (options.tag ?? []).map(parseTagExpression);
  const since = options.since
    ? parseDateBound(options.since, "start")
    : undefined;
  const until = options.until
    ? parseDateBound(options.until, "end")
    : undefined;
  const bbox = options.bbox ? parseBbox(options.bbox) : undefined;
  const categories = new Set(
    (options.category ?? [])
      .flatMap((entry) => entry.split(","))
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry !== ""),
  );
  const has = (options.has ?? []).map((entry) => entry.trim().toLowerCase());
  const missing = (options.missing ?? []).map((entry) =>
    entry.trim().toLowerCase(),
  );
  const preset = options.preset?.trim();
  const search = options.search?.trim().toLowerCase();

  // Validate up-front so a typo fails on the first call, not on the
  // first observation that happens to reach the branch.
  for (const token of [...has, ...missing]) {
    assertHasToken(token);
  }

  return (observation: Observation): boolean => {
    if (options.onlyDeleted) {
      if (!observation.deleted) return false;
    } else if (!options.includeDeleted && observation.deleted) {
      return false;
    }

    if (categories.size > 0) {
      const category = String(observation.tags?.categoryId ?? "").toLowerCase();
      if (!categories.has(category)) return false;
    }

    for (const expression of parsedTags) {
      if (!matchesTagExpression(observation, expression)) return false;
    }

    if (preset) {
      const docId = observation.presetRef?.docId ?? "";
      if (!docId.toLowerCase().startsWith(preset.toLowerCase())) return false;
    }

    if (since !== undefined || until !== undefined) {
      const created = Date.parse(observation.createdAt);
      if (Number.isNaN(created)) return false;
      if (since !== undefined && created < since) return false;
      if (until !== undefined && created > until) return false;
    }

    if (bbox) {
      const { lat, lon } = observation;
      if (typeof lat !== "number" || typeof lon !== "number") return false;
      if (lon < bbox.west || lon > bbox.east) return false;
      if (lat < bbox.south || lat > bbox.north) return false;
    }

    for (const token of has) {
      if (!matchesHas(observation, token)) return false;
    }

    for (const token of missing) {
      if (matchesHas(observation, token)) return false;
    }

    if (search) {
      const haystack = [
        String(observation.tags?.notes ?? ""),
        ...Object.entries(observation.tags ?? {}).flatMap(([key, value]) => [
          key,
          tagValueText(value),
        ]),
        observation.presetRef?.docId ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    return true;
  };
}

export type SortKey =
  | "createdAt"
  | "updatedAt"
  | "category"
  | "notes"
  | "media"
  | "id";

/**
 * Sort on epoch milliseconds, not on the raw string: ISO timestamps with
 * different offsets (`...T01:00:00+02:00` vs `...T00:00:00Z`) sort
 * chronologically wrong as strings. Zero-padded so the numeric compare
 * still works when these are used as strings.
 */
const epochKey = (value: string | undefined): string => {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? "" : String(parsed).padStart(15, "0");
};

const sortValue = (observation: Observation, key: SortKey): string => {
  switch (key) {
    case "createdAt":
      return epochKey(observation.createdAt);
    case "updatedAt":
      return epochKey(observation.updatedAt);
    case "category":
      return String(observation.tags?.categoryId ?? "");
    case "notes":
      return String(observation.tags?.notes ?? "");
    case "media": {
      const media = countMedia(observation);
      return String(media.total).padStart(6, "0");
    }
    case "id":
      return observation.docId ?? "";
  }
};

export function sortObservations(
  observations: Observation[],
  key: SortKey,
  reverse = false,
): Observation[] {
  const direction = reverse ? -1 : 1;
  // Negate the comparison instead of reversing the result: reverse()
  // would also flip the order of equal keys, making `--reverse`
  // inconsistent with a plain sort.
  return [...observations].sort(
    (a, b) => direction * sortValue(a, key).localeCompare(sortValue(b, key)),
  );
}

export function filterObservations(
  observations: Observation[],
  options: FilterOptions,
): Observation[] {
  return observations.filter(buildPredicate(options));
}
