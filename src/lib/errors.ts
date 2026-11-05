/**
 * Exit codes used across the CLI.
 *
 * 0 success, 1 runtime/API failure, 2 usage error, 3 nothing matched /
 * not found. Keeping them distinct lets scripts branch on the failure
 * kind without parsing stderr.
 */
export const EXIT = {
  OK: 0,
  FAILURE: 1,
  USAGE: 2,
  NOT_FOUND: 3,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export class CliError extends Error {
  readonly exitCode: ExitCode;

  constructor(message: string, exitCode: ExitCode = EXIT.FAILURE) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}
