import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EvoxProjectManager } from "./project.js";

export function registerPrompts(server: McpServer, project: EvoxProjectManager): void {
  // 1. import_chord_sheet
  server.tool
  server.prompt(
    "import_chord_sheet",
    "Transforms an external chord sheet, tab, or lyric sheet into an Evox-compatible Song AST with aligned chords and lyrics.",
    {
      sheet: z.string().describe("Raw chord sheet, ChordPro, or lyrics with chords above text."),
      title: z.string().optional().describe("Song title (if not easily inferred from the sheet)."),
      artist: z.string().optional().describe("Song artist/composer."),
    },
    async (args) => {
      const promptText = `You are a music typography and songbook formatting expert for Evox.
Your task is to transform the provided chord sheet into an Evox structured Song AST and call \`create_song\`.

### Input Chord Sheet:
${args.title ? `Title: ${args.title}\n` : ""}${args.artist ? `Artist: ${args.artist}\n` : ""}
\`\`\`
${args.sheet}
\`\`\`

### Evox Formatting Rules & Constraints:
1. **Metadata**:
   - \`name\`: Max 60 characters to fit Table of Contents line width.
   - \`author\`: Artist or composer.
   - \`font\`: Typical font size is 9.0 pt (scale down to 7.5 or 8.0 for dense 2-column songs).
   - \`column_width\`: Standard is 580 pt.
   - \`gutter\`: Standard is 5 pt.
2. **Monospace 0-Indexed Alignment**:
   - Chords and lyrics must be 0-indexed against each other.
   - Example:
     - \`chords\`: "       C    F     F     C     G"
     - \`lyrics\`: "She's a good girl, loves her mama"
3. **Columns & Stanzas**:
   - Short songs or wide songs fit well in 1 column.
   - Medium to long pop/rock songs with verses & chorus should be split across 2 columns so they fit cleanly onto an A4 page.
   - Separate stanzas (verse, chorus, bridge) into distinct stanzas within each column.
4. **Reserved Delimiters**:
   - DO NOT include '--' in chords or lyrics (Evox uses '--' as column delimiters). Use '-' or '—' instead.
   - DO NOT include '.' in chords (Evox strips '.' when rendering chord lines).

Now inspect the sheet, format the Song AST, and use \`create_song\` to add it to the songbook.`;

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: promptText,
            },
          },
        ],
      };
    }
  );

  // 2. build_songbook
  server.prompt(
    "build_songbook",
    "Guides the end-to-end creation of a themed songbook: initializing directory, customizing cover page, importing/authoring songs, and generating the final PDF.",
    {
      title: z.string().describe("Title of the songbook (e.g. 'Campfire Classics 2026')."),
      subtitle: z.string().optional().describe("Subtitle (e.g. 'Vol. 1 - Acoustic Jam Session')."),
      compiler_name: z.string().optional().describe("Name to display in the cover footer (e.g. 'Compiled by Leonid')."),
    },
    async (args) => {
      const promptText = `You are a songbook compiler agent using Evox.
Follow these steps to create a beautiful PDF songbook:

1. Call \`get_songbook\` to check if a songbook exists in the current directory.
   - If not initialized, call \`init_songbook\` with \`include_sample_songs: false\` and set the initial cover header/footer:
     - Title: "${args.title}"
     ${args.subtitle ? `- Subtitle: "${args.subtitle}"` : ""}
     ${args.compiler_name ? `- Footer: "${args.compiler_name}"` : ""}
2. Call \`update_cover\` if any further adjustments to padding or logo are desired.
3. Call \`create_song\` for each song you want to add to the songbook, carefully formatting chord alignment and splitting stanzas across 1 or 2 columns.
4. Review songs with \`list_songs\`. Remember songs are printed in alphabetical order.
5. Run \`generate_songbook\` to compile \`book/book.pdf\` and verify the generated Table of Contents.`;

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: promptText,
            },
          },
        ],
      };
    }
  );
}
