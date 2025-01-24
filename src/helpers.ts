import { AxiosError } from "axios";
import chalk from "chalk";
import { config } from "dotenv";
import axios from "axios";

config();

export function validateEnv(
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

export function getApiClient(options: {
  serverUrl?: string;
  serverToken?: string;
}) {
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

export function handleError(error: unknown) {
  if (error instanceof AxiosError) {
    console.error(chalk.red("API Error:"));
    console.error(chalk.red(error.response?.data?.message || error.message));
  } else {
    console.error(chalk.red("An unexpected error occurred:"));
    console.error(chalk.red(String(error)));
  }
  process.exit(1);
}
