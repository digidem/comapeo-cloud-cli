import { spawn } from "node:child_process";
import { join } from "node:path";

const CLI_PATH = join(process.cwd(), "dist", "index.js");

describe("CLI Commands", () => {
  const runCommand = (
    args: string[] = [],
    includeEnv = false,
  ): Promise<{ code: number | null; output: string }> => {
    return new Promise((resolve) => {
      const env = {
        ...process.env,
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

  it("should show version number", async () => {
    const { output } = await runCommand(["--version"], true);
    expect(output).toMatch(/\d+\.\d+\.\d+/);
  });

  it("should require SERVER_URL and SERVER_BEARER_TOKEN for API commands", async () => {
    const { output } = await runCommand(["list-projects"]);
    expect(output).toContain(
      "Error: SERVER_URL must be provided either as environment variable or --server-url option",
    );
  });
});
