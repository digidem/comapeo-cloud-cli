import type { Observation } from "../../lib/types.js";

/**
 * Synthetic fixture with the same shape as a live `/observations` payload.
 *
 * Deliberately not real field data: the projects this CLI was built against
 * hold observations from indigenous territories, which should not be
 * committed to a public repository. Numbers asserted in the tests are
 * derived from this fixture only.
 */
const docId = (seed: string): string => seed.padEnd(64, "0").slice(0, 64);

const base = {
  schemaName: "observation",
  versionId: "aa/1",
  originalVersionId: "aa/1",
  links: [],
  metadata: {},
};

export const observations: Observation[] = [
  {
    ...base,
    docId: docId("1a"),
    createdAt: "2026-01-01T10:00:00.000Z",
    updatedAt: "2026-01-01T10:00:00.000Z",
    deleted: false,
    lat: -1.1,
    lon: -57.1,
    attachments: [
      {
        url: "https://example.test/projects/p1/attachments/drive1/photo/aaa",
      },
    ],
    tags: {
      categoryId: "agua",
      notes: "Rio principal",
      "tipo-de-corpo-dagua": "rio",
    },
    presetRef: { docId: docId("presetA"), versionId: "p/1", url: "u" },
    createdBy: "deviceA",
  },
  {
    ...base,
    docId: docId("1b"),
    createdAt: "2026-01-02T11:00:00.000Z",
    updatedAt: "2026-01-02T11:00:00.000Z",
    deleted: false,
    lat: -1.2,
    lon: -57.2,
    attachments: [
      {
        url: "https://example.test/projects/p1/attachments/drive1/photo/bbb",
      },
      {
        url: "https://example.test/projects/p1/attachments/drive1/audio/ccc",
      },
    ],
    tags: {
      categoryId: "agua",
      notes: "Igarapé",
      "tipo-de-corpo-dagua": "igarape",
    },
    presetRef: { docId: docId("presetA"), versionId: "p/1", url: "u" },
    createdBy: "deviceA",
  },
  {
    ...base,
    docId: docId("1c"),
    createdAt: "2026-01-03T12:00:00.000Z",
    updatedAt: "2026-01-03T12:00:00.000Z",
    deleted: false,
    lat: -1.3,
    lon: -57.3,
    attachments: [
      {
        url: "https://example.test/projects/p1/attachments/drive1/photo/ddd",
      },
      {
        url: "https://example.test/projects/p1/attachments/drive1/photo/eee",
      },
    ],
    tags: {
      categoryId: "placas-e-limites",
      notes: "Placa 01",
      "tipo-de-placas-e-limites": "placa",
      "condicao-de-placas-e-limites": ["boa-condicao"],
    },
    createdBy: "deviceB",
  },
  {
    ...base,
    docId: docId("1d"),
    createdAt: "2026-01-04T13:00:00.000Z",
    updatedAt: "2026-01-04T13:00:00.000Z",
    deleted: false,
    attachments: [],
    tags: { categoryId: "aldeia-antiga", notes: "Aldeia antiga" },
    createdBy: "deviceB",
  },
  {
    ...base,
    docId: docId("1e"),
    createdAt: "2026-01-05T14:00:00.000Z",
    updatedAt: "2026-01-05T14:00:00.000Z",
    deleted: true,
    lat: -1.5,
    lon: -57.5,
    attachments: [
      {
        url: "https://example.test/projects/p1/attachments/drive1/photo/fff",
      },
    ],
    tags: { categoryId: "agua", "tipo-de-corpo-dagua": "rio" },
    createdBy: "deviceA",
  },
  {
    ...base,
    docId: docId("1f"),
    createdAt: "2026-01-06T15:00:00.000Z",
    updatedAt: "2026-01-06T15:00:00.000Z",
    deleted: false,
    lat: -1.6,
    lon: -57.6,
    attachments: [],
    tags: { categoryId: "coleta" },
    createdBy: "deviceA",
  },
];
