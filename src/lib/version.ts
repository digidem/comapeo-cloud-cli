import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Read the version from package.json instead of hardcoding it.
 * `src/lib/version.ts` and `dist/lib/version.js` are both two levels
 * below the package root, so the same relative path works for the
 * compiled binary and for ts-jest.
 */
export function getVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(here, "..", "..", "package.json"), "utf8");
    return (JSON.parse(raw) as { version?: string }).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
