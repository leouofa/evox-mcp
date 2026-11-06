import * as path from "node:path";

export interface EvoxMcpConfig {
  defaultProjectDir: string;
  evoxBin: string;
  readOnly: boolean;
  timeoutMs: number;
}

export function parseConfig(env: NodeJS.ProcessEnv = process.env): EvoxMcpConfig {
  const defaultProjectDir = env.EVOX_PROJECT_DIR?.trim()
    ? path.resolve(env.EVOX_PROJECT_DIR.trim())
    : process.cwd();

  const evoxBin = env.EVOX_BIN?.trim() || "evox";

  const readOnly =
    env.EVOX_READ_ONLY === "true" ||
    env.EVOX_READ_ONLY === "1" ||
    env.EVOX_READ_ONLY === "yes";

  const rawTimeout = env.EVOX_TIMEOUT_MS?.trim();
  const parsedTimeout = rawTimeout ? parseInt(rawTimeout, 10) : 30000;
  const timeoutMs = isNaN(parsedTimeout) || parsedTimeout <= 0 ? 30000 : parsedTimeout;

  return {
    defaultProjectDir,
    evoxBin,
    readOnly,
    timeoutMs,
  };
}
