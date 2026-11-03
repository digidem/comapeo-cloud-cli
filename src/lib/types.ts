/**
 * Wire types for the CoMapeo Cloud API.
 *
 * Mirrors `src/datatypes/observation.js` in digidem/comapeo-cloud. The
 * deployed server also exposes `/track`, `/preset` and `/field` in newer
 * builds, but this CLI only relies on the two endpoints that exist on
 * every deployment we have verified: `/projects`, `/projects/:id/observation`
 * (plus the deprecated `/observations` alias) and
 * `/projects/:id/remoteDetectionAlerts`.
 */

export type TagValue =
  | boolean
  | number
  | string
  | null
  | Array<boolean | number | string | null>;

export interface Attachment {
  url?: string;
}

export interface PresetRef {
  docId: string;
  versionId: string;
  url: string;
}

export interface Observation {
  docId: string;
  versionId: string;
  originalVersionId?: string;
  schemaName: string;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
  lat?: number;
  lon?: number;
  attachments: Attachment[];
  tags: Record<string, TagValue>;
  presetRef?: PresetRef;
  createdBy?: string;
  updatedBy?: string;
  metadata?: Record<string, unknown>;
  links?: string[];
}

export interface Project {
  projectId: string;
  name: string;
}

export interface RemoteAlert {
  docId: string;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
  detectionDateStart: string;
  detectionDateEnd: string;
  sourceId: string;
  metadata?: Record<string, unknown>;
  geometry?: { type: string; coordinates: number[] };
}

/** Every list endpoint wraps its payload in `{ data: [...] }`. */
export interface ApiList<T> {
  data: T[];
}

export interface ApiItem<T> {
  data: T;
}

/** Attachment media kind, derived from `/attachments/<drive>/<kind>/<name>`. */
export type MediaKind = "photo" | "audio" | "video" | "unknown";
