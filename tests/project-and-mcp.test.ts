import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEvoxMcpServer } from "../src/server.js";
import { SongAst } from "../src/types.js";

describe("Evox MCP Server End-to-End Integration", () => {
  let tempDir: string;
  let client: Client;
  let serverTransport: InMemoryTransport;
  let clientTransport: InMemoryTransport;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "evox-mcp-test-"));
    const server = createEvoxMcpServer({
      defaultProjectDir: tempDir,
      evoxBin: "evox",
      readOnly: false,
      timeoutMs: 30000,
    });

    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    try {
      await client.close();
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it("lists all registered tools, resources, and prompts", async () => {
    const tools = await client.listTools();
    const toolNames = tools.tools.map((t) => t.name).sort();
    expect(toolNames).toEqual([
      "create_song",
      "delete_song",
      "generate_songbook",
      "get_cover",
      "get_song",
      "get_songbook",
      "init_songbook",
      "list_songs",
      "update_cover",
      "update_song",
    ]);

    const resources = await client.listResources();
    const resourceUris = resources.resources.map((r) => r.uri);
    expect(resourceUris).toContain("evox://songbook");
    expect(resourceUris).toContain("evox://songs");

    const prompts = await client.listPrompts();
    const promptNames = prompts.prompts.map((p) => p.name).sort();
    expect(promptNames).toEqual(["build_songbook", "import_chord_sheet"]);
  });

  it("initializes a songbook with init_songbook", async () => {
    const res = await client.callTool({
      name: "init_songbook",
      arguments: {
        include_sample_songs: false,
        cover: {
          header: {
            title: "Test Acoustic Jam",
            subtitle: "Vol. 1",
          },
          footer: {
            title: "Compiled by Vitest",
          },
        },
      },
    });

    expect(res.isError).toBeFalsy();
    const parsed = JSON.parse((res.content[0] as any).text);
    expect(parsed.songsCount).toBe(0);

    // Verify directory structure created on disk
    expect(await fs.stat(path.join(tempDir, "songs"))).toBeDefined();
    expect(await fs.stat(path.join(tempDir, "cover"))).toBeDefined();
    expect(await fs.stat(path.join(tempDir, "book"))).toBeDefined();
  });

  it("reads and updates cover configuration", async () => {
    const coverRes = await client.callTool({
      name: "get_cover",
      arguments: {},
    });
    const coverData = JSON.parse((coverRes.content[0] as any).text);
    expect(coverData.config.header.title).toBe("Test Acoustic Jam");

    const updateRes = await client.callTool({
      name: "update_cover",
      arguments: {
        header: {
          title: "Updated Songbook Title",
        },
      },
    });
    const updatedData = JSON.parse((updateRes.content[0] as any).text);
    expect(updatedData.config.header.title).toBe("Updated Songbook Title");
  });

  it("creates, retrieves, updates, and lists songs", async () => {
    const testSong: SongAst = {
      slug: "wonderwall",
      metadata: {
        name: "Wonderwall",
        author: "Oasis",
        font: 9.0,
        column_width: 580,
        gutter: 5,
      },
      columns: [
        {
          stanzas: [
            {
              lines: [
                {
                  chords: "Em7          G",
                  lyrics: "Today is gonna be the day",
                },
                {
                  chords: "              Dsus4                A7sus4",
                  lyrics: "That they're gonna throw it back to you",
                },
              ],
            },
          ],
        },
      ],
    };

    // 1. Create song
    const createRes = await client.callTool({
      name: "create_song",
      arguments: {
        metadata: testSong.metadata,
        columns: testSong.columns,
      },
    });
    expect(createRes.isError).toBeFalsy();

    // 2. List songs
    const listRes = await client.callTool({
      name: "list_songs",
      arguments: {},
    });
    const songList = JSON.parse((listRes.content[0] as any).text);
    expect(songList.length).toBe(1);
    expect(songList[0].slug).toBe("wonderwall");
    expect(songList[0].name).toBe("Wonderwall");

    // 3. Get song
    const getRes = await client.callTool({
      name: "get_song",
      arguments: { slug: "wonderwall" },
    });
    const retrievedAst = JSON.parse((getRes.content[0] as any).text);
    expect(retrievedAst.metadata.author).toBe("Oasis");
    expect(retrievedAst.columns[0].stanzas[0].lines[0].lyrics).toBe("Today is gonna be the day");

    // 4. Update song (partial metadata)
    const updateRes = await client.callTool({
      name: "update_song",
      arguments: {
        slug: "wonderwall",
        metadata: {
          font: 8.5,
        },
      },
    });
    const updatedAst = JSON.parse((updateRes.content[0] as any).text);
    expect(updatedAst.ast.metadata.font).toBe(8.5);
  });

  it("cleans stray .DS_Store files and generates PDF via generate_songbook", async () => {
    // Inject a stray .DS_Store file into songs directory
    const dsStorePath = path.join(tempDir, "songs", ".DS_Store");
    await fs.writeFile(dsStorePath, "stray-binary-data");

    const genRes = await client.callTool({
      name: "generate_songbook",
      arguments: {},
    });

    expect(genRes.isError).toBeFalsy();
    const genData = JSON.parse((genRes.content[0] as any).text);
    expect(genData.songsCount).toBe(1);
    expect(genData.tableOfContents).toEqual(["Wonderwall"]);
    expect(genData.cleanedFiles).toContain(".DS_Store");

    // Verify PDF file was generated
    const pdfStat = await fs.stat(genData.pdfPath);
    expect(pdfStat.size).toBeGreaterThan(1000);

    const pdfBuffer = await fs.readFile(genData.pdfPath);
    expect(pdfBuffer.toString("ascii", 0, 5)).toBe("%PDF-");
  });

  it("reads resources and renders prompts", async () => {
    const resourceRes = await client.readResource({ uri: "evox://songbook" });
    const statusData = JSON.parse(resourceRes.contents[0].text as string);
    expect(statusData.initialized).toBe(true);
    expect(statusData.pdfExists).toBe(true);
    expect(statusData.songsCount).toBe(1);

    const songResourceRes = await client.readResource({ uri: "evox://songs/wonderwall" });
    const songAst = JSON.parse(songResourceRes.contents[0].text as string);
    expect(songAst.slug).toBe("wonderwall");

    const promptRes = await client.getPrompt({
      name: "import_chord_sheet",
      arguments: { sheet: "Am  C\nSample lyrics", title: "Test Title" },
    });
    expect((promptRes.messages[0].content as any).text).toContain("Test Title");
  });

  it("deletes a song with delete_song", async () => {
    const delRes = await client.callTool({
      name: "delete_song",
      arguments: { slug: "wonderwall" },
    });
    expect(delRes.isError).toBeFalsy();

    const listRes = await client.callTool({
      name: "list_songs",
      arguments: {},
    });
    const songs = JSON.parse((listRes.content[0] as any).text);
    expect(songs.length).toBe(0);
  });
});
