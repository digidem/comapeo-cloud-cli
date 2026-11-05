import axios, { AxiosError, type AxiosInstance } from "axios";
import chalk from "chalk";
import { config } from "dotenv";
import { CliError, EXIT } from "./errors.js";
import type { ApiList, Project } from "./types.js";

config();

/**
 * Project public ids are 52-character lowercase alphanumeric strings, e.g.
 * `ssgqifbqs8c14hpx8djuss4fkqoxkrga6xiqkpw5cscqqpqrjfko`.
 *
 * The alphabet is [a-z0-9], not RFC4648 base32: real ids contain 1, 8 and
 * 9 (`...c14hpx8...`), which base32 would reject.
 */
const PROJECT_ID_PATTERN = /^[a-z0-9]{52}$/;

const DEFAULT_TIMEOUT_MS = 30_000;

export interface ServerConfig {
  serverUrl: string;
  serverToken: string;
  timeoutMs: number;
}

export interface ServerOptionInput {
  serverUrl?: string;
  serverToken?: string;
  timeout?: string | number;
}

const pickEnv = (...names: string[]): string | undefined => {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim() !== "") return value;
  }
  return undefined;
};

/**
 * Resolve server configuration from flags, then environment.
 *
 * The historical names are SERVER_URL / SERVER_BEARER_TOKEN. The
 * COMAPEO_-prefixed aliases exist because the un-prefixed names are
 * generic enough to collide with other tooling in a shared shell.
 */
export function resolveServerConfig(options: ServerOptionInput): ServerConfig {
  const serverUrl =
    options.serverUrl ?? pickEnv("SERVER_URL", "COMAPEO_SERVER_URL");
  const serverToken =
    options.serverToken ??
    pickEnv("SERVER_BEARER_TOKEN", "COMAPEO_SERVER_TOKEN");

  if (!serverUrl) {
    throw new CliError(
      [
        "SERVER_URL must be provided as an environment variable or with --server-url.",
        "  export SERVER_URL=https://your-server.example/",
        "  comapeo-cloud -s https://your-server.example/ ...",
      ].join("\n"),
      EXIT.USAGE,
    );
  }

  if (!serverToken) {
    throw new CliError(
      [
        "SERVER_BEARER_TOKEN must be provided as an environment variable or with --server-token.",
        "  export SERVER_BEARER_TOKEN=your-token",
        "  comapeo-cloud -t your-token ...",
      ].join("\n"),
      EXIT.USAGE,
    );
  }

  // Reject anything that is not a plain integer: parseInt("1e3") is 1 and
  // parseInt("30000ms") is 30000, both of which silently change behaviour.
  const rawTimeout =
    options.timeout === undefined ? undefined : String(options.timeout).trim();
  if (rawTimeout !== undefined && !/^\d+$/.test(rawTimeout)) {
    throw new CliError(
      `--timeout must be a positive integer number of milliseconds, got "${options.timeout}".`,
      EXIT.USAGE,
    );
  }

  const timeoutMs =
    rawTimeout === undefined
      ? DEFAULT_TIMEOUT_MS
      : Number.parseInt(rawTimeout, 10);

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new CliError(
      `--timeout must be a positive number of milliseconds, got "${options.timeout}".`,
      EXIT.USAGE,
    );
  }

  return {
    serverUrl: serverUrl.replace(/\/+$/, ""),
    serverToken,
    timeoutMs,
  };
}

export function createApiClient(config: ServerConfig): AxiosInstance {
  return axios.create({
    baseURL: config.serverUrl,
    timeout: config.timeoutMs,
    headers: {
      Authorization: `Bearer ${config.serverToken}`,
      "Content-Type": "application/json",
    },
  });
}

/** Convenience: validate config and build a client in one step. */
export function getApiClient(options: ServerOptionInput): AxiosInstance {
  return createApiClient(resolveServerConfig(options));
}

export function isProjectId(value: string): boolean {
  return PROJECT_ID_PATTERN.test(value.trim());
}

/**
 * Pure project matching, extracted so it can be unit tested without a
 * server. Precedence: exact case-insensitive name, then substring.
 */
export function matchProjects(
  projects: Project[],
  input: string,
): { matches: Project[]; exact: boolean } {
  const needle = input.trim().toLowerCase();
  const exact = projects.filter((p) => p.name.trim().toLowerCase() === needle);
  if (exact.length > 0) return { matches: exact, exact: true };
  return {
    matches: projects.filter((p) => p.name.toLowerCase().includes(needle)),
    exact: false,
  };
}

/**
 * Accept either a project public id or a project name.
 *
 * Ids are passed straight through (no round trip). Names are resolved
 * against /projects; an ambiguous name lists the candidates rather than
 * silently picking one.
 */
export async function resolveProjectId(
  client: AxiosInstance,
  input: string,
): Promise<string> {
  const value = input.trim();
  if (value === "") {
    // An empty needle substring-matches every project, which on a
    // single-project server would silently pick that project.
    throw new CliError(
      "Refusing an empty project: pass -p/--project-id <id|name> or set COMAPEO_PROJECT.",
      EXIT.USAGE,
    );
  }
  if (isProjectId(value)) return value;

  const response = await client.get<ApiList<Project>>("/projects");
  const projects = response.data.data ?? [];
  const { matches, exact } = matchProjects(projects, value);

  if (matches.length === 1) return matches[0].projectId;

  if (matches.length === 0) {
    throw new CliError(
      `No project matches "${input}". Run "comapeo-cloud list-projects" to see the available projects.`,
      EXIT.NOT_FOUND,
    );
  }

  const listed = matches.map((p) => `  ${p.projectId}  ${p.name}`).join("\n");
  throw new CliError(
    `Project name "${input}" is ambiguous (${matches.length} ${exact ? "exact" : "partial"} matches):\n${listed}\nPass a project id, or a longer fragment of the name.`,
    EXIT.USAGE,
  );
}

/** Project id from a flag or $COMAPEO_PROJECT, resolved to a public id. */
export async function requireProjectId(
  client: AxiosInstance,
  fromFlag?: string,
): Promise<string> {
  const input = fromFlag ?? pickEnv("COMAPEO_PROJECT");
  if (!input || input.trim() === "") {
    throw new CliError(
      "A project is required: pass -p/--project-id <id|name>, or set COMAPEO_PROJECT.",
      EXIT.USAGE,
    );
  }
  return resolveProjectId(client, input);
}

/**
 * Turn axios/network failures into messages that say what to do next,
 * rather than echoing the raw HTTP status.
 */
export function describeError(error: unknown, config?: ServerConfig): CliError {
  if (error instanceof CliError) return error;

  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const apiMessage =
      (error.response?.data as { message?: string } | undefined)?.message ??
      error.message;

    if (status === 401 || status === 403) {
      return new CliError(
        `Authentication failed (HTTP ${status}) at ${config?.serverUrl ?? "the server"}.\n  ${apiMessage}\nCheck SERVER_BEARER_TOKEN / --server-token.`,
        EXIT.FAILURE,
      );
    }

    if (status === 404) {
      return new CliError(
        `Not found (HTTP 404): ${error.config?.url ?? "unknown path"}.\n  ${apiMessage}\nCheck the project id (run "comapeo-cloud list-projects") and that the server build exposes that endpoint.`,
        EXIT.NOT_FOUND,
      );
    }

    if (error.code === "ECONNABORTED") {
      return new CliError(
        `Request timed out after ${config?.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms. Retry with a larger --timeout.`,
        EXIT.FAILURE,
      );
    }

    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      return new CliError(
        `Cannot reach ${config?.serverUrl ?? "the server"} (${error.code}). Check the URL and your network.`,
        EXIT.FAILURE,
      );
    }

    return new CliError(
      `API error${status ? ` (HTTP ${status})` : ""}: ${apiMessage}`,
      EXIT.FAILURE,
    );
  }

  if (error instanceof Error) return new CliError(error.message, EXIT.FAILURE);

  return new CliError(String(error), EXIT.FAILURE);
}

export function handleError(error: unknown, config?: ServerConfig): void {
  const cliError = describeError(error, config);
  console.error(chalk.red(`Error: ${cliError.message}`));
  // Set the code instead of calling process.exit(): exiting mid-write
  // truncates piped stdout/stderr, which is exactly how `| jq` and CI
  // log capture lose the final line.
  process.exitCode = cliError.exitCode;
}
