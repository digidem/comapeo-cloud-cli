#!/usr/bin/env node
import { Command } from "commander";
import { writeFile } from "node:fs/promises";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import JSZip from "jszip";
import chalk from "chalk";
import { validateEnv, getApiClient, handleError } from "./helpers.js";

export const program = new Command();

interface AlertOptions {
  projectId: string;
  startDate: string;
  endDate: string;
  sourceId: string;
  alertType: string;
  lon: string;
  lat: string;
  serverUrl?: string;
  serverToken?: string;
}

interface ServerInfoOptions {
  serverUrl?: string;
  serverToken?: string;
}

// Shared utility functions
const getOutputFilename = (
  name: string,
  type: string,
  providedOutput?: string,
): string => {
  const extension = type === "photo" ? ".jpg" : ".mp3";
  return providedOutput || `${name}${extension}`;
};

const downloadAttachment = async (
  projectId: string,
  driveId: string,
  type: string,
  name: string,
  variant: string,
  serverUrl?: string,
  serverToken?: string,
): Promise<Buffer> => {
  const response = await getApiClient({
    serverUrl,
    serverToken,
  }).get(
    `/projects/${projectId}/attachments/${driveId}/${type}/${name}${variant}`,
    { responseType: "arraybuffer" },
  );
  return Buffer.from(response.data);
};

const getUrlComponents = (url: string) => {
  const urlMatch = url.match(
    /\/projects\/([^\/]+)\/attachments\/([^\/]+)\/([^\/]+)\/([^\/]+)$/,
  );
  if (!urlMatch) {
    throw new Error("Invalid attachment URL format");
  }
  const [, projectId, driveId, type, name] = urlMatch;
  return { projectId, driveId, type, name };
};

program
  .name("comapeo-cloud")
  .description("CLI tool for interacting with Comapeo Cloud API")
  .version("1.0.0")
  .option("-s, --server-url <url>", "Server URL (overrides SERVER_URL env var)")
  .option(
    "-t, --server-token <token>",
    "Server bearer token (overrides SERVER_BEARER_TOKEN env var)",
  );

// Server Info Command
program
  .command("info")
  .description("Get server information")
  .action(async (options: ServerInfoOptions) => {
    try {
      validateEnv(
        options.serverUrl || program.opts().serverUrl,
        options.serverToken || program.opts().serverToken,
      );
      const response = await getApiClient({
        serverUrl: options.serverUrl || program.opts().serverUrl,
        serverToken: options.serverToken || program.opts().serverToken,
      }).get("/info");
      console.log(chalk.green("Server information:"));
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      handleError(error);
    }
  });

// List Projects Command
program
  .command("list-projects")
  .description("List all projects")
  .action(async (options: { serverUrl?: string; serverToken?: string }) => {
    try {
      validateEnv(
        options.serverUrl || program.opts().serverUrl,
        options.serverToken || program.opts().serverToken,
      );
      const response = await getApiClient({
        serverUrl: options.serverUrl || program.opts().serverUrl,
        serverToken: options.serverToken || program.opts().serverToken,
      }).get("/projects");
      console.log(chalk.green("Projects:"));
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      handleError(error);
    }
  });

// List Observations Command
program
  .command("list-observations")
  .description("List observations for a project")
  .requiredOption("-p, --project-id <id>", "Project public ID")
  .action(
    async (options: {
      projectId: string;
      serverUrl?: string;
      serverToken?: string;
    }) => {
      try {
        validateEnv(
          options.serverUrl || program.opts().serverUrl,
          options.serverToken || program.opts().serverToken,
        );
        const response = await getApiClient({
          serverUrl: options.serverUrl || program.opts().serverUrl,
          serverToken: options.serverToken || program.opts().serverToken,
        }).get(`/projects/${options.projectId}/observations`);
        console.log(chalk.green("Observations:"));
        console.log(JSON.stringify(response.data, null, 2));
      } catch (error) {
        handleError(error);
      }
    },
  );

// Export GeoJSON Command
program
  .command("export-geojson")
  .description("Export project observations as GeoJSON")
  .requiredOption("-p, --project-id <id>", "Project public ID")
  .option("-o, --output <path>", "Output file path")
  .action(
    async (options: {
      projectId: string;
      output?: string;
      serverUrl?: string;
      serverToken?: string;
    }) => {
      try {
        validateEnv(
          options.serverUrl || program.opts().serverUrl,
          options.serverToken || program.opts().serverToken,
        );
        interface ObservationData {
          docId: string;
          createdAt: string;
          updatedAt: string;
          deleted: boolean;
          attachments: Array<{
            driveId: string;
            type: string;
            name: string;
            url: string;
          }>;
          tags: Record<string, unknown>;
          lat: number;
          lon: number;
        }

        interface GeoJSONFeature {
          type: "Feature";
          geometry: {
            type: "Point";
            coordinates: [number, number];
          };
          id: string;
          properties: {
            categoryId?: string;
            name?: string;
            notes?: string;
            $created: string;
            $modified: string;
            $version: string;
            $photos: string[];
          };
        }

        console.log(chalk.blue("Fetching observations..."));
        const response = await getApiClient({
          serverUrl: options.serverUrl || program.opts().serverUrl,
          serverToken: options.serverToken || program.opts().serverToken,
        }).get<{ data: ObservationData[] }>(
          `/projects/${options.projectId}/observations`,
        );
        console.log(
          chalk.blue(`Found ${response.data.data.length} observations`),
        );

        // Create temporary directory for zip contents
        console.log(chalk.blue("Creating temporary directory..."));
        const tmpDir = "tmp_export";
        await mkdir(tmpDir, { recursive: true });
        await mkdir(`${tmpDir}/images`, { recursive: true });

        const geojson = {
          type: "FeatureCollection" as const,
          features: await Promise.all(
            response.data.data.map(async (obs): Promise<GeoJSONFeature> => {
              // Download attachments
              console.log(chalk.blue(`Processing observation ${obs.docId}...`));
              const photoFiles = await Promise.all(
                obs.attachments
                  // .filter(att => att.type === "photo")
                  .map(async (att) => {
                    console.log("processing", att);
                    const { projectId, driveId, type, name } = getUrlComponents(
                      att.url,
                    );
                    const filename = getOutputFilename(name, type);
                    try {
                      console.log(
                        chalk.blue(`Downloading photo ${filename}...`),
                      );
                      const photoData = await downloadAttachment(
                        options.projectId,
                        driveId,
                        type,
                        name,
                        "",
                        options.serverUrl || program.opts().serverUrl,
                        options.serverToken || program.opts().serverToken,
                      );
                      await writeFile(
                        `${tmpDir}/images/${filename}`,
                        photoData,
                      );
                      console.log(
                        chalk.green(`Successfully downloaded ${filename}`),
                      );
                      return filename;
                    } catch (error) {
                      console.error(
                        chalk.red(`Failed to download attachment ${filename}`),
                      );
                      return null;
                    }
                  }),
              );

              return {
                type: "Feature",
                geometry: {
                  type: "Point",
                  coordinates: [obs.lon, obs.lat],
                },
                id: obs.docId,
                properties: {
                  $created: obs.createdAt,
                  $modified: obs.updatedAt,
                  $version: `${obs.docId}@1`,
                  $photos: photoFiles.filter((f): f is string => f !== null),
                },
              };
            }),
          ),
        };

        // Write GeoJSON file
        console.log(chalk.blue("Writing GeoJSON file..."));
        await writeFile(
          `${tmpDir}/comapeo_data.geojson`,
          JSON.stringify(geojson, null, 2),
        );

        // Create zip file
        console.log(chalk.blue("Creating ZIP archive..."));
        const outputPath = options.output || "comapeo_export.zip";
        const zip = new JSZip();

        // Add GeoJSON file
        zip.file(
          "comapeo_data.geojson",
          await readFile(`${tmpDir}/comapeo_data.geojson`),
        );

        // Add images folder
        const imageFiles = await readdir(`${tmpDir}/images`);
        for (const file of imageFiles) {
          zip.file(
            `images/${file}`,
            await readFile(`${tmpDir}/images/${file}`),
          );
        }

        // Generate zip file
        const zipContent = await zip.generateAsync({ type: "nodebuffer" });
        await writeFile(outputPath, zipContent);

        // Clean up temporary directory
        console.log(chalk.blue("Cleaning up temporary files..."));
        await rm(tmpDir, { recursive: true, force: true });

        console.log(
          chalk.green(`Export completed successfully: ${outputPath}`),
        );
      } catch (error) {
        handleError(error);
      }
    },
  );

// Get Attachment Command
program
  .command("get-attachment")
  .description("Get an attachment")
  .requiredOption("-u, --url <url>", "Full attachment URL")
  .option(
    "--variant <variant>",
    "Variant (original, preview, or thumbnail for photos; original for audio)",
  )
  .option("-o, --output <filename>", "Output filename")
  .action(
    async (options: {
      url: string;
      variant?: string;
      output?: string;
      serverUrl?: string;
      serverToken?: string;
    }) => {
      try {
        validateEnv(
          options.serverUrl || program.opts().serverUrl,
          options.serverToken || program.opts().serverToken,
        );
        const { projectId, driveId, type, name } = getUrlComponents(
          options.url,
        );
        const variant = options.variant ? `?variant=${options.variant}` : "";

        const data = await downloadAttachment(
          projectId,
          driveId,
          type,
          name,
          variant,
          options.serverUrl || program.opts().serverUrl,
          options.serverToken || program.opts().serverToken,
        );

        const filename = getOutputFilename(name, type, options.output);
        await writeFile(filename, data);
        console.log(chalk.green(`Attachment saved as: ${filename}`));
      } catch (error) {
        handleError(error);
      }
    },
  );

// Create Remote Alert Command
program
  .command("create-alert")
  .description("Create a remote detection alert")
  .requiredOption("-p, --project-id <id>", "Project public ID")
  .requiredOption("--start-date <date>", "Detection start date (ISO timestamp)")
  .requiredOption("--end-date <date>", "Detection end date (ISO timestamp)")
  .requiredOption("--source-id <id>", "Source ID")
  .requiredOption("--alert-type <type>", "Alert type")
  .requiredOption("--lon <longitude>", "Longitude")
  .requiredOption("--lat <latitude>", "Latitude")
  .action(async (options: AlertOptions) => {
    try {
      validateEnv(
        options.serverUrl || program.opts().serverUrl,
        options.serverToken || program.opts().serverToken,
      );
      const response = await getApiClient({
        serverUrl: options.serverUrl || program.opts().serverUrl,
        serverToken: options.serverToken || program.opts().serverToken,
      }).post(`/projects/${options.projectId}/remoteDetectionAlerts`, {
        detectionDateStart: options.startDate,
        detectionDateEnd: options.endDate,
        sourceId: options.sourceId,
        metadata: {
          alert_type: options.alertType,
        },
        geometry: {
          type: "Point",
          coordinates: [
            Number.parseFloat(options.lon),
            Number.parseFloat(options.lat),
          ],
        },
      });
      console.log(chalk.green("Remote alert created successfully:"));
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      handleError(error);
    }
  });

// List Alerts Command
program
  .command("list-alerts")
  .description("List remote detection alerts for a project")
  .requiredOption("-p, --project-id <id>", "Project public ID")
  .action(
    async (options: {
      projectId: string;
      serverUrl?: string;
      serverToken?: string;
    }) => {
      try {
        validateEnv(
          options.serverUrl || program.opts().serverUrl,
          options.serverToken || program.opts().serverToken,
        );
        const response = await getApiClient({
          serverUrl: options.serverUrl || program.opts().serverUrl,
          serverToken: options.serverToken || program.opts().serverToken,
        }).get(`/projects/${options.projectId}/remoteDetectionAlerts`);
        console.log(chalk.green("Remote detection alerts:"));
        console.log(JSON.stringify(response.data, null, 2));
      } catch (error) {
        handleError(error);
      }
    },
  );

// Healthcheck Command
program
  .command("healthcheck")
  .description("Check the health of the server")
  .action(async (options: { serverUrl?: string; serverToken?: string }) => {
    try {
      validateEnv(
        options.serverUrl || program.opts().serverUrl,
        options.serverToken || program.opts().serverToken,
      );
      const response = await getApiClient({
        serverUrl: options.serverUrl || program.opts().serverUrl,
        serverToken: options.serverToken || program.opts().serverToken,
      }).get("/healthcheck");
      console.log(chalk.green("Server is healthy:"));
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      handleError(error);
    }
  });

program.parse();
