import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  SongAst,
  SongColumn,
  SongLine,
  SongMetadata,
  SongMetadataSchema,
  SongStanza,
} from "./types.js";

/**
 * Normalizes a song title or input string into a safe, valid slug.
 */
export function slugifySongName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  return normalized || "untitled_song";
}

/**
 * Validates that a user-supplied slug is safe (no path traversal, valid chars).
 */
export function validateSlug(rawSlug: string): string {
  const stripped = rawSlug.trim().replace(/\.evox$/i, "");
  if (!stripped) {
    throw new Error("Song slug cannot be empty");
  }
  if (stripped.includes("..") || stripped.includes("/") || stripped.includes("\\")) {
    throw new Error(`Invalid song slug "${rawSlug}": path traversal characters are forbidden.`);
  }
  if (!/^[a-z0-9][a-z0-9_.-]*$/i.test(stripped)) {
    throw new Error(
      `Invalid song slug "${rawSlug}". Slugs must contain only letters, numbers, underscores, dashes, or dots.`
    );
  }
  return stripped;
}

/**
 * Parses raw .evox file content into a validated SongAst structure.
 */
export function parseEvoxSong(rawContent: string, slug: string): SongAst {
  const cleanSlug = validateSlug(slug);

  // 1. Extract and validate frontmatter
  const configMatch = rawContent.match(/==([\s\S]*?)==/);
  if (!configMatch) {
    throw new Error(`Invalid .evox file for "${cleanSlug}": missing frontmatter delimiters '=='`);
  }

  const rawYaml = configMatch[1];
  let parsedYaml: unknown;
  try {
    parsedYaml = parseYaml(rawYaml);
  } catch (err: any) {
    throw new Error(`Failed to parse YAML frontmatter for "${cleanSlug}": ${err.message}`);
  }

  const metadata = SongMetadataSchema.parse(parsedYaml);

  // 2. Scan column blocks delimited by lines containing '--'
  const lines = rawContent.split(/\r?\n/);
  const columnRanges: [number, number][] = [];
  let scanning = false;
  let currentStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("--")) {
      if (!scanning) {
        scanning = true;
        currentStart = i;
      } else {
        scanning = false;
        columnRanges.push([currentStart, i]);
      }
    }
  }

  if (columnRanges.length === 0) {
    throw new Error(
      `Song "${cleanSlug}" must contain at least one column enclosed in double dashes '--'`
    );
  }

  // 3. Parse stanzas and lines within each column
  const columns: SongColumn[] = columnRanges.map(([startIndex, endIndex]) => {
    const innerLines = lines.slice(startIndex + 1, endIndex);
    const stanzas: SongStanza[] = [];
    let currentStanzaLines: SongLine[] = [];

    let i = 0;
    while (i < innerLines.length) {
      const line = innerLines[i];

      // Stanza separator: empty or blank line
      if (line.trim().length === 0) {
        if (currentStanzaLines.length > 0) {
          stanzas.push({ lines: currentStanzaLines });
          currentStanzaLines = [];
        }
        i++;
        continue;
      }

      if (line.startsWith(".")) {
        const chordText = line.slice(1);
        const nextLine = innerLines[i + 1];

        if (nextLine && nextLine.startsWith(" ") && nextLine.trim().length > 0) {
          // Paired chord + lyric line
          const lyricText = nextLine.slice(1).trim();
          currentStanzaLines.push({
            chords: chordText,
            lyrics: lyricText,
          });
          i += 2;
        } else {
          // Chord-only line (e.g. instrumental bar or intro)
          currentStanzaLines.push({
            chords: chordText,
          });
          i++;
        }
      } else if (line.startsWith(" ")) {
        // Lyric-only line
        const lyricText = line.slice(1).trim();
        if (lyricText.length > 0) {
          currentStanzaLines.push({
            lyrics: lyricText,
          });
        }
        i++;
      } else {
        // Line without leading space or dot - upstream evox ignores these
        i++;
      }
    }

    if (currentStanzaLines.length > 0) {
      stanzas.push({ lines: currentStanzaLines });
    }

    // Default to at least one stanza if column was completely empty
    if (stanzas.length === 0) {
      throw new Error(`Column in song "${cleanSlug}" cannot be empty`);
    }

    return { stanzas };
  });

  return {
    slug: cleanSlug,
    metadata,
    columns,
  };
}

/**
 * Serializes a SongAst into raw .evox file format.
 */
export function serializeEvoxSong(song: {
  slug?: string;
  metadata: SongMetadata;
  columns: SongColumn[];
}): string {
  // Validate metadata
  const metadata = SongMetadataSchema.parse(song.metadata);

  if (!song.columns || song.columns.length === 0) {
    throw new Error("Song must contain at least one column");
  }

  // Build frontmatter
  const yamlString = stringifyYaml({
    name: metadata.name,
    author: metadata.author,
    font: metadata.font,
    column_width: metadata.column_width,
    gutter: metadata.gutter,
  });

  let output = `==\n${yamlString}==\n\n`;

  // Build columns
  for (let c = 0; c < song.columns.length; c++) {
    const col = song.columns[c];
    if (!col.stanzas || col.stanzas.length === 0) {
      throw new Error(`Column ${c + 1} must contain at least one stanza`);
    }

    output += "--\n";

    for (let s = 0; s < col.stanzas.length; s++) {
      const stanza = col.stanzas[s];
      if (!stanza.lines || stanza.lines.length === 0) {
        throw new Error(`Stanza ${s + 1} in column ${c + 1} must contain at least one line`);
      }

      for (const line of stanza.lines) {
        if (line.chords) {
          if (line.chords.includes("--")) {
            throw new Error("Chords cannot contain '--'");
          }
          if (line.chords.includes(".")) {
            throw new Error("Chords cannot contain '.'");
          }
          output += `.${line.chords}\n`;
        }
        if (line.lyrics) {
          if (line.lyrics.includes("--")) {
            throw new Error("Lyrics cannot contain '--'; use '—' or '-' instead");
          }
          output += ` ${line.lyrics.trim()}\n`;
        }
      }

      // Add blank line between stanzas inside the column (except after the last stanza)
      if (s < col.stanzas.length - 1) {
        output += "\n";
      }
    }

    output += "--\n";
    if (c < song.columns.length - 1) {
      output += "\n";
    }
  }

  return output;
}
