/**
 * Deprecated re-export shim.
 *
 * `helpers.ts` used to hold validateEnv/getApiClient/handleError. The
 * implementation now lives in `src/lib/api.ts`; this file stays so any
 * local script importing the old path keeps compiling.
 */
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
