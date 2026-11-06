import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EvoxProjectManager } from "../project.js";
import { SongColumnSchema, SongMetadataSchema } from "../types.js";

export function registerSongsTools(server: McpServer, project: EvoxProjectManager): void {
  // 1. list_songs
  server.tool(
    "list_songs",
    "Lists all songs in the songbook in alphabetical print order (matching the order in the compiled PDF and Table of Contents).",
    {
      project_dir: z
        .string()
        .optional()
        .describe("Songbook directory path (defaults to EVOX_PROJECT_DIR or cwd)."),
    },
    async (args) => {
      try {
        const songs = await project.listSongs(args.project_dir);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(songs, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error listing songs: ${err.message}` }],
        };
      }
    }
  );

  // 2. get_song
  server.tool(
    "get_song",
    "Retrieves the full structured AST for a song by slug (including title, artist, font, column width, gutter, and all column/stanza lines with chord-lyric pairs).",
    {
      slug: z.string().describe("Song slug identifier (e.g. 'free_falling' or 'over_the_rainbow')."),
      project_dir: z
        .string()
        .optional()
        .describe("Songbook directory path (defaults to EVOX_PROJECT_DIR or cwd)."),
    },
    async (args) => {
      try {
        const ast = await project.getSong(args.slug, args.project_dir);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(ast, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error getting song "${args.slug}": ${err.message}` }],
        };
      }
    }
  );

  // 3. create_song
  server.tool(
    "create_song",
    "Creates a new song from a validated structured AST. Automatically formats and serializes to .evox markup.",
    {
      project_dir: z
        .string()
        .optional()
        .describe("Songbook directory path (defaults to EVOX_PROJECT_DIR or cwd)."),
      slug: z
        .string()
        .optional()
        .describe("Optional filename slug (e.g. 'hotel_california'). If omitted, automatically derived from metadata.name."),
      metadata: SongMetadataSchema.describe(
        "Song metadata including name (max 60 chars), author, font size (pt), column_width (pt), and gutter (pt)."
      ),
      columns: z
        .array(SongColumnSchema)
        .min(1, "A song must contain at least one column")
        .describe(
          "List of columns. Each column contains stanzas, and each stanza contains lines with 0-indexed chord-over-lyric pairs: { chords?: string, lyrics?: string }."
        ),
      upsert: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, overwrite existing song if it already exists. Defaults to false."),
    },
    async (args) => {
      try {
        const result = await project.createSong({
          projectDir: args.project_dir,
          slug: args.slug,
          metadata: args.metadata,
          columns: args.columns,
          upsert: args.upsert,
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
          content: [{ type: "text", text: `Error creating song: ${err.message}` }],
        };
      }
    }
  );

  // 4. update_song
  server.tool(
    "update_song",
    "Updates an existing song. Supports partial metadata changes, replacing columns, and/or renaming the song slug.",
    {
      slug: z.string().describe("Current song slug to update."),
      project_dir: z
        .string()
        .optional()
        .describe("Songbook directory path (defaults to EVOX_PROJECT_DIR or cwd)."),
      new_slug: z
        .string()
        .optional()
        .describe("Optional new slug to rename the song file."),
      metadata: SongMetadataSchema.partial()
        .optional()
        .describe("Partial metadata updates (name, author, font, column_width, gutter)."),
      columns: z
        .array(SongColumnSchema)
        .optional()
        .describe("Optional replacement columns AST. If omitted, existing columns remain untouched."),
    },
    async (args) => {
      try {
        const result = await project.updateSong({
          slug: args.slug,
          projectDir: args.project_dir,
          newSlug: args.new_slug,
          metadata: args.metadata,
          columns: args.columns,
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
          content: [{ type: "text", text: `Error updating song "${args.slug}": ${err.message}` }],
        };
      }
    }
  );

  // 5. delete_song
  server.tool(
    "delete_song",
    "Deletes a song (.evox file) from the songs/ folder.",
    {
      slug: z.string().describe("Slug of the song to delete."),
      project_dir: z
        .string()
        .optional()
        .describe("Songbook directory path (defaults to EVOX_PROJECT_DIR or cwd)."),
    },
    async (args) => {
      try {
        const result = await project.deleteSong(args.slug, args.project_dir);
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
          content: [{ type: "text", text: `Error deleting song "${args.slug}": ${err.message}` }],
        };
      }
    }
  );
}
