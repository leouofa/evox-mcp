import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EvoxProjectManager } from "../project.js";
import {
  CoverConfigSchema,
  CoverFooterSchema,
  CoverHeaderSchema,
  CoverLogoSchema,
} from "../types.js";

export function registerSongbookTools(server: McpServer, project: EvoxProjectManager): void {
  // 1. init_songbook
  server.tool(
    "init_songbook",
    "Initializes a new Evox songbook project directory structure (book/, cover/, songs/) using 'evox init'.",
    {
      project_dir: z
        .string()
        .optional()
        .describe("Target folder path for the songbook (defaults to EVOX_PROJECT_DIR or cwd)."),
      include_sample_songs: z
        .boolean()
        .optional()
        .default(false)
        .describe("Whether to keep the 3 default template songs (Free Falling, Over The Rainbow, I Don't Love). Defaults to false for a clean songbook."),
      cover: CoverConfigSchema.partial()
        .optional()
        .describe("Optional initial cover page customizations (title, subtitle, footer, logo size)."),
    },
    async (args) => {
      try {
        const result = await project.initSongbook({
          projectDir: args.project_dir,
          includeSampleSongs: args.include_sample_songs,
          cover: args.cover,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error initializing songbook: ${err.message}` }],
        };
      }
    }
  );

  // 2. get_songbook
  server.tool(
    "get_songbook",
    "Returns comprehensive status of the songbook: directory initialization, cover settings, logo presence, song summaries in alphabetical print order, stray file warnings, and PDF build freshness.",
    {
      project_dir: z
        .string()
        .optional()
        .describe("Songbook directory path (defaults to EVOX_PROJECT_DIR or cwd)."),
    },
    async (args) => {
      try {
        const status = await project.getStatus(args.project_dir);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(status, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error reading songbook status: ${err.message}` }],
        };
      }
    }
  );

  // 3. get_cover
  server.tool(
    "get_cover",
    "Reads cover/config.yml configuration (header, logo dimensions, footer) and logo image file status.",
    {
      project_dir: z
        .string()
        .optional()
        .describe("Songbook directory path (defaults to EVOX_PROJECT_DIR or cwd)."),
    },
    async (args) => {
      try {
        const cover = await project.getCover(args.project_dir);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(cover, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error reading cover: ${err.message}` }],
        };
      }
    }
  );

  // 4. update_cover
  server.tool(
    "update_cover",
    "Updates cover/config.yml settings (header titles/padding, logo size/image name, footer title/size) and optionally copies a new local image into cover/.",
    {
      project_dir: z
        .string()
        .optional()
        .describe("Songbook directory path (defaults to EVOX_PROJECT_DIR or cwd)."),
      header: CoverHeaderSchema.partial()
        .optional()
        .describe("Cover header settings (title, subtitle, title_size, subtitle_size, top_padding, bottom_padding)."),
      logo: CoverLogoSchema.partial()
        .optional()
        .describe("Cover logo settings (image filename, width, height)."),
      footer: CoverFooterSchema.partial()
        .optional()
        .describe("Cover footer settings (title, title_size)."),
      logo_source_path: z
        .string()
        .optional()
        .describe("Path to a local image file (.png, .jpg, .jpeg) to copy into cover/ as the new cover logo."),
    },
    async (args) => {
      try {
        const result = await project.updateCover({
          projectDir: args.project_dir,
          header: args.header,
          logo: args.logo,
          footer: args.footer,
          logoSourcePath: args.logo_source_path,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error updating cover: ${err.message}` }],
        };
      }
    }
  );

  // 5. generate_songbook
  server.tool(
    "generate_songbook",
    "Compiles the songbook into book/book.pdf using 'evox generate'. Automatically cleans stray OS files from songs/, validates all song syntax, and returns the generated PDF details with the alphabetical Table of Contents.",
    {
      project_dir: z
        .string()
        .optional()
        .describe("Songbook directory path (defaults to EVOX_PROJECT_DIR or cwd)."),
      skip_cover: z
        .boolean()
        .optional()
        .default(false)
        .describe("Pass --skip-cover to omit the cover page (requires evox >= 1.0.3). Defaults to false."),
    },
    async (args) => {
      try {
        const result = await project.generateSongbook({
          projectDir: args.project_dir,
          skipCover: args.skip_cover,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error generating songbook: ${err.message}` }],
        };
      }
    }
  );
}
