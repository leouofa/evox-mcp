import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { EvoxMcpConfig } from "./config.js";
import { CliCapabilities } from "./types.js";

const execFileAsync = promisify(execFile);

export class EvoxCli {
  private config: EvoxMcpConfig;
  private cachedCapabilities: CliCapabilities | null = null;

  constructor(config: EvoxMcpConfig) {
    this.config = config;
  }

  /**
   * Probes the configured evox executable for availability, version, and supported flags.
   */
  async getCapabilities(forceRefresh = false): Promise<CliCapabilities> {
    if (this.cachedCapabilities && !forceRefresh) {
      return this.cachedCapabilities;
    }

    const bin = this.config.evoxBin;

    try {
      // 1. Check version
      const { stdout: versionOut } = await execFileAsync(bin, ["--version"], {
        timeout: 5000,
      });

      const versionMatch = versionOut.match(/(\d+\.\d+\.\d+)/);
      const version = versionMatch ? versionMatch[1] : versionOut.trim();

      // 2. Check generate --help to detect if --skip-cover is supported
      let supportsSkipCover = false;
      try {
        const { stdout: helpOut, stderr: helpErr } = await execFileAsync(bin, ["generate", "--help"], {
          timeout: 5000,
        });
        const combined = `${helpOut}\n${helpErr}`;
        supportsSkipCover = combined.includes("--skip-cover");
      } catch {
        // Fallback: evox >= 1.0.3 supports --skip-cover
        if (version) {
          const parts = version.split(".").map((n) => parseInt(n, 10));
          if (parts[0] > 1 || (parts[0] === 1 && (parts[1] > 0 || parts[2] >= 3))) {
            supportsSkipCover = true;
          }
        }
      }

      this.cachedCapabilities = {
        available: true,
        version,
        supportsSkipCover,
        binPath: bin,
      };
      return this.cachedCapabilities;
    } catch (err: any) {
      this.cachedCapabilities = {
        available: false,
        supportsSkipCover: false,
        binPath: bin,
        error: `Evox CLI is not accessible at "${bin}": ${err.message}`,
      };
      return this.cachedCapabilities;
    }
  }

  /**
   * Runs `evox init` inside target directory.
   */
  async init(cwd: string): Promise<{ stdout: string; stderr: string }> {
    const caps = await this.getCapabilities();
    if (!caps.available) {
      throw new Error(`Cannot run 'evox init': ${caps.error}`);
    }

    try {
      const result = await execFileAsync(this.config.evoxBin, ["init"], {
        cwd,
        timeout: this.config.timeoutMs,
      });
      return {
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (err: any) {
      throw new Error(
        `Failed to run 'evox init' in ${cwd}: ${err.stderr || err.stdout || err.message}`
      );
    }
  }

  /**
   * Runs `evox generate` inside target directory.
   */
  async generate(
    cwd: string,
    options: { skipCover?: boolean } = {}
  ): Promise<{ stdout: string; stderr: string }> {
    const caps = await this.getCapabilities();
    if (!caps.available) {
      throw new Error(`Cannot run 'evox generate': ${caps.error}`);
    }

    const args = ["generate"];
    if (options.skipCover) {
      if (!caps.supportsSkipCover) {
        throw new Error(
          `The installed evox CLI (${caps.version || "unknown"}) does not support '--skip-cover'. ` +
            `Please update the evox gem to >= 1.0.3 or configure EVOX_BIN to point to a supported binary.`
        );
      }
      args.push("--skip-cover");
    }

    try {
      const result = await execFileAsync(this.config.evoxBin, args, {
        cwd,
        timeout: this.config.timeoutMs,
      });
      return {
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (err: any) {
      throw new Error(
        `Failed to generate songbook PDF: ${err.stderr || err.stdout || err.message}`
      );
    }
  }
}
