import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EvoxProjectManager } from "./project.js";

export function registerResources(server: McpServer, project: EvoxProjectManager): void {
  // 1. evox://songbook - Live songbook status
  server.resource(
    "songbook-status",
    "evox://songbook",
    {
      description: "Live status of the configured songbook project, cover settings, logo status, and PDF compilation state.",
      mimeType: "application/json",
    },
    async (uri) => {
      const status = await project.getStatus();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(status, null, 2),
          },
        ],
      };
    }
  );

  // 2. evox://songs - List of all songs
  server.resource(
    "songs-list",
    "evox://songs",
    {
      description: "List of all songs in the songbook in alphabetical print order.",
      mimeType: "application/json",
    },
    async (uri) => {
      const songs = await project.listSongs();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(songs, null, 2),
          },
        ],
      };
    }
  );

  // 3. evox://songs/{slug} - Individual song AST
  server.resource(
    "song-by-slug",
    new ResourceTemplate("evox://songs/{slug}", { list: undefined }),
    {
      description: "Full structured Song AST JSON for a specific song including metadata, columns, stanzas, chords, and lyrics.",
      mimeType: "application/json",
    },
    async (uri, { slug }) => {
      const slugStr = Array.isArray(slug) ? slug[0] : slug;
      const ast = await project.getSong(slugStr);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(ast, null, 2),
          },
        ],
      };
    }
  );
}
