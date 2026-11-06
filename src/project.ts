import { promises as fs } from "node:fs";
import * as path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { EvoxCli } from "./cli.js";
import { EvoxMcpConfig } from "./config.js";
import { parseEvoxSong, serializeEvoxSong, slugifySongName, validateSlug } from "./parser.js";
import {
  CoverConfig,
  CoverConfigSchema,
  SongAst,
  SongColumn,
  SongMetadata,
  SongMetadataSchema,
  SongSummary,
  SongbookStatus,
} from "./types.js";

const JUNK_FILE_PATTERNS = [
  /^\.DS_Store$/i,
  /^\._/i,
  /^Thumbs\.db$/i,
  /^\.git/i,
  /^desktop\.ini$/i,
];

export class EvoxProjectManager {
  private config: EvoxMcpConfig;
  private cli: EvoxCli;

  constructor(config: EvoxMcpConfig, cli?: EvoxCli) {
    this.config = config;
    this.cli = cli || new EvoxCli(config);
  }

  resolveDir(dirOverride?: string): string {
    if (dirOverride && dirOverride.trim().length > 0) {
      return path.resolve(dirOverride.trim());
    }
    return this.config.defaultProjectDir;
  }

  private assertWritable(): void {
    if (this.config.readOnly) {
      throw new Error("Action rejected: server is running in read-only mode (EVOX_READ_ONLY=true)");
    }
  }

  /**
   * Initializes a songbook folder structure.
   */
  async initSongbook(options: {
    projectDir?: string;
    includeSampleSongs?: boolean;
    cover?: Partial<CoverConfig>;
  }): Promise<{ projectDir: string; message: string; songsCount: number }> {
    this.assertWritable();
    const projectDir = this.resolveDir(options.projectDir);

    await fs.mkdir(projectDir, { recursive: true });

    // Check if project has already been initialized
    const songsPath = path.join(projectDir, "songs");
    const coverPath = path.join(projectDir, "cover");
    const bookPath = path.join(projectDir, "book");

    const [hasSongs, hasCover, hasBook] = await Promise.all([
      fs.stat(songsPath).then((s) => s.isDirectory()).catch(() => false),
      fs.stat(coverPath).then((s) => s.isDirectory()).catch(() => false),
      fs.stat(bookPath).then((s) => s.isDirectory()).catch(() => false),
    ]);

    if (hasSongs && hasCover && hasBook) {
      throw new Error(`Songbook already initialized at ${projectDir}`);
    }

    // Run evox init CLI
    await this.cli.init(projectDir);

    // If sample songs are not requested, clear the default copied templates
    let remainingSongs = 3;
    if (!options.includeSampleSongs) {
      const files = await fs.readdir(songsPath);
      for (const file of files) {
        if (file.endsWith(".evox")) {
          await fs.unlink(path.join(songsPath, file));
        }
      }
      remainingSongs = 0;
    }

    // Apply custom cover config if provided
    if (options.cover) {
      await this.updateCover({
        projectDir,
        header: options.cover.header,
        logo: options.cover.logo,
        footer: options.cover.footer,
      });
    }

    return {
      projectDir,
      message: `Songbook successfully initialized at ${projectDir}`,
      songsCount: remainingSongs,
    };
  }

  /**
   * Gets the overall status of a songbook project.
   */
  async getStatus(projectDirOverride?: string): Promise<SongbookStatus> {
    const projectDir = this.resolveDir(projectDirOverride);
    const cliCaps = await this.cli.getCapabilities();

    const songsDir = path.join(projectDir, "songs");
    const coverDir = path.join(projectDir, "cover");
    const bookDir = path.join(projectDir, "book");
    const pdfPath = path.join(bookDir, "book.pdf");

    const [hasSongsDir, hasCoverDir, hasBookDir] = await Promise.all([
      fs.stat(songsDir).then((s) => s.isDirectory()).catch(() => false),
      fs.stat(coverDir).then((s) => s.isDirectory()).catch(() => false),
      fs.stat(bookDir).then((s) => s.isDirectory()).catch(() => false),
    ]);

    const initialized = hasSongsDir && hasCoverDir && hasBookDir;

    let coverConfig: CoverConfig | undefined;
    let logoExists = false;
    let logoPath: string | undefined;

    if (hasCoverDir) {
      try {
        const coverYml = await fs.readFile(path.join(coverDir, "config.yml"), "utf-8");
        const parsed = parseYaml(coverYml);
        coverConfig = CoverConfigSchema.parse(parsed);

        const expectedLogoPath = path.join(coverDir, coverConfig.logo.image);
        logoExists = await fs.stat(expectedLogoPath).then((s) => s.isFile()).catch(() => false);
        logoPath = expectedLogoPath;
      } catch {
        // Leave coverConfig undefined if invalid/missing
      }
    }

    // Check PDF status
    let pdfExists = false;
    let pdfSizeBytes: number | undefined;
    let pdfModifiedAt: string | undefined;
    let pdfMtimeMs = 0;

    try {
      const pdfStat = await fs.stat(pdfPath);
      if (pdfStat.isFile()) {
        pdfExists = true;
        pdfSizeBytes = pdfStat.size;
        pdfModifiedAt = pdfStat.mtime.toISOString();
        pdfMtimeMs = pdfStat.mtimeMs;
      }
    } catch {
      // PDF does not exist yet
    }

    // Read songs and detect stray files
    const songs: SongSummary[] = [];
    const strayFilesWarning: string[] = [];
    let newestSongOrCoverMtimeMs = 0;

    if (hasCoverDir) {
      try {
        const stat = await fs.stat(path.join(coverDir, "config.yml"));
        newestSongOrCoverMtimeMs = Math.max(newestSongOrCoverMtimeMs, stat.mtimeMs);
      } catch {
        // ignore
      }
    }

    if (hasSongsDir) {
      const entries = await fs.readdir(songsDir, { withFileTypes: true });
      for (const entry of entries) {
        const filePath = path.join(songsDir, entry.name);

        if (entry.isDirectory()) {
          strayFilesWarning.push(`Directory found in songs/ folder: ${entry.name}`);
          continue;
        }

        if (entry.name.endsWith(".evox")) {
          try {
            const stat = await fs.stat(filePath);
            newestSongOrCoverMtimeMs = Math.max(newestSongOrCoverMtimeMs, stat.mtimeMs);

            const content = await fs.readFile(filePath, "utf-8");
            const slug = entry.name.slice(0, -".evox".length);
            const ast = parseEvoxSong(content, slug);

            let totalStanzas = 0;
            for (const col of ast.columns) {
              totalStanzas += col.stanzas.length;
            }

            songs.push({
              slug,
              filename: entry.name,
              name: ast.metadata.name,
              author: ast.metadata.author,
              font: ast.metadata.font,
              column_count: ast.columns.length,
              stanza_count: totalStanzas,
            });
          } catch (err: any) {
            strayFilesWarning.push(
              `Malformed .evox song "${entry.name}": ${err.message}`
            );
          }
        } else {
          strayFilesWarning.push(
            `Non-.evox file found in songs/ folder: "${entry.name}" (Evox CLI crashes on non-.evox files)`
          );
        }
      }
    }

    // Sort songs alphabetically by filename (matching Evox Ruby sorting)
    songs.sort((a, b) => a.filename.localeCompare(b.filename));

    const pdfOutdated = pdfExists ? newestSongOrCoverMtimeMs > pdfMtimeMs : false;

    return {
      projectDir,
      initialized,
      hasSongsDir,
      hasCoverDir,
      hasBookDir,
      coverConfig,
      logoExists,
      logoPath,
      pdfExists,
      pdfPath: pdfExists ? pdfPath : undefined,
      pdfSizeBytes,
      pdfModifiedAt,
      pdfOutdated,
      songsCount: songs.length,
      songs,
      strayFilesWarning: strayFilesWarning.length > 0 ? strayFilesWarning : undefined,
      cli: cliCaps,
    };
  }

  /**
   * Reads cover config from cover/config.yml.
   */
  async getCover(projectDirOverride?: string): Promise<{
    projectDir: string;
    config: CoverConfig;
    logoExists: boolean;
    logoPath: string;
  }> {
    const projectDir = this.resolveDir(projectDirOverride);
    const coverDir = path.join(projectDir, "cover");
    const configFile = path.join(coverDir, "config.yml");

    let rawYaml: string;
    try {
      rawYaml = await fs.readFile(configFile, "utf-8");
    } catch {
      throw new Error(`Cover configuration not found at ${configFile}. Has the songbook been initialized?`);
    }

    const parsed = parseYaml(rawYaml);
    const config = CoverConfigSchema.parse(parsed);

    const logoPath = path.join(coverDir, config.logo.image);
    const logoExists = await fs.stat(logoPath).then((s) => s.isFile()).catch(() => false);

    return {
      projectDir,
      config,
      logoExists,
      logoPath,
    };
  }

  /**
   * Updates cover configuration and optionally replaces logo image.
   */
  async updateCover(options: {
    projectDir?: string;
    header?: Partial<CoverConfig["header"]>;
    logo?: Partial<CoverConfig["logo"]>;
    footer?: Partial<CoverConfig["footer"]>;
    logoSourcePath?: string;
  }): Promise<{ message: string; config: CoverConfig }> {
    this.assertWritable();
    const projectDir = this.resolveDir(options.projectDir);
    const coverDir = path.join(projectDir, "cover");
    const configFile = path.join(coverDir, "config.yml");

    await fs.mkdir(coverDir, { recursive: true });

    // Load existing config or default
    let currentConfig: CoverConfig;
    try {
      const raw = await fs.readFile(configFile, "utf-8");
      currentConfig = CoverConfigSchema.parse(parseYaml(raw));
    } catch {
      currentConfig = CoverConfigSchema.parse({});
    }

    // Merge partial changes
    const mergedConfig: CoverConfig = {
      header: {
        ...currentConfig.header,
        ...(options.header || {}),
      },
      logo: {
        ...currentConfig.logo,
        ...(options.logo || {}),
      },
      footer: {
        ...currentConfig.footer,
        ...(options.footer || {}),
      },
    };

    // If a new local logo file is specified, copy it to cover/
    if (options.logoSourcePath) {
      const resolvedLogo = path.resolve(options.logoSourcePath.trim());
      const ext = path.extname(resolvedLogo).toLowerCase();
      if (![".png", ".jpg", ".jpeg"].includes(ext)) {
        throw new Error(
          `Unsupported logo file format "${ext}". Evox supports PNG, JPG, and JPEG images.`
        );
      }

      const stat = await fs.stat(resolvedLogo).catch(() => null);
      if (!stat || !stat.isFile()) {
        throw new Error(`Logo file not found at: ${resolvedLogo}`);
      }

      const targetFileName = options.logo?.image || path.basename(resolvedLogo);
      const targetPath = path.join(coverDir, targetFileName);
      await fs.copyFile(resolvedLogo, targetPath);
      mergedConfig.logo.image = targetFileName;
    }

    // Validate merged config
    const validated = CoverConfigSchema.parse(mergedConfig);

    // Save YAML
    const yamlString = stringifyYaml({
      header: validated.header,
      logo: validated.logo,
      footer: validated.footer,
    });
    await fs.writeFile(configFile, yamlString, "utf-8");

    return {
      message: "Cover configuration updated successfully",
      config: validated,
    };
  }

  /**
   * Lists all songs in alphabetical print order.
   */
  async listSongs(projectDirOverride?: string): Promise<SongSummary[]> {
    const status = await this.getStatus(projectDirOverride);
    return status.songs;
  }

  /**
   * Retrieves full Song AST for a song by slug.
   */
  async getSong(slug: string, projectDirOverride?: string): Promise<SongAst> {
    const cleanSlug = validateSlug(slug);
    const projectDir = this.resolveDir(projectDirOverride);
    const songFile = path.join(projectDir, "songs", `${cleanSlug}.evox`);

    let raw: string;
    try {
      raw = await fs.readFile(songFile, "utf-8");
    } catch {
      throw new Error(`Song "${cleanSlug}" not found at ${songFile}`);
    }

    return parseEvoxSong(raw, cleanSlug);
  }

  /**
   * Creates a new .evox song file from an AST.
   */
  async createSong(options: {
    projectDir?: string;
    slug?: string;
    metadata: SongMetadata;
    columns: SongColumn[];
    upsert?: boolean;
  }): Promise<{ slug: string; path: string; message: string; ast: SongAst }> {
    this.assertWritable();
    const projectDir = this.resolveDir(options.projectDir);
    const songsDir = path.join(projectDir, "songs");
    await fs.mkdir(songsDir, { recursive: true });

    const cleanSlug = validateSlug(options.slug || slugifySongName(options.metadata.name));
    const songFile = path.join(songsDir, `${cleanSlug}.evox`);

    const exists = await fs.stat(songFile).then((s) => s.isFile()).catch(() => false);
    if (exists && !options.upsert) {
      throw new Error(
        `Song "${cleanSlug}" already exists. Set upsert: true or use update_song to overwrite.`
      );
    }

    const raw = serializeEvoxSong({
      metadata: options.metadata,
      columns: options.columns,
    });

    await fs.writeFile(songFile, raw, "utf-8");
    const parsed = parseEvoxSong(raw, cleanSlug);

    return {
      slug: cleanSlug,
      path: songFile,
      message: exists ? `Song "${cleanSlug}" updated` : `Song "${cleanSlug}" created`,
      ast: parsed,
    };
  }

  /**
   * Updates an existing song AST (partial metadata and/or columns replacement).
   */
  async updateSong(options: {
    slug: string;
    projectDir?: string;
    metadata?: Partial<SongMetadata>;
    columns?: SongColumn[];
    newSlug?: string;
  }): Promise<{ slug: string; path: string; message: string; ast: SongAst }> {
    this.assertWritable();
    const currentSlug = validateSlug(options.slug);
    const projectDir = this.resolveDir(options.projectDir);
    const songsDir = path.join(projectDir, "songs");
    const currentFile = path.join(songsDir, `${currentSlug}.evox`);

    const existingAst = await this.getSong(currentSlug, projectDir);

    const mergedMetadata = SongMetadataSchema.parse({
      ...existingAst.metadata,
      ...(options.metadata || {}),
    });

    const finalColumns = options.columns && options.columns.length > 0 ? options.columns : existingAst.columns;
    const finalSlug = options.newSlug ? validateSlug(options.newSlug) : currentSlug;
    const targetFile = path.join(songsDir, `${finalSlug}.evox`);

    // If renaming, ensure target file does not already exist
    if (finalSlug !== currentSlug) {
      const targetExists = await fs.stat(targetFile).then((s) => s.isFile()).catch(() => false);
      if (targetExists) {
        throw new Error(`Cannot rename song to "${finalSlug}": a song with that slug already exists.`);
      }
    }

    const raw = serializeEvoxSong({
      metadata: mergedMetadata,
      columns: finalColumns,
    });

    await fs.writeFile(targetFile, raw, "utf-8");

    if (finalSlug !== currentSlug) {
      await fs.unlink(currentFile);
    }

    const updatedAst = parseEvoxSong(raw, finalSlug);

    return {
      slug: finalSlug,
      path: targetFile,
      message: `Song "${finalSlug}" updated successfully`,
      ast: updatedAst,
    };
  }

  /**
   * Deletes a song from the songbook.
   */
  async deleteSong(slug: string, projectDirOverride?: string): Promise<{ slug: string; message: string }> {
    this.assertWritable();
    const cleanSlug = validateSlug(slug);
    const projectDir = this.resolveDir(projectDirOverride);
    const songFile = path.join(projectDir, "songs", `${cleanSlug}.evox`);

    try {
      await fs.unlink(songFile);
    } catch {
      throw new Error(`Song "${cleanSlug}" not found at ${songFile}`);
    }

    return {
      slug: cleanSlug,
      message: `Song "${cleanSlug}" deleted successfully`,
    };
  }

  /**
   * Cleans stray junk files (.DS_Store, etc.) from songs directory.
   */
  async cleanStrayFiles(projectDir: string): Promise<string[]> {
    const songsDir = path.join(projectDir, "songs");
    const removed: string[] = [];

    try {
      const entries = await fs.readdir(songsDir);
      for (const entry of entries) {
        if (JUNK_FILE_PATTERNS.some((pattern) => pattern.test(entry))) {
          const fullPath = path.join(songsDir, entry);
          await fs.unlink(fullPath);
          removed.push(entry);
        }
      }
    } catch {
      // songs dir might not exist
    }

    return removed;
  }

  /**
   * Pre-flight validates the songbook and invokes `evox generate`.
   */
  async generateSongbook(options: {
    projectDir?: string;
    skipCover?: boolean;
  }): Promise<{
    projectDir: string;
    pdfPath: string;
    pdfSizeBytes: number;
    songsCount: number;
    tableOfContents: string[];
    cleanedFiles?: string[];
  }> {
    this.assertWritable();
    const projectDir = this.resolveDir(options.projectDir);

    const songsDir = path.join(projectDir, "songs");
    const coverDir = path.join(projectDir, "cover");
    const bookDir = path.join(projectDir, "book");

    // Clean stray OS dotfiles before Evox scans the directory
    const cleaned = await this.cleanStrayFiles(projectDir);

    // Verify directories exist
    const hasSongs = await fs.stat(songsDir).then((s) => s.isDirectory()).catch(() => false);
    if (!hasSongs) {
      throw new Error(`Missing songs directory at ${songsDir}. Run init_songbook first.`);
    }

    // Pre-flight validate all songs
    const songEntries = (await fs.readdir(songsDir)).filter((f) => !f.startsWith("."));
    const evoxFiles = songEntries.filter((f) => f.endsWith(".evox"));
    const invalidFiles = songEntries.filter((f) => !f.endsWith(".evox"));

    if (invalidFiles.length > 0) {
      throw new Error(
        `Directory "songs/" contains non-.evox files which will cause evox generate to fail: ${invalidFiles.join(
          ", "
        )}. Please remove them before generating.`
      );
    }

    if (evoxFiles.length === 0) {
      throw new Error(
        `Cannot generate songbook: "songs/" directory is empty. Add at least one song using create_song.`
      );
    }

    // Sort filenames as Ruby does
    evoxFiles.sort();

    const tocList: string[] = [];
    for (const file of evoxFiles) {
      const filePath = path.join(songsDir, file);
      const content = await fs.readFile(filePath, "utf-8");
      const slug = file.slice(0, -".evox".length);
      const parsed = parseEvoxSong(content, slug);
      tocList.push(parsed.metadata.name);
    }

    // Pre-flight validate cover unless skipCover is explicitly true
    if (!options.skipCover) {
      const coverConfigFile = path.join(coverDir, "config.yml");
      let coverConfig: CoverConfig;
      try {
        const rawYaml = await fs.readFile(coverConfigFile, "utf-8");
        coverConfig = CoverConfigSchema.parse(parseYaml(rawYaml));
      } catch (err: any) {
        throw new Error(`Failed to validate cover config at ${coverConfigFile}: ${err.message}`);
      }

      const logoFile = path.join(coverDir, coverConfig.logo.image);
      const logoExists = await fs.stat(logoFile).then((s) => s.isFile()).catch(() => false);
      if (!logoExists) {
        throw new Error(
          `Cover logo file "${coverConfig.logo.image}" not found in ${coverDir}. Place the image in cover/ or use update_cover.`
        );
      }
    }

    // Ensure book directory exists
    await fs.mkdir(bookDir, { recursive: true });

    // Run CLI
    await this.cli.generate(projectDir, { skipCover: options.skipCover });

    const pdfPath = path.join(bookDir, "book.pdf");
    const stat = await fs.stat(pdfPath).catch(() => null);
    if (!stat || !stat.isFile()) {
      throw new Error(`evox generate completed, but book/book.pdf was not found at ${pdfPath}`);
    }

    return {
      projectDir,
      pdfPath,
      pdfSizeBytes: stat.size,
      songsCount: evoxFiles.length,
      tableOfContents: tocList,
      cleanedFiles: cleaned.length > 0 ? cleaned : undefined,
    };
  }
}
