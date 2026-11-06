import { promises as fs } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { parseEvoxSong, serializeEvoxSong, slugifySongName, validateSlug } from "../src/parser.js";
import { SongAst } from "../src/types.js";

const TEMPLATES_DIR = path.resolve("/Users/leonid/src/evox/lib/templates");

describe("Evox Parser and Serializer", () => {
  it("slugifies song titles correctly", () => {
    expect(slugifySongName("Free Falling")).toBe("free_falling");
    expect(slugifySongName("Somewhere Over The Rainbow")).toBe("somewhere_over_the_rainbow");
    expect(slugifySongName("Don't Stop Believin'!")).toBe("dont_stop_believin");
    expect(slugifySongName("")).toBe("untitled_song");
  });

  it("validates slugs and prevents path traversal", () => {
    expect(validateSlug("free_falling")).toBe("free_falling");
    expect(validateSlug("free_falling.evox")).toBe("free_falling");
    expect(() => validateSlug("../secret")).toThrow(/path traversal/);
    expect(() => validateSlug("sub/dir")).toThrow(/path traversal/);
    expect(() => validateSlug("")).toThrow(/empty/);
  });

  it("round-trips free_falling.evox template losslessly", async () => {
    const raw = await fs.readFile(path.join(TEMPLATES_DIR, "free_falling.evox"), "utf-8");
    const ast = parseEvoxSong(raw, "free_falling");

    expect(ast.slug).toBe("free_falling");
    expect(ast.metadata.name).toBe("Free Falling");
    expect(ast.metadata.author).toBe("Tom Petty");
    expect(ast.metadata.font).toBe(9.0);
    expect(ast.metadata.column_width).toBe(610);
    expect(ast.metadata.gutter).toBe(5);
    expect(ast.columns.length).toBe(2);

    // Verify stanzas and chord pairs
    const col1 = ast.columns[0];
    expect(col1.stanzas.length).toBeGreaterThanOrEqual(3);
    expect(col1.stanzas[0].lines[0].chords).toBe("        C    F     F     C     G");
    expect(col1.stanzas[0].lines[0].lyrics).toBe("She's a good girl, loves her mama");

    // Serialize and re-parse
    const serialized = serializeEvoxSong(ast);
    const roundTrippedAst = parseEvoxSong(serialized, "free_falling");
    expect(roundTrippedAst.metadata).toEqual(ast.metadata);
    expect(roundTrippedAst.columns).toEqual(ast.columns);
  });

  it("round-trips over_the_rainbow.evox template with trailing whitespace / stanzas", async () => {
    const raw = await fs.readFile(path.join(TEMPLATES_DIR, "over_the_rainbow.evox"), "utf-8");
    const ast = parseEvoxSong(raw, "over_the_rainbow");

    expect(ast.metadata.name).toBe("Somewhere Over The Rainbow");
    expect(ast.metadata.author).toBe("Israël Kamakawiwo'ole");
    expect(ast.metadata.font).toBe(7.2);
    expect(ast.columns.length).toBe(2);

    const serialized = serializeEvoxSong(ast);
    const roundTripped = parseEvoxSong(serialized, "over_the_rainbow");
    expect(roundTripped.metadata.name).toBe(ast.metadata.name);
    expect(roundTripped.columns.length).toBe(2);
  });

  it("round-trips UTF-8 Cyrillic i_dont_love.evox template", async () => {
    const raw = await fs.readFile(path.join(TEMPLATES_DIR, "i_dont_love.evox"), "utf-8");
    const ast = parseEvoxSong(raw, "i_dont_love");

    expect(ast.metadata.name).toBe("Я не люблю");
    expect(ast.metadata.author).toContain("Владимир Высоцкии");
    expect(ast.metadata.font).toBe(9.5);
    expect(ast.columns.length).toBe(2);

    const serialized = serializeEvoxSong(ast);
    const roundTripped = parseEvoxSong(serialized, "i_dont_love");
    expect(roundTripped.metadata.name).toBe("Я не люблю");
    expect(roundTripped.columns).toEqual(ast.columns);
  });

  it("handles standalone chord lines and standalone lyric lines", () => {
    const songInput: SongAst = {
      slug: "instrumental_intro",
      metadata: {
        name: "Intro Test",
        author: "Tester",
        font: 9.0,
        column_width: 580,
        gutter: 5,
      },
      columns: [
        {
          stanzas: [
            {
              lines: [
                { chords: "Em   G   D   A" }, // Chord only
              ],
            },
            {
              lines: [
                { lyrics: "Acapella lyric line with no chords" }, // Lyric only
              ],
            },
            {
              lines: [
                { chords: "C        D", lyrics: "Paired chords and lyrics" },
              ],
            },
          ],
        },
      ],
    };

    const serialized = serializeEvoxSong(songInput);
    expect(serialized).toContain(".Em   G   D   A");
    expect(serialized).toContain(" Acapella lyric line with no chords");
    expect(serialized).toContain(".C        D\n Paired chords and lyrics");

    const reParsed = parseEvoxSong(serialized, "instrumental_intro");
    expect(reParsed.columns[0].stanzas).toEqual(
      songInput.columns[0].stanzas
    );
  });

  it("rejects song names longer than 60 chars to protect Evox Table of Contents", () => {
    expect(() =>
      serializeEvoxSong({
        metadata: {
          name: "A".repeat(61),
          author: "Artist",
          font: 9,
          column_width: 580,
          gutter: 5,
        },
        columns: [{ stanzas: [{ lines: [{ lyrics: "Hello" }] }] }],
      })
    ).toThrow(/60 characters or fewer/);
  });

  it("rejects reserved delimiter '--' in chords or lyrics", () => {
    expect(() =>
      serializeEvoxSong({
        metadata: {
          name: "Delim Test",
          author: "Artist",
          font: 9,
          column_width: 580,
          gutter: 5,
        },
        columns: [
          {
            stanzas: [
              {
                lines: [{ lyrics: "Break -- bad" }],
              },
            ],
          },
        ],
      })
    ).toThrow(/Lyrics cannot contain '--'/);
  });

  it("rejects '.' in chords because Evox strips periods", () => {
    expect(() =>
      serializeEvoxSong({
        metadata: {
          name: "Dot Test",
          author: "Artist",
          font: 9,
          column_width: 580,
          gutter: 5,
        },
        columns: [
          {
            stanzas: [
              {
                lines: [{ chords: "C.add9" }],
              },
            ],
          },
        ],
      })
    ).toThrow(/Chords cannot contain '\.'/);
  });
});
