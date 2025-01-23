#!/usr/bin/env node
import { Command } from "commander";
import { config } from "dotenv";
import axios, { AxiosError } from "axios";
import chalk from "chalk";
import { writeFile } from "node:fs/promises";

config();

const program = new Command();

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

// Helper function to validate environment variables
function validateEnv(
  serverUrl?: string,
  serverToken?: string,
): { SERVER_URL: string; SERVER_BEARER_TOKEN: string } {
  const SERVER_URL = serverUrl || process.env.SERVER_URL;
  const SERVER_BEARER_TOKEN = serverToken || process.env.SERVER_BEARER_TOKEN;

  if (!SERVER_URL) {
    console.error(
      chalk.red(
        "Error: SERVER_URL must be provided either as environment variable or --server-url option",
      ),
    );
    process.exit(1);
  }

  if (!SERVER_BEARER_TOKEN) {
    console.error(
      chalk.red(
        "Error: SERVER_BEARER_TOKEN must be provided either as environment variable or --server-token option",
      ),
    );
    process.exit(1);
  }

  return { SERVER_URL, SERVER_BEARER_TOKEN };
}

// Helper function to get API client
function getApiClient(options: { serverUrl?: string; serverToken?: string }) {
  const { SERVER_URL, SERVER_BEARER_TOKEN } = validateEnv(
    options.serverUrl,
    options.serverToken,
  );

  return axios.create({
    baseURL: SERVER_URL,
    headers: {
      Authorization: `Bearer ${SERVER_BEARER_TOKEN}`,
      "Content-Type": "application/json",
    },
  });
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
      const { SERVER_URL } = validateEnv(
        options.serverUrl || program.opts().serverUrl,
        options.serverToken || program.opts().serverToken,
      );
      const response = await axios.get(`${SERVER_URL}/healthcheck`);
      console.log(chalk.green("Server is healthy:"));
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      handleError(error);
    }
  });

function handleError(error: unknown) {
  if (error instanceof AxiosError) {
    console.error(chalk.red("API Error:"));
    console.error(chalk.red(error.response?.data?.message || error.message));
  } else {
    console.error(chalk.red("An unexpected error occurred:"));
    console.error(chalk.red(String(error)));
  }
  process.exit(1);
}

program.parse();
