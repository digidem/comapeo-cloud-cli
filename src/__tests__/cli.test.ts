import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CLI_PATH = join(process.cwd(), "dist", "index.js");
const PACKAGE_VERSION = (
  JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
    version: string;
  }
).version;

interface RunResult {
  code: number | null;
  output: string;
}

describe("CLI Commands", () => {
  const runCommand = (
    args: string[] = [],
    includeEnv = false,
  ): Promise<RunResult> => {
    return new Promise((resolve) => {
      const env = {
        ...process.env,
        // A developer's own COMAPEO_* defaults would otherwise satisfy
        // the "project required" case or point at a real server.
        COMAPEO_PROJECT: "",
        COMAPEO_SERVER_URL: "",
        COMAPEO_SERVER_TOKEN: "",
        ...(includeEnv
          ? {
              SERVER_URL: "http://localhost:3000",
              SERVER_BEARER_TOKEN: "test-token",
            }
          : {
              SERVER_URL: "",
              SERVER_BEARER_TOKEN: "",
            }),
      };

      const cli = spawn("node", [CLI_PATH, ...args], { env });

      let output = "";

      cli.stdout.on("data", (data) => {
        output += data.toString();
      });

      cli.stderr.on("data", (data) => {
        output += data.toString();
      });

      cli.on("close", (code) => {
        resolve({ code, output });
      });
    });
  };

  it("should show help when no command is provided", async () => {
    const { output } = await runCommand(["--help"], true);
    expect(output).toContain("Usage:");
    expect(output).toContain("Commands:");
    expect(output).toContain("Options:");
  });

  it("should show the version from package.json", async () => {
    const { output } = await runCommand(["--version"], true);
    expect(output).toMatch(/\d+\.\d+\.\d+/);
    expect(output.trim()).toBe(PACKAGE_VERSION);
  });

  it("should require SERVER_URL for API commands", async () => {
    const { output, code } = await runCommand(["list-projects"]);
    expect(output).toContain(
      "SERVER_URL must be provided as an environment variable or with --server-url",
    );
    expect(code).toBe(2);
  });

  it("should advertise the filtering and counting flags", async () => {
    const { output } = await runCommand(["list-observations", "--help"], true);
    for (const flag of [
      "--count",
      "--group-by",
      "--summary",
      "--category",
      "--tag",
      "--since",
      "--until",
      "--bbox",
      "--has",
      "--missing",
      "--include-deleted",
      "--columns",
    ]) {
      expect(output).toContain(flag);
    }
  });

  it("should reject an unknown output format", async () => {
    const { output, code } = await runCommand(
      ["list-projects", "--format", "yaml"],
      true,
    );
    expect(output).toContain('Unknown --format "yaml"');
    expect(code).toBe(2);
  });

  it("should require a project for list-observations", async () => {
    const { output, code } = await runCommand(["list-observations"], true);
    expect(output).toContain("A project is required");
    expect(code).toBe(2);
  });

  it("should reject an unknown --group-by value before any request", async () => {
    const { output, code } = await runCommand(
      [
        "list-observations",
        "--project-id",
        "x",
        "--group-by",
        "colour",
        "--count",
      ],
      true,
    );
    expect(output).toContain('Unknown --group-by "colour"');
    expect(code).toBe(2);
  });

  it("should reject an unknown column", async () => {
    const { output, code } = await runCommand(
      ["list-observations", "--project-id", "x", "--columns", "nope"],
      true,
    );
    expect(output).toContain('Unknown column "nope"');
    expect(code).toBe(2);
  });

  it("should reject a non-numeric --limit", async () => {
    const { output, code } = await runCommand(
      ["list-observations", "--project-id", "x", "--limit", "ten"],
      true,
    );
    expect(output).toContain("--limit must be a non-negative integer");
    expect(code).toBe(2);
  });
});
