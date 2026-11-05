import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { observations } from "./fixtures/observations.js";

/**
 * End-to-end test against a stub CoMapeo server.
 *
 * The other CLI tests only cover help, version and rejection paths, which
 * would all still pass if fetching, filtering or rendering were broken.
 * This one proves the whole pipeline: HTTP fetch, client-side filter,
 * count, group, paginate and render, with the real binary.
 *
 * The stub also asserts the CLI does not send query parameters, which is
 * the documented server contract (it would ignore them anyway).
 */

const CLI_PATH = join(process.cwd(), "dist", "index.js");
const PROJECT_ID = "a".repeat(52);

interface RecordedRequest {
  path: string;
  query: string;
}

let server: Server;
let baseUrl = "";
let requests: RecordedRequest[] = [];

const startServer = async (): Promise<void> => {
  server = createServer((req, res) => {
    const [path, query = ""] = (req.url ?? "").split("?");
    requests.push({ path, query });

    res.setHeader("content-type", "application/json");

    if (path === "/healthcheck") {
      res.end("{}");
      return;
    }

    if (path === "/projects") {
      res.end(
        JSON.stringify({
          data: [{ projectId: PROJECT_ID, name: "Fixture project" }],
        }),
      );
      return;
    }

    if (path === `/projects/${PROJECT_ID}/observations`) {
      res.end(JSON.stringify({ data: observations }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ message: "Route not found" }));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("stub server failed to bind");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
};

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

const runCli = (args: string[]): Promise<RunResult> =>
  new Promise((resolve) => {
    const child = spawn("node", [CLI_PATH, ...args], {
      env: {
        ...process.env,
        SERVER_URL: baseUrl,
        SERVER_BEARER_TOKEN: "test-token",
        // Make sure a developer's own defaults cannot leak in.
        COMAPEO_PROJECT: "",
        COMAPEO_SERVER_URL: "",
        COMAPEO_SERVER_TOKEN: "",
        NO_COLOR: "1",
      },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });

beforeAll(startServer);

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

beforeEach(() => {
  requests = [];
});

describe("end to end against a stub server", () => {
  it("counts live observations and excludes tombstones", async () => {
    const { stdout, code } = await runCli([
      "list-observations",
      "-p",
      PROJECT_ID,
      "--count",
    ]);
    expect(code).toBe(0);
    expect(stdout.trim()).toBe("5");
  });

  it("includes tombstones on request", async () => {
    const { stdout } = await runCli([
      "list-observations",
      "-p",
      PROJECT_ID,
      "--count",
      "--include-deleted",
    ]);
    expect(stdout.trim()).toBe("6");
  });

  it("applies filters before counting", async () => {
    const { stdout } = await runCli([
      "list-observations",
      "-p",
      PROJECT_ID,
      "--count",
      "--category",
      "agua",
    ]);
    expect(stdout.trim()).toBe("2");
  });

  it("renders paginated CSV rows, not just the count", async () => {
    const { stdout, code } = await runCli([
      "list-observations",
      "-p",
      PROJECT_ID,
      "--format",
      "csv",
      "--limit",
      "2",
    ]);
    expect(code).toBe(0);
    const lines = stdout.trim().split("\n");
    expect(lines[0]).toContain("category");
    expect(lines).toHaveLength(3); // header + 2 rows

    // CSV has to be usable as data: the id must be the real 64-char docId
    // and the timestamp the server's ISO value, not the table's abbreviations.
    const cells = lines[1].split(",");
    const id = cells[0];
    const created = cells[lines[0].split(",").indexOf("created")];
    expect(id).toHaveLength(64);
    expect(created).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("groups counts as tab separated rows for table output", async () => {
    const { stdout } = await runCli([
      "list-observations",
      "-p",
      PROJECT_ID,
      "--count",
      "--group-by",
      "category",
      "--format",
      "table",
    ]);
    expect(stdout.split("\n")[0]).toBe("agua\t2");
  });

  it("emits a machine readable summary as JSON", async () => {
    const { stdout } = await runCli([
      "list-observations",
      "-p",
      PROJECT_ID,
      "--summary",
      "--format",
      "json",
    ]);
    const parsed = JSON.parse(stdout) as {
      projectId: string;
      summary: { total: number; photos: number; audio: number };
    };
    expect(parsed.projectId).toBe(PROJECT_ID);
    expect(parsed.summary.total).toBe(5);
    // Photos are counted per attachment, not per observation: 1 photo each
    // in "1a" and "1b", two in "1c". The tombstoned "1e" photo is excluded.
    expect(parsed.summary.photos).toBe(4);
    expect(parsed.summary.audio).toBe(1);
  });

  it("resolves a project name to its id", async () => {
    const { stdout, code } = await runCli([
      "list-observations",
      "-p",
      "Fixture project",
      "--count",
    ]);
    expect(code).toBe(0);
    expect(stdout.trim()).toBe("5");
  });

  it("never sends query parameters, which the server would ignore", async () => {
    await runCli(["list-observations", "-p", PROJECT_ID, "--count"]);
    const observationRequests = requests.filter((request) =>
      request.path.endsWith("/observations"),
    );
    expect(observationRequests).toHaveLength(1);
    expect(observationRequests[0].query).toBe("");
  });

  it("reports an unknown option as a usage error", async () => {
    const { code, stderr } = await runCli(["list-observations", "--nope"]);
    expect(stderr).toContain("unknown option");
    expect(code).toBe(2);
  });

  it("exits 3 when the server has no such route", async () => {
    const { code, stderr } = await runCli(["info"]);
    expect(stderr).toContain("Not found (HTTP 404)");
    expect(code).toBe(3);
  });

  it("prints ok on a healthy server", async () => {
    const { stdout, code } = await runCli(["healthcheck"]);
    expect(code).toBe(0);
    expect(stdout.trim()).toBe("ok");
  });

  it("exits quietly when the reader closes the pipe early", async () => {
    // `comapeo-cloud list-observations | head -1` must not print an EPIPE
    // stack trace over the output. Closing the read end before the child
    // writes makes the failure deterministic instead of a race.
    const result = await new Promise<{ code: number | null; stderr: string }>(
      (resolve) => {
        const child = spawn("node", [CLI_PATH, "--help"], {
          env: { ...process.env, NO_COLOR: "1" },
        });
        let stderr = "";
        child.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
        });
        child.stdout.destroy();
        child.on("close", (code) => resolve({ code, stderr }));
      },
    );

    expect(result.stderr).not.toContain("EPIPE");
    expect(result.code).toBe(0);
  });
});
