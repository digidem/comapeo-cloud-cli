#!/usr/bin/env node
import { Command } from "commander";
import { writeFile } from "node:fs/promises";
import chalk from "chalk";
import { validateEnv, getApiClient, handleError } from "./helpers.js";

export const program = new Command();

interface ProjectOptions {
  name: string;
  key: string;
  authKey: string;
  configKey: string;
  dataKey: string;
  blobIndexKey: string;
  blobKey: string;
  serverUrl?: string;
  serverToken?: string;
}

interface ObservationOptions {
  projectId: string;
  lat: string;
  lon: string;
  tags?: string[];
  attachments?: string[];
  serverUrl?: string;
  serverToken?: string;
  metadata?: {
    manualLocation: boolean;
    position: {
      mocked: boolean;
      timestamp: string;
      coords: {
        latitude: number;
        longitude: number;
      };
    };
  };
}

interface AttachmentOptions {
  projectId: string;
  driveId: string;
  type: "photo" | "audio";
  name: string;
  variant?: string;
  serverUrl?: string;
  serverToken?: string;
}

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

// Add Project Command
program
  .command("add-project")
  .description("Add a new project")
  .requiredOption("--name <name>", "Project name")
  .option("--key <key>", "Hex-encoded project key")
  .option("--auth-key <key>", "Hex-encoded auth key")
  .option("--config-key <key>", "Hex-encoded config key")
  .option("--data-key <key>", "Hex-encoded data key")
  .option("--blob-index-key <key>", "Hex-encoded blob index key")
  .option("--blob-key <key>", "Hex-encoded blob key")
  .action(async (options: ProjectOptions) => {
    try {
      const response = await getApiClient({
        serverUrl: options.serverUrl || program.opts().serverUrl,
        serverToken: options.serverToken || program.opts().serverToken,
      }).put("/projects", {
        projectName: options.name,
        projectKey: options.key,
        encryptionKeys: {
          auth: options.authKey,
          config: options.configKey,
          data: options.dataKey,
          blobIndex: options.blobIndexKey,
          blob: options.blobKey,
        },
      });
      console.log(chalk.green("Project added successfully:"));
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

// Add Observation Command
program
  .command("add-observation")
  .description("Add a new observation to a project")
  .requiredOption("-p, --project-id <id>", "Project public ID")
  .requiredOption("--lat <latitude>", "Latitude")
  .requiredOption("--lon <longitude>", "Longitude")
  // .option('--tags <tags...>', 'Tags for the observation')
  // .option('--attachments <items...>', 'Attachments in format: driveDiscoveryId,type,name', [])
  .action(async (options: ObservationOptions) => {
    try {
      // const attachments = options.attachments?.map((attachment: string) => {
      //   const [driveDiscoveryId, type, name] = attachment.split(',');
      //   return { driveDiscoveryId, type, name };
      // }) || [];

      const response = await getApiClient({
        serverUrl: options.serverUrl || program.opts().serverUrl,
        serverToken: options.serverToken || program.opts().serverToken,
      }).put(`/projects/${options.projectId}/observation`, {
        lat: Number.parseFloat(options.lat),
        lon: Number.parseFloat(options.lon),
        // tags: options.tags || [],
        // attachments
      });
      console.log(chalk.green("Observation added successfully:"));
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
  .requiredOption("-o, --output <path>", "Output file path")
  .action(
    async (options: {
      projectId: string;
      output: string;
      serverUrl?: string;
      serverToken?: string;
    }) => {
      try {
        interface ObservationData {
          docId: string;
          createdAt: string;
          updatedAt: string;
          deleted: boolean;
          attachments: unknown[];
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
          properties: Omit<ObservationData, "lat" | "lon"> & { docId: string };
        }

        const response = await getApiClient({
          serverUrl: options.serverUrl || program.opts().serverUrl,
          serverToken: options.serverToken || program.opts().serverToken,
        }).get<{ data: ObservationData[] }>(
          `/projects/${options.projectId}/observations`,
        );

        const geojson = {
          type: "FeatureCollection" as const,
          features: response.data.data
            // .filter((obs) => obs.lat !== 0 && obs.lon !== 0)
            .map(
              (obs): GeoJSONFeature => ({
                type: "Feature",
                geometry: {
                  type: "Point",
                  coordinates: [obs.lon, obs.lat],
                },
                properties: {
                  docId: obs.docId,
                  createdAt: obs.createdAt,
                  updatedAt: obs.updatedAt,
                  deleted: obs.deleted,
                  attachments: obs.attachments,
                  tags: obs.tags,
                },
              }),
            ),
        };

        await writeFile(options.output, JSON.stringify(geojson, null, 2));
        console.log(chalk.green(`GeoJSON exported to: ${options.output}`));
      } catch (error) {
        handleError(error);
      }
    },
  );

// Get Attachment Command
program
  .command("get-attachment")
  .description("Get an attachment")
  .requiredOption("-p, --project-id <id>", "Project public ID")
  .requiredOption("--drive-id <id>", "Drive discovery ID")
  .requiredOption("--type <type>", "Attachment type (photo or audio)")
  .requiredOption("--name <name>", "Attachment name")
  .option(
    "--variant <variant>",
    "Variant (original, preview, or thumbnail for photos; original for audio)",
  )
  .action(async (options: AttachmentOptions) => {
    try {
      const variant = options.variant ? `?variant=${options.variant}` : "";
      const response = await getApiClient({
        serverUrl: options.serverUrl || program.opts().serverUrl,
        serverToken: options.serverToken || program.opts().serverToken,
      }).get(
        `/projects/${options.projectId}/attachments/${options.driveId}/${options.type}/${options.name}${variant}`,
        { responseType: "arraybuffer" },
      );

      // Save the file with appropriate extension
      const extension = options.type === "photo" ? ".jpg" : ".mp3";
      const filename = `${options.name}${extension}`;
      await writeFile(filename, Buffer.from(response.data));
      console.log(chalk.green(`Attachment saved as: ${filename}`));
    } catch (error) {
      handleError(error);
    }
  });

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

// Healthcheck Command
program
  .command("healthcheck")
  .description("Check the health of the server")
  .action(async (options: { serverUrl?: string; serverToken?: string }) => {
    try {
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
