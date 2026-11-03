import {
  assertGroupKey,
  groupCounts,
  groupValue,
  summarize,
} from "../lib/group.js";
import { observations } from "./fixtures/observations.js";

describe("groupCounts", () => {
  it("counts by category, most frequent first", () => {
    expect(groupCounts(observations, "category")).toEqual([
      ["agua", 3],
      ["aldeia-antiga", 1],
      ["coleta", 1],
      ["placas-e-limites", 1],
    ]);
  });

  it("counts by day", () => {
    const counts = groupCounts(observations, "day");
    expect(counts).toHaveLength(6);
    expect(counts[0]).toEqual(["2026-01-01", 1]);
  });

  it("counts by media combination", () => {
    expect(groupCounts(observations, "media")).toEqual([
      ["photo", 3],
      ["none", 2],
      ["photo+audio", 1],
    ]);
  });

  it("counts by arbitrary tag", () => {
    expect(groupCounts(observations, "tag:tipo-de-corpo-dagua")).toEqual([
      ["(none)", 3],
      ["rio", 2],
      ["igarape", 1],
    ]);
  });

  it("groups presets by docId prefix because preset names are unavailable", () => {
    expect(groupValue(observations[0], "preset")).toBe("preset:presetA0");
  });
});

describe("assertGroupKey", () => {
  it("accepts the documented values", () => {
    expect(assertGroupKey("category")).toBe("category");
    expect(assertGroupKey("tag:notes")).toBe("tag:notes");
  });

  it("rejects anything else", () => {
    expect(() => assertGroupKey("colour")).toThrow(/Unknown --group-by/);
    expect(() => assertGroupKey("tag:")).toThrow(/Unknown --group-by/);
  });
});

describe("summarize", () => {
  it("reports the same totals the assertions above rely on", () => {
    const summary = summarize(observations);
    expect(summary).toMatchObject({
      total: 6,
      active: 5,
      deleted: 1,
      withoutLocation: 1,
      withoutAttachments: 2,
      photos: 5,
      audio: 1,
      devices: 2,
      categories: 4,
    });
  });

  it("reports the created date range", () => {
    const summary = summarize(observations);
    expect(summary.firstCreatedAt).toBe("2026-01-01T10:00:00.000Z");
    expect(summary.lastCreatedAt).toBe("2026-01-06T15:00:00.000Z");
  });
});
