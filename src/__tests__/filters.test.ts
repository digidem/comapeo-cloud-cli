import {
  countMedia,
  filterObservations,
  mediaKind,
  parseBbox,
  parseDateBound,
  parseTagExpression,
  sortObservations,
} from "../lib/filters.js";
import { observations } from "./fixtures/observations.js";

const ids = (list: { docId: string }[]): string[] =>
  list.map((observation) => observation.docId.slice(0, 2));

describe("media helpers", () => {
  it("derives the media kind from the attachment URL", () => {
    expect(mediaKind("https://x/projects/p/attachments/d/photo/abc")).toBe(
      "photo",
    );
    expect(mediaKind("https://x/projects/p/attachments/d/audio/abc")).toBe(
      "audio",
    );
    expect(mediaKind("https://x/projects/p/attachments/d/other/abc")).toBe(
      "unknown",
    );
    expect(mediaKind(undefined)).toBe("unknown");
  });

  it("counts photos and audio separately", () => {
    expect(countMedia(observations[1])).toEqual({
      photos: 1,
      audio: 1,
      video: 0,
      total: 2,
    });
    expect(countMedia(observations[3]).total).toBe(0);
  });
});

describe("parseDateBound", () => {
  it("anchors a date-only bound to the start of the day", () => {
    expect(parseDateBound("2026-01-02", "start")).toBe(
      Date.parse("2026-01-02T00:00:00.000Z"),
    );
  });

  it("anchors an end bound to the end of the day, so the day is included", () => {
    expect(parseDateBound("2026-01-02", "end")).toBe(
      Date.parse("2026-01-02T23:59:59.999Z"),
    );
  });

  it("passes full timestamps through untouched", () => {
    expect(parseDateBound("2026-01-02T10:00:00Z", "end")).toBe(
      Date.parse("2026-01-02T10:00:00Z"),
    );
  });

  it("rejects garbage", () => {
    expect(() => parseDateBound("last tuesday", "start")).toThrow(
      /Cannot parse date/,
    );
  });
});

describe("parseBbox / parseTagExpression", () => {
  it("parses west,south,east,north", () => {
    expect(parseBbox("-57.4,-1.5,-57.1,-1.0")).toEqual({
      west: -57.4,
      south: -1.5,
      east: -57.1,
      north: -1.0,
    });
  });

  it("rejects a bbox with the wrong number of parts", () => {
    expect(() => parseBbox("-57.4,-1.5")).toThrow(/west,south,east,north/);
  });

  it("rejects trailing garbage instead of parseFloat-style truncation", () => {
    expect(() => parseBbox("-57.4junk,-1.5,-57.1,-1.0")).toThrow(
      /west,south,east,north/,
    );
  });

  it("rejects inverted bounds", () => {
    expect(() => parseBbox("-57.1,-1.5,-57.4,-1.0")).toThrow(/inverted/);
    expect(() => parseBbox("-57.4,-1.0,-57.1,-1.5")).toThrow(/inverted/);
  });

  it("parses key=value and OR lists", () => {
    expect(parseTagExpression("tipo=rio|igarape")).toEqual({
      key: "tipo",
      values: ["rio", "igarape"],
    });
  });

  it("rejects a tag expression without =", () => {
    expect(() => parseTagExpression("rio")).toThrow(/key=value/);
  });
});

describe("filterObservations", () => {
  it("excludes deleted documents by default", () => {
    expect(filterObservations(observations, {})).toHaveLength(5);
  });

  it("includes deleted documents on request", () => {
    expect(
      filterObservations(observations, { includeDeleted: true }),
    ).toHaveLength(6);
  });

  it("can show only deleted documents", () => {
    expect(
      ids(filterObservations(observations, { onlyDeleted: true })),
    ).toEqual(["1e"]);
  });

  it("filters by category, comma separated or repeated", () => {
    expect(
      filterObservations(observations, { category: ["agua"] }),
    ).toHaveLength(2);
    expect(
      filterObservations(observations, {
        category: ["agua", "coleta"],
      }),
    ).toHaveLength(3);
    expect(
      filterObservations(observations, { category: ["agua,coleta"] }),
    ).toHaveLength(3);
  });

  it("matches scalar and array-valued tags, including OR lists", () => {
    expect(
      filterObservations(observations, { tag: ["tipo-de-corpo-dagua=rio"] }),
    ).toHaveLength(1);
    expect(
      filterObservations(observations, {
        tag: ["tipo-de-corpo-dagua=rio|igarape"],
      }),
    ).toHaveLength(2);
    expect(
      filterObservations(observations, {
        tag: ["condicao-de-placas-e-limites=boa-condicao"],
      }),
    ).toHaveLength(1);
  });

  it("requires every --tag expression to match", () => {
    expect(
      filterObservations(observations, {
        tag: ["tipo-de-corpo-dagua=rio", "categoryId=coleta"],
      }),
    ).toHaveLength(0);
  });

  it("filters by media presence and absence", () => {
    expect(filterObservations(observations, { has: ["audio"] })).toHaveLength(
      1,
    );
    expect(
      filterObservations(observations, { missing: ["attachment"] }),
    ).toHaveLength(2);
  });

  it("filters by location presence", () => {
    expect(
      filterObservations(observations, { missing: ["location"] }),
    ).toHaveLength(1);
  });

  it("filters by inclusive date range", () => {
    expect(
      filterObservations(observations, {
        since: "2026-01-02",
        until: "2026-01-03",
      }),
    ).toHaveLength(2);
  });

  it("filters by bounding box", () => {
    expect(
      filterObservations(observations, { bbox: "-57.25,-1.35,-57.05,-1.05" }),
    ).toHaveLength(2);
  });

  it("searches notes and tag values", () => {
    expect(
      filterObservations(observations, { search: "igarapé" }),
    ).toHaveLength(1);
    expect(filterObservations(observations, { search: "placa" })).toHaveLength(
      1,
    );
  });

  it("filters by preset docId prefix", () => {
    expect(
      filterObservations(observations, { preset: "presetA" }),
    ).toHaveLength(2);
  });

  it("rejects an unknown --has token before touching the data", () => {
    expect(() =>
      filterObservations(observations, { has: ["hologram"] }),
    ).toThrow(/Unknown --has\/--missing value/);
  });

  it("combines filters conjunctively", () => {
    expect(
      filterObservations(observations, {
        category: ["agua"],
        has: ["audio"],
      }),
    ).toHaveLength(1);
  });
});

describe("sortObservations", () => {
  it("sorts by createdAt ascending by default", () => {
    expect(
      ids(sortObservations(observations, "createdAt")).slice(0, 2),
    ).toEqual(["1a", "1b"]);
  });

  it("reverses on request", () => {
    expect(
      ids(sortObservations(observations, "createdAt", true)).slice(0, 2),
    ).toEqual(["1f", "1e"]);
  });

  it("sorts on epoch time, so differing ISO offsets stay chronological", () => {
    const withOffsets = [
      {
        ...observations[0],
        docId: "late-utc",
        createdAt: "2026-01-01T00:00:00Z",
      },
      {
        ...observations[0],
        docId: "early-local",
        createdAt: "2026-01-01T01:00:00+02:00",
      },
    ];
    // "01:00+02:00" is 23:00Z on Dec 31, i.e. earlier than "00:00Z".
    expect(ids(sortObservations(withOffsets, "createdAt"))).toEqual([
      "ea",
      "la",
    ]);
  });

  it("sorts media-rich observations last when sorting by media", () => {
    const sorted = sortObservations(observations, "media");
    expect(countMedia(sorted[sorted.length - 1]).total).toBe(2);
  });
});
