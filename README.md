<p align="center">
  <img src="assets/logo.jpg" alt="Evox MCP" width="600" />
</p>

# evox-mcp

Model Context Protocol (MCP) server for managing and compiling songbook PDFs using [Evox](https://github.com/leouofa/evox).

`evox-mcp` exposes a structured, validated AST interface for AI agents to inspect, author, edit, and compile songbooks into high-quality PDFs with custom covers, multi-column lyrics, aligned chords, and an automatic Table of Contents.

---

## Features

- **Strict Song AST Interface**: Agents read and write structured JSON (`SongAst`), preventing subtle syntax bugs (omitted lyric spaces, column delimiter collisions, unescaped chord characters).
- **Upstream Evox Guardrails**:
  - Automatically cleans OS dotfiles (`.DS_Store`, `Thumbs.db`) from `songs/` to prevent CLI crashes.
  - Enforces song title lengths (`<= 60` chars) to avoid Table of Contents negative leader line crashes.
  - Validates chord/lyric characters against Evox reserved symbols (`--` and `.`).
  - Probes CLI capabilities dynamically (`--skip-cover`).
- **Complete Songbook Lifecycle**:
  - `init_songbook`: Initialize folder layout (`book/`, `cover/`, `songs/`).
  - `get_songbook`: Check status, cover, logo, alphabetical song order, and PDF freshness.
  - `get_cover` & `update_cover`: Customize header/footer text, padding, and copy local logo images.
  - `list_songs`, `get_song`, `create_song`, `update_song`, `delete_song`: Song AST CRUD.
  - `generate_songbook`: Compile `book/book.pdf` and return generated TOC pagination.
- **MCP Resources & Prompts**:
  - Resources: `evox://songbook`, `evox://songs`, `evox://songs/{slug}`.
  - Prompts: `import_chord_sheet` (tab & chord sheet converter) and `build_songbook` (end-to-end songbook compiler).

---

## Prerequisites

1. **Ruby** (`>= 3.0`)
2. **Evox Gem**:
   ```bash
   gem install evox
   ```

---

## Installation & Build

```bash
# Clone and install dependencies
cd /Users/leonid/src/evox-mcp
npm install

# Typecheck and test
npm run typecheck
npm test

# Build executable bundle
npm run build
```

---

## Configuration

`evox-mcp` can be configured via environment variables:

| Environment Variable | Default | Description |
|---|---|---|
| `EVOX_PROJECT_DIR` | Current working directory | Path to default songbook project directory. |
| `EVOX_BIN` | `evox` | Path to the `evox` CLI executable. |
| `EVOX_READ_ONLY` | `false` | When `true`, rejects mutating tools (`init_songbook`, `update_cover`, `create_song`, `update_song`, `delete_song`, `generate_songbook`). |
| `EVOX_TIMEOUT_MS` | `30000` | Subprocess timeout for Evox CLI commands in milliseconds. |

---

## MCP Client Configuration Example

In `claude_desktop_config.json` or Antigravity MCP settings:

```json
{
  "mcpServers": {
    "evox": {
      "command": "node",
      "args": [
        "/Users/leonid/src/evox-mcp/dist/index.js"
      ],
      "env": {
        "EVOX_PROJECT_DIR": "/Users/leonid/Documents/MySongbook",
        "EVOX_BIN": "evox"
      }
    }
  }
}
```

---

## Song AST Schema

Songs are represented as JSON ASTs with 0-indexed chord-over-lyric lines:

```json
{
  "slug": "free_falling",
  "metadata": {
    "name": "Free Falling",
    "author": "Tom Petty",
    "font": 9.0,
    "column_width": 610,
    "gutter": 5
  },
  "columns": [
    {
      "stanzas": [
        {
          "lines": [
            {
              "chords": "        C    F     F     C     G",
              "lyrics": "She's a good girl, loves her mama"
            },
            {
              "chords": "     C    F     F     C    G",
              "lyrics": "Loves Jesus and America too"
            }
          ]
        }
      ]
    }
  ]
}
```

---

## License

MIT © Leonid Medovyy
