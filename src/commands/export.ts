import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import chalk from "chalk";
import type { Command } from "commander";
import JSZip from "jszip";
import { handleError, requireProjectId } from "../lib/api.js";
import { createContext } from "../lib/context.js";
import { CliError, EXIT } from "../lib/errors.js";
import { buildPredicate, mediaKind } from "../lib/filters.js";
import { write } from "../lib/format.js";
import { fetchObservations } from "../lib/observations.js";
import type { Observation } from "../lib/types.js";
import {
  addFilterOptions,
  toFilterOptions,
  type FilterCliOptions,
} from "./shared.js";

const DEFAULT_OUTPUT = "comapeo_export.zip";
const DOWNLOAD_CONCURRENCY = 6;

interface ExportOptions extends FilterCliOptions {
  projectId?: string;
  output?: string;
  attachments?: boolean;
}

interface GeoJsonFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] } | null;
  id: string;
  properties: Record<string, unknown>;
}

/** Attachment path shape: .../projects/<id>/attachments/<drive>/<kind>/<name> */
const parseAttachmentUrl = (url: string) => {
  const match = url.match(/\/attachments\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (!match) return undefined;
  const [, driveId, kind, name] = match;
  return { driveId, kind, name };
};

const extensionFor = (kind: string): string => {
  if (kind === "photo") return ".jpg";
  if (kind === "audio") return ".mp3";
  return extname(kind) || "";
};

/** Run async work with a small concurrency cap instead of a 112-wide Promise.all. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        results[index] = await task(items[index], index);
      }
    },
  );

  await Promise.all(workers);
  return results;
}

export function registerExportCommand(program: Command): void {
  const command = program
    .command("export-geojson")
    .description(
      "Export project observations as GeoJSON, optionally zipped with media",
    )
    .option(
      "-p, --project-id <id|name>",
      "Project public id or name (or $COMAPEO_PROJECT)",
    )
    .option(
      "-o, --output <path>",
      `Output file. ".zip" (default ${DEFAULT_OUTPUT}) bundles media, ".geojson" writes plain GeoJSON`,
    )
    .option("--no-attachments", "Skip media downloads (metadata only)")
    .addHelpText(
      "after",
      `
The output extension decides the container: .zip is an archive holding
comapeo_data.geojson plus images/ and audio/, .geojson writes the GeoJSON
alone and downloads nothing. --no-attachments on a .zip still produces a
zip, just without media files. Filters are the same as list-observations.

GeoJSON properties are the observation tags (categoryId, notes, preset
fields) plus $created, $modified, $version, $photos, $audio and, for
tombstones, $deleted.

Examples:
  $ comapeo-cloud export-geojson -p <id> -o export.zip
  $ comapeo-cloud export-geojson -p <id> -o export.geojson --no-attachments
  $ comapeo-cloud export-geojson -p <id> --category agua --since 2026-10-29 -o water.zip
`,
    );

  addFilterOptions(command).action(
    async (options: ExportOptions, cmd: Command) => {
      try {
        const context = createContext(cmd);

        const output = options.output ?? DEFAULT_OUTPUT;
        const extension = extname(output).toLowerCase();
        if (extension !== ".zip" && extension !== ".geojson") {
          throw new CliError(
            `--output must end in .zip (bundle with media) or .geojson (plain GeoJSON), got "${output}".`,
            EXIT.USAGE,
          );
        }

        // The container follows the extension; downloading media is a
        // separate decision. Keeping them independent is what makes
        // `--no-attachments -o out.zip` a valid (media-less) archive
        // rather than raw GeoJSON inside a .zip file.
        const container = extension === ".zip" ? "zip" : "geojson";
        const wantsMedia = container === "zip" && options.attachments !== false;

        // Validate filter flags before the network round trip.
        const predicate = buildPredicate(toFilterOptions(options));

        const projectId = await requireProjectId(
          context.client,
          options.projectId,
        );
        const all = await fetchObservations(context.client, projectId);
        const matching = all.filter(predicate);

        if (matching.length === 0) {
          throw new CliError(
            "No observations match those filters; nothing to export.",
            EXIT.NOT_FOUND,
          );
        }

        const tmpRoot =
          container === "zip"
            ? await mkdtemp(join(tmpdir(), "comapeo-export-"))
            : undefined;

        try {
          if (tmpRoot) {
            await mkdir(join(tmpRoot, "images"), { recursive: true });
            await mkdir(join(tmpRoot, "audio"), { recursive: true });
          }

          const usedNames = new Set<string>();
          let downloaded = 0;
          let failed = 0;

          const download = async (
            url: string,
            kind: string,
          ): Promise<string | null> => {
            if (!tmpRoot) return null;
            const parts = parseAttachmentUrl(url);
            if (!parts) return null;

            const folder = kind === "audio" ? "audio" : "images";
            const stem = basename(parts.name);
            let candidate = stem + extensionFor(kind);
            let suffix = 2;
            while (usedNames.has(`${folder}/${candidate}`)) {
              candidate = `${stem}-${suffix}${extensionFor(kind)}`;
              suffix += 1;
            }
            usedNames.add(`${folder}/${candidate}`);

            try {
              const response = await context.client.get(
                `/projects/${projectId}/attachments/${parts.driveId}/${parts.kind}/${parts.name}`,
                { responseType: "arraybuffer" },
              );
              await writeFile(
                join(tmpRoot, folder, candidate),
                Buffer.from(response.data as ArrayBuffer),
              );
              downloaded += 1;
              return `${folder}/${candidate}`;
            } catch (error) {
              failed += 1;
              if (context.verbose) {
                const message =
                  error instanceof Error ? error.message : String(error);
                console.error(
                  chalk.yellow(`failed to download ${url}: ${message}`),
                );
              }
              return null;
            }
          };

          const features = await mapLimit(
            matching,
            DOWNLOAD_CONCURRENCY,
            async (observation: Observation): Promise<GeoJsonFeature> => {
              const photos: string[] = [];
              const audio: string[] = [];

              for (const attachment of observation.attachments ?? []) {
                if (!wantsMedia || !attachment.url) continue;
                const kind = mediaKind(attachment.url);
                if (kind !== "photo" && kind !== "audio") continue;
                const saved = await download(attachment.url, kind);
                if (!saved) continue;
                if (kind === "photo") photos.push(saved);
                else audio.push(saved);
              }

              if (context.verbose) {
                console.error(
                  chalk.dim(
                    `${observation.docId.slice(0, 8)} ${photos.length} photo(s), ${audio.length} audio`,
                  ),
                );
              }

              // Tags were previously dropped here entirely: the interface
              // declared categoryId/name/notes but the object never set
              // them, so every export lost its categories and field data.
              // $audio is always written (even empty) so a tag of the same
              // name can never collide with the media list.
              const properties: Record<string, unknown> = {
                ...observation.tags,
                $created: observation.createdAt,
                $modified: observation.updatedAt,
                $version: `${observation.docId}@1`,
                $photos: photos,
                $audio: audio,
              };
              if (observation.deleted) properties.$deleted = true;

              const hasLocation =
                typeof observation.lat === "number" &&
                typeof observation.lon === "number";

              return {
                type: "Feature",
                geometry: hasLocation
                  ? {
                      type: "Point",
                      coordinates: [
                        observation.lon as number,
                        observation.lat as number,
                      ],
                    }
                  : null,
                id: observation.docId,
                properties,
              };
            },
          );

          const featureCollection = {
            type: "FeatureCollection" as const,
            features,
          };

          if (!tmpRoot) {
            await writeFile(output, JSON.stringify(featureCollection, null, 2));
            write(`exported ${features.length} observations -> ${output}`);
            return;
          }

          await writeFile(
            join(tmpRoot, "comapeo_data.geojson"),
            JSON.stringify(featureCollection, null, 2),
          );

          const zip = new JSZip();
          zip.file(
            "comapeo_data.geojson",
            await readFile(join(tmpRoot, "comapeo_data.geojson")),
          );

          let mediaCount = 0;
          for (const folder of ["images", "audio"]) {
            const folderPath = join(tmpRoot, folder);
            const files = await readdir(folderPath);
            for (const file of files) {
              mediaCount += 1;
              zip.file(
                `${folder}/${file}`,
                await readFile(join(folderPath, file)),
              );
            }
          }

          const archive = await zip.generateAsync({ type: "nodebuffer" });
          await writeFile(output, archive);

          write(
            `exported ${features.length} observations (${mediaCount} media, ${archive.length} bytes) -> ${output}`,
          );

          if (failed > 0) {
            console.error(
              chalk.yellow(
                `warning: ${failed} attachment(s) failed to download; the archive is incomplete. Re-run with -v for details.`,
              ),
            );
          }
        } finally {
          if (tmpRoot) {
            await rm(tmpRoot, { recursive: true, force: true });
          }
        }
      } catch (error) {
        handleError(error);
      }
    },
  );
}
