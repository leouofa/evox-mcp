import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { parseConfig } from "./config.js";
import { createEvoxMcpServer } from "./server.js";

async function main() {
  try {
    const config = parseConfig(process.env);
    const server = createEvoxMcpServer(config);
    const transport = new StdioServerTransport();

    process.stderr.write(
      `[evox-mcp] Starting server (projectDir: "${config.defaultProjectDir}", evoxBin: "${config.evoxBin}", readOnly: ${config.readOnly})\n`
    );

    await server.connect(transport);

    process.stderr.write("[evox-mcp] Server listening on stdio.\n");
  } catch (err: any) {
    process.stderr.write(`[evox-mcp] Fatal error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
