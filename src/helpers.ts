/**
 * Deprecated re-export shim.
 *
 * `helpers.ts` used to hold validateEnv/getApiClient/handleError. The
 * implementation now lives in `src/lib/api.ts`; this file stays so any
 * local script importing the old path keeps working, including
 * `validateEnv`, which is kept as a thin adapter over resolveServerConfig.
 */
import { resolveServerConfig } from "./lib/api.js";

export {
  createApiClient,
  describeError,
  getApiClient,
  handleError,
  isProjectId,
  matchProjects,
  resolveProjectId,
  resolveServerConfig,
} from "./lib/api.js";

export { EXIT, CliError } from "./lib/errors.js";

/**
 * Legacy validator: throws if the server URL or token is missing.
 * Prefer `resolveServerConfig()`; this exists only for compatibility.
 */
export function validateEnv(serverUrl?: string, serverToken?: string): void {
  resolveServerConfig({ serverUrl, serverToken });
}
