#!/usr/bin/env node
import { buildProgram } from "./cli.js";

export const program = buildProgram();

await program.parseAsync(process.argv);
