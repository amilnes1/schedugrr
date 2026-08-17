// Package-relative bridge used by the interactive Electron smoke test.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
export const electronLauncher = require("playwright")._electron;
