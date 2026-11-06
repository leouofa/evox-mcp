import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EvoxCli } from "./cli.js";
import { EvoxMcpConfig } from "./config.js";
import { EvoxProjectManager } from "./project.js";
import { registerPrompts } from "./prompts.js";
import { registerResources } from "./resources.js";
import { registerSongbookTools } from "./tools/songbook.js";
import { registerSongsTools } from "./tools/songs.js";

export function createEvoxMcpServer(config: EvoxMcpConfig): McpServer {
  const cli = new EvoxCli(config);
  const project = new EvoxProjectManager(config, cli);

  const server = new McpServer({
    name: "evox-mcp",
    version: "1.0.0",
  });

  registerSongbookTools(server, project);
  registerSongsTools(server, project);
  registerResources(server, project);
  registerPrompts(server, project);

  return server;
}
