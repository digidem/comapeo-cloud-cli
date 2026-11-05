import type { AxiosInstance } from "axios";
import { CliError, EXIT } from "./errors.js";
import type { SortKey } from "./filters.js";
import type { ApiList, Observation } from "./types.js";

const SORT_KEYS: SortKey[] = [
  "createdAt",
  "updatedAt",
  "category",
  "notes",
  "media",
  "id",
];

export function assertSortKey(value: string): SortKey {
  if (!SORT_KEYS.includes(value as SortKey)) {
    throw new CliError(
      `Unknown --sort "${value}". Use one of: ${SORT_KEYS.join(", ")}.`,
      EXIT.USAGE,
    );
  }
  return value as SortKey;
}

/**
 * Fetch every observation for a project.
 *
 * The endpoint accepts no query parameters and returns tombstones too
 * (`includeDeleted: true` server-side), so pagination, filtering and
 * counting all happen in this process — see lib/filters.ts.
 */
export async function fetchObservations(
  client: AxiosInstance,
  projectId: string,
): Promise<Observation[]> {
  const response = await client.get<ApiList<Observation>>(
    `/projects/${projectId}/observations`,
  );
  const data = response.data?.data;
  if (!Array.isArray(data)) {
    throw new CliError(
      "Unexpected response from the server: expected an object with a `data` array.",
      EXIT.FAILURE,
    );
  }
  return data;
}
