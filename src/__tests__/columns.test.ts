import { describe, expect, it } from "bun:test";
import { alertRow, observationRow } from "../lib/columns.js";
import type { Observation, RemoteAlert } from "../lib/types.js";
import { observations } from "./fixtures/observations.js";

const first = observations[0] as Observation;

describe("observationRow", () => {
  it("abbreviates identifiers and coordinates for the table", () => {
    const row = observationRow(first);
    expect(row.id).toBe(first.docId.slice(0, 8));
    expect(String(row.id)).toHaveLength(8);
    expect(row.created).toBe("2026-01-01 10:00:00");
    expect(String(row.lat)).not.toContain("e");
  });

  it("keeps every value exact for csv, so nothing is silently rounded", () => {
    const row = observationRow(first, { full: true });
    expect(row.id).toBe(first.docId);
    expect(row.created).toBe(first.createdAt);
    expect(row.lat).toBe(first.lat);
    expect(row.lon).toBe(first.lon);
    expect(row.preset).toBe(first.presetRef?.docId);
    expect(row.device).toBe(first.createdBy);
  });

  it("leaves csv cells empty rather than writing a dash placeholder", () => {
    const blank = { ...first, tags: {}, lat: undefined, lon: undefined };
    const full = observationRow(blank, { full: true });
    expect(full.category).toBe("");
    expect(full.lat).toBe("");
    // ...while the table still shows something for a human to read.
    expect(observationRow(blank).category).toBe("-");
    expect(observationRow(blank).lat).toBe("-");
  });
});

describe("alertRow", () => {
  const alert: RemoteAlert = {
    docId: "a".repeat(64),
    detectionDateStart: "2026-01-01T10:00:00.000Z",
    detectionDateEnd: "2026-01-01T11:00:00.000Z",
    sourceId: "src_1",
    metadata: { alert_type: "motion" },
    geometry: { type: "Point", coordinates: [-67.890123456, 12.345678901] },
  };

  it("abbreviates for the table", () => {
    const row = alertRow(alert);
    expect(row.id).toBe("aaaaaaaa");
    expect(row.start).toBe("2026-01-01 10:00:00");
    expect(row.lon).toBe("-67.890123");
  });

  it("keeps full precision for csv", () => {
    const row = alertRow(alert, { full: true });
    expect(row.id).toBe(alert.docId);
    expect(row.start).toBe(alert.detectionDateStart);
    expect(row.lon).toBe(-67.890123456);
    expect(row.lat).toBe(12.345678901);
  });
});
