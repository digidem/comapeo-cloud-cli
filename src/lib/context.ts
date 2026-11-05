import type { AxiosInstance } from "axios";
import type { Command } from "commander";
import {
  createApiClient,
  resolveServerConfig,
  type ServerConfig,
} from "./api.js";
import { resolveFormat, type OutputFormat } from "./format.js";

export interface GlobalCliOptions {
  serverUrl?: string;
  serverToken?: string;
  timeout?: string;
  format?: string;
  color?: boolean;
  verbose?: boolean;
}

export function globalOptions(command: Command): GlobalCliOptions {
  return command.optsWithGlobals() as GlobalCliOptions;
}

export interface Context {
  config: ServerConfig;
  client: AxiosInstance;
  format: OutputFormat;
  verbose: boolean;
}

/** Everything a command needs, resolved from flags + environment once. */
export function createContext(command: Command): Context {
  const options = globalOptions(command);
  const config = resolveServerConfig(options);
  return {
    config,
    client: createApiClient(config),
    format: resolveFormat(options.format),
    verbose: options.verbose === true,
  };
}
