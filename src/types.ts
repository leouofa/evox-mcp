import { z } from "zod";

export const SongLineSchema = z
  .object({
    chords: z
      .string()
      .min(1)
      .refine((s) => !s.includes("\n") && !s.includes("\r"), "Chords cannot contain newlines")
      .refine((s) => !s.includes("--"), "Chords cannot contain '--' (reserved Evox column delimiter)")
      .refine((s) => !s.includes("."), "Chords cannot contain '.' (stripped by Evox chord renderer)")
      .optional()
      .describe("Monospace chord line aligned over lyrics (0-indexed to lyric start)."),
    lyrics: z
      .string()
      .min(1)
      .refine((s) => s.trim().length > 0, "Lyrics cannot be whitespace-only")
      .refine((s) => !s.includes("\n") && !s.includes("\r"), "Lyrics cannot contain newlines")
      .refine((s) => !s.includes("--"), "Lyrics cannot contain '--' (reserved Evox column delimiter; use '—' or '-')")
      .optional()
      .describe("Lyric text line (Evox will trim leading/trailing whitespace)."),
  })
  .refine((line) => line.chords !== undefined || line.lyrics !== undefined, {
    message: "Each SongLine must include at least one of 'chords' or 'lyrics'",
  });

export type SongLine = z.infer<typeof SongLineSchema>;

export const SongStanzaSchema = z.object({
  lines: z.array(SongLineSchema).min(1, "Each stanza must contain at least one line"),
});

export type SongStanza = z.infer<typeof SongStanzaSchema>;

export const SongColumnSchema = z.object({
  stanzas: z.array(SongStanzaSchema).min(1, "Each column must contain at least one stanza"),
});

export type SongColumn = z.infer<typeof SongColumnSchema>;

export const SongMetadataSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Song name cannot be empty")
    .max(60, "Song name must be 60 characters or fewer to prevent Table of Contents overflow in Evox")
    .describe("Display title of the song"),
  author: z
    .string()
    .trim()
    .min(1, "Author cannot be empty")
    .describe("Artist or author of the song"),
  font: z
    .number()
    .positive()
    .max(36)
    .default(9.0)
    .describe("Font size in points (default: 9.0)"),
  column_width: z
    .number()
    .positive()
    .max(1000)
    .default(580)
    .describe("Total column width in points (default: 580)"),
  gutter: z
    .number()
    .min(0)
    .max(100)
    .default(5)
    .describe("Gutter spacing between columns in points (default: 5)"),
});

export type SongMetadata = z.infer<typeof SongMetadataSchema>;

export const SongAstSchema = z.object({
  slug: z.string().describe("Song filename slug without .evox extension"),
  metadata: SongMetadataSchema,
  columns: z.array(SongColumnSchema).min(1, "A song must have at least one column"),
});

export type SongAst = z.infer<typeof SongAstSchema>;

export const CoverHeaderSchema = z.object({
  top_padding: z.number().nonnegative().default(20),
  title: z.string().default("The Great Book of Songs"),
  title_size: z.number().positive().default(35),
  subtitle: z.string().default("Version 0.5"),
  subtitle_size: z.number().positive().default(15),
  bottom_padding: z.number().nonnegative().default(50),
});

export const CoverLogoSchema = z.object({
  image: z.string().default("logo.png"),
  width: z.number().positive().default(393.5),
  height: z.number().positive().default(457),
});

export const CoverFooterSchema = z.object({
  title: z.string().default("Compiled with Evox"),
  title_size: z.number().positive().default(25),
});

export const CoverConfigSchema = z.object({
  header: CoverHeaderSchema.default({}),
  logo: CoverLogoSchema.default({}),
  footer: CoverFooterSchema.default({}),
});

export type CoverConfig = z.infer<typeof CoverConfigSchema>;

export interface SongSummary {
  slug: string;
  filename: string;
  name: string;
  author: string;
  font: number;
  column_count: number;
  stanza_count: number;
}

export interface CliCapabilities {
  available: boolean;
  version?: string;
  supportsSkipCover: boolean;
  binPath: string;
  error?: string;
}

export interface SongbookStatus {
  projectDir: string;
  initialized: boolean;
  hasSongsDir: boolean;
  hasCoverDir: boolean;
  hasBookDir: boolean;
  coverConfig?: CoverConfig;
  logoExists: boolean;
  logoPath?: string;
  pdfExists: boolean;
  pdfPath?: string;
  pdfSizeBytes?: number;
  pdfModifiedAt?: string;
  pdfOutdated?: boolean;
  songsCount: number;
  songs: SongSummary[];
  strayFilesWarning?: string[];
  cli: CliCapabilities;
}
