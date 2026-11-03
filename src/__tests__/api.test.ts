import { AxiosError } from "axios";
import {
  describeError,
  isProjectId,
  matchProjects,
  resolveServerConfig,
} from "../lib/api.js";
import { CliError, EXIT } from "../lib/errors.js";
import type { Project } from "../lib/types.js";

const REAL_ID = "ssgqifbqs8c14hpx8djuss4fkqoxkrga6xiqkpw5cscqqpqrjfko";

const projects: Project[] = [
  { projectId: "p1", name: "Vigilância wayamu" },
  { projectId: "p2", name: "Arumatari" },
  { projectId: "p3", name: "Arumatari" },
  { projectId: "p4", name: "Rio mapuera  roowo kurunpenê komo" },
];

describe("isProjectId", () => {
  it("accepts a real 52-char id containing 1, 8 and 9", () => {
    expect(isProjectId(REAL_ID)).toBe(true);
  });

  it("rejects names and truncated ids", () => {
    expect(isProjectId("Expedição 2026")).toBe(false);
    expect(isProjectId(REAL_ID.slice(0, 20))).toBe(false);
    expect(isProjectId(`${REAL_ID} `)).toBe(true); // trailing space trimmed
  });
});

describe("matchProjects", () => {
  it("prefers an exact case-insensitive name", () => {
    const { matches, exact } = matchProjects(projects, "vigilância wayamu");
    expect(exact).toBe(true);
    expect(matches.map((p) => p.projectId)).toEqual(["p1"]);
  });

  it("falls back to a substring match", () => {
    const { matches, exact } = matchProjects(projects, "mapuera");
    expect(exact).toBe(false);
    expect(matches.map((p) => p.projectId)).toEqual(["p4"]);
  });

  it("returns every duplicate so the caller can report ambiguity", () => {
    expect(matchProjects(projects, "Arumatari").matches).toHaveLength(2);
  });

  it("returns nothing for an unknown name", () => {
    expect(matchProjects(projects, "nope").matches).toHaveLength(0);
  });
});

describe("resolveServerConfig", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it("reads the historical env var names", () => {
    process.env.SERVER_URL = "https://example.test/";
    process.env.SERVER_BEARER_TOKEN = "token";
    delete process.env.COMAPEO_SERVER_URL;
    delete process.env.COMAPEO_SERVER_TOKEN;
    expect(resolveServerConfig({})).toEqual({
      serverUrl: "https://example.test",
      serverToken: "token",
      timeoutMs: 30_000,
    });
  });

  it("accepts the COMAPEO_-prefixed aliases", () => {
    delete process.env.SERVER_URL;
    delete process.env.SERVER_BEARER_TOKEN;
    process.env.COMAPEO_SERVER_URL = "https://alias.test";
    process.env.COMAPEO_SERVER_TOKEN = "alias-token";
    expect(resolveServerConfig({}).serverToken).toBe("alias-token");
  });

  it("prefers flags over environment", () => {
    process.env.SERVER_URL = "https://env.test";
    process.env.SERVER_BEARER_TOKEN = "env-token";
    expect(
      resolveServerConfig({
        serverUrl: "https://flag.test",
        serverToken: "flag-token",
      }),
    ).toMatchObject({
      serverUrl: "https://flag.test",
      serverToken: "flag-token",
    });
  });

  it("strips trailing slashes from the URL", () => {
    expect(
      resolveServerConfig({
        serverUrl: "https://x.test///",
        serverToken: "t",
      }).serverUrl,
    ).toBe("https://x.test");
  });

  it("fails with a usage error naming the env var", () => {
    delete process.env.SERVER_URL;
    delete process.env.COMAPEO_SERVER_URL;
    expect(() => resolveServerConfig({ serverToken: "t" })).toThrow(
      /SERVER_URL must be provided/,
    );
  });

  it("validates the timeout", () => {
    expect(() =>
      resolveServerConfig({
        serverUrl: "https://x.test",
        serverToken: "t",
        timeout: "soon",
      }),
    ).toThrow(/--timeout/);
  });
});

describe("describeError", () => {
  it("passes CliError through untouched", () => {
    const original = new CliError("boom", EXIT.USAGE);
    expect(describeError(original)).toBe(original);
  });

  it("explains a 401 as an auth problem", () => {
    const error = new AxiosError(
      "Request failed",
      "ERR_BAD_REQUEST",
      undefined,
      undefined,
      {
        status: 401,
        data: { message: "Unauthorized" },
        statusText: "Unauthorized",
        headers: {},
        config: {} as never,
      },
    );
    expect(describeError(error).message).toMatch(/Authentication failed/);
  });

  it("explains a 404 with the path and a next step", () => {
    const error = new AxiosError(
      "Request failed",
      "ERR_BAD_REQUEST",
      { url: "/projects/x/observation" } as never,
      undefined,
      {
        status: 404,
        data: { message: "Route not found" },
        statusText: "Not Found",
        headers: {},
        config: {} as never,
      },
    );
    const described = describeError(error);
    expect(described.message).toMatch(/Not found \(HTTP 404\)/);
    expect(described.message).toMatch(/list-projects/);
    expect(described.exitCode).toBe(EXIT.NOT_FOUND);
  });

  it("wraps a plain Error", () => {
    expect(describeError(new Error("nope")).message).toBe("nope");
  });
});
