import { writeFile } from "node:fs/promises";
import type { Command } from "commander";
import { handleError } from "../lib/api.js";
import { createContext } from "../lib/context.js";
import { CliError, EXIT } from "../lib/errors.js";
import { write } from "../lib/format.js";

const PHOTO_VARIANTS = ["original", "preview", "thumbnail"];

export const getUrlComponents = (url: string) => {
  const match = url.match(
    /\/projects\/([^/]+)\/attachments\/([^/]+)\/([^/]+)\/([^/]+)$/,
  );
  if (!match) {
    throw new CliError(
      `Invalid attachment URL: ${url}\nExpected .../projects/<id>/attachments/<drive>/<kind>/<name>.`,
      EXIT.USAGE,
    );
  }
  const [, projectId, driveId, type, name] = match;
  return { projectId, driveId, type, name };
};

const outputName = (name: string, kind: string): string => {
  const extension = kind === "photo" ? ".jpg" : kind === "audio" ? ".mp3" : "";
  return `${name}${extension}`;
};

interface GetAttachmentOptions {
  url: string;
  variant?: string;
  output?: string;
}

export function registerGetAttachmentCommand(program: Command): void {
  program
    .command("get-attachment")
    .description("Download a single attachment (photo or audio)")
    .requiredOption("-u, --url <url>", "Full attachment URL")
    .option(
      "--variant <variant>",
      "Photo variant: original|preview|thumbnail (audio only supports original)",
    )
    .option("-o, --output <file>", 'Output filename, or "-" for stdout')
    .addHelpText(
      "after",
      `
Attachment URLs come from list-observations (attachments[].url). Photos get
a .jpg extension, audio a .mp3.

Examples:
  $ comapeo-cloud get-attachment -u <attachmentUrl> --variant thumbnail -o photo.jpg
  $ comapeo-cloud get-attachment -u <attachmentUrl> -o - | file -
`,
    )
    .action(async (options: GetAttachmentOptions, cmd: Command) => {
      try {
        const context = createContext(cmd);
        const { projectId, driveId, type, name } = getUrlComponents(
          options.url,
        );

        const kind = type.toLowerCase();
        const variant = options.variant?.toLowerCase();

        if (variant) {
          if (kind === "photo" && !PHOTO_VARIANTS.includes(variant)) {
            throw new CliError(
              `Unknown photo variant "${options.variant}". Use one of: ${PHOTO_VARIANTS.join(", ")}.`,
              EXIT.USAGE,
            );
          }
          if (kind !== "photo" && variant !== "original") {
            throw new CliError(
              `Variants are only supported for photos; "${kind}" only has the original file.`,
              EXIT.USAGE,
            );
          }
        }

        const query = variant ? `?variant=${variant}` : "";
        const response = await context.client.get(
          `/projects/${projectId}/attachments/${driveId}/${kind}/${name}${query}`,
          { responseType: "arraybuffer" },
        );
        const data = Buffer.from(response.data as ArrayBuffer);

        if (options.output === "-") {
          process.stdout.write(data);
          return;
        }

        const filename =
          options.output ?? outputName(name, kind === "photo" ? "photo" : kind);
        await writeFile(filename, data);
        write(`saved ${filename} (${data.length} bytes)`);
      } catch (error) {
        handleError(error);
      }
    });
}
