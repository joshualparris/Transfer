import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { google } from "googleapis";
import { authFor } from "./google";
import { safeSegment } from "./drive-policy";

export const BOOKSHELF_FOLDERS = {
  "IT PD Ebooks": "13bvVMhL0iGxOfFS9nOBk7eGhh6708kbp",
  "Book Club": "1FxuWDsjoRK9DUxdCoPefxea0eqR6EblU",
  Unsorted: "0B9UqG6BQI95fb0xsOElucWx3LUE",
  "Avance KBs": "1VXFuTGxm489hBUeEuFT6I5NWVlfJzAdm",
  "ITIL PDFs": "1v9IfBvQpIlimDsRvVul3Fzcxeq5Ml3yt",
  ITIL: "161BcIPlUqoqUKa5rE-Roniy6qiSnm9XZ",
  "ITIL PRINCE COBIT": "1bpLjo9ZIcGdx2R7uuw0qBPv5Vz2UWUyy",
  "IEC 27001": "1X70Y14d15t3nqw5AxZ9V3XGGBUmRvTdZ",
} as const;

export const BOOKSHELF_RECURSIVE_EBOOK_FOLDERS = {
  "Fiction - Classics": "1nJAAlrhzyVdQp4d36WUJ2MjQziqe9O6l",
  "Fiction - General": "1MD7HO7lZzDApANdYjD6j0b989aST7p4K",
  Nonfiction: "1o2tU1SKcvcuToRxQ-yILZuxWrMvmvH-W",
  "Epub & PDF": "1Ot_Z2si9vnKAGoz_jjwCU056h6zkYypP",
} as const;

export const BOOKSHELF_AUDIOBOOK_FOLDERS = {
  Audiobooks: "1NRY6dXCpILRzfG4yYTpisGqLnqx2ECEQ",
  Outlander: "1SBqmfghmj5gqxWRnCrxbHP65I23ohlcQ",
} as const;

const SUPPORTED_MIME = new Set([
  "application/pdf",
  "application/epub+zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

const AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/m4b",
  "audio/aac",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
]);
const FOLDER_MIME = "application/vnd.google-apps.folder";
const SHORTCUT_MIME = "application/vnd.google-apps.shortcut";

export interface BookshelfItem {
  kind: "ebook" | "audiobook-track";
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  modifiedTime: string | null;
  md5: string | null;
  source: string;
  folderId: string;
  appProperties: Record<string, string>;
  readingProgress: number;
  lastLocation: string;
  lastOpened?: string;
  parentTitle?: string;
  audiobookId?: string;
  rescuedPath?: string;
  sha256?: string;
  status?: string;
  error?: string;
}

function parseProgress(appProperties: Record<string, string> = {}) {
  return {
    readingProgress: appProperties.progressPercentage
      ? Number.parseInt(appProperties.progressPercentage, 10) || 0
      : 0,
    lastLocation: appProperties.lastLocation ?? "",
    lastOpened: appProperties.lastOpened,
  };
}

function isAudioMime(mimeType?: string | null) {
  return !!mimeType && (AUDIO_MIME_TYPES.has(mimeType) || mimeType.startsWith("audio/"));
}

function extensionFor(mime: string, name: string) {
  const existing = path.extname(name);
  if (existing) return "";
  if (mime === "application/pdf") return ".pdf";
  if (mime === "application/epub+zip") return ".epub";
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    return ".docx";
  if (mime === "text/plain") return ".txt";
  if (mime === "audio/mpeg" || mime === "audio/mp3") return ".mp3";
  if (mime === "audio/mp4" || mime === "audio/x-m4a" || mime === "audio/m4a") return ".m4a";
  if (mime === "audio/m4b") return ".m4b";
  if (mime === "audio/aac") return ".aac";
  if (mime === "audio/ogg") return ".ogg";
  if (mime === "audio/wav" || mime === "audio/x-wav") return ".wav";
  if (mime === "audio/flac") return ".flac";
  return "";
}

function uniqueName(used: Set<string>, name: string, mime: string, id: string) {
  const parsed = path.parse(safeSegment(name) + extensionFor(mime, name));
  let candidate = `${parsed.name}${parsed.ext}`;
  if (!used.has(candidate.toLowerCase())) {
    used.add(candidate.toLowerCase());
    return candidate;
  }
  candidate = `${parsed.name}--${id.slice(0, 8)}${parsed.ext}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

async function atomicWrite(file: string, data: string) {
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, data, { flag: "wx" });
  await rename(temp, file);
}

function csvCell(value: unknown) {
  const text = String(value ?? "").replace(/\r?\n/g, " ");
  return `"${text.replaceAll('"', '""')}"`;
}

async function listChildren(drive: ReturnType<typeof google.drive>, folderId: string) {
  const items: any[] = [];
  let pageToken: string | undefined;
  do {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields:
        "nextPageToken,files(id,name,mimeType,size,modifiedTime,md5Checksum,appProperties,shortcutDetails)",
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    items.push(...(response.data.files ?? []));
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);
  return items;
}

function targetId(file: any) {
  return file.mimeType === SHORTCUT_MIME && file.shortcutDetails?.targetId
    ? file.shortcutDetails.targetId
    : file.id;
}

function targetMime(file: any) {
  return file.mimeType === SHORTCUT_MIME && file.shortcutDetails?.targetMimeType
    ? file.shortcutDetails.targetMimeType
    : file.mimeType;
}

function makeItem(
  file: any,
  source: string,
  folderId: string,
  kind: BookshelfItem["kind"],
  extra: Partial<BookshelfItem> = {},
): BookshelfItem | null {
  const id = targetId(file);
  const mimeType = targetMime(file);
  if (!id || !mimeType) return null;
  const appProperties = (file.appProperties ?? {}) as Record<string, string>;
  return {
    kind,
    id,
    name: file.name ?? "unnamed",
    mimeType,
    size: file.size ? Number(file.size) : null,
    modifiedTime: file.modifiedTime ?? null,
    md5: file.md5Checksum ?? null,
    source,
    folderId,
    appProperties,
    ...parseProgress(appProperties),
    ...extra,
  };
}

async function scanEbookFolder(
  drive: ReturnType<typeof google.drive>,
  source: string,
  folderId: string,
  recursive: boolean,
  seen: Set<string>,
  books: BookshelfItem[],
  onProgress?: (progress: any) => void,
) {
  const scanned = new Set<string>();
  const walk = async (id: string): Promise<void> => {
    if (scanned.has(id)) return;
    scanned.add(id);
    for (const file of await listChildren(drive, id)) {
      const mimeType = targetMime(file);
      if (mimeType === FOLDER_MIME && recursive) {
        await walk(targetId(file));
        continue;
      }
      if (!SUPPORTED_MIME.has(mimeType ?? "")) continue;
      const item = makeItem(file, source, folderId, "ebook");
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      books.push(item);
    }
    onProgress?.({ operation: "Scanning BookShelf ebooks", source, files: books.length });
  };
  await walk(folderId);
}

async function collectAudioTracks(
  drive: ReturnType<typeof google.drive>,
  folderId: string,
  source: string,
  rootId: string,
  parentTitle: string,
  audiobookId: string,
  seen: Set<string>,
  items: BookshelfItem[],
) {
  const children = await listChildren(drive, folderId);
  const folders = children.filter((file) => targetMime(file) === FOLDER_MIME);
  const audio = children.filter((file) => isAudioMime(targetMime(file)));
  for (const file of audio) {
    const item = makeItem(file, source, rootId, "audiobook-track", {
      parentTitle,
      audiobookId,
    });
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  for (const folder of folders.sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
    await collectAudioTracks(
      drive,
      targetId(folder),
      source,
      rootId,
      parentTitle,
      audiobookId,
      seen,
      items,
    );
  }
}

async function scanAudiobookFolder(
  drive: ReturnType<typeof google.drive>,
  source: string,
  rootId: string,
  seen: Set<string>,
  items: BookshelfItem[],
  onProgress?: (progress: any) => void,
) {
  const scanned = new Set<string>();
  const walk = async (folderId: string, folderTitle?: string, audiobookId?: string): Promise<void> => {
    if (scanned.has(folderId)) return;
    scanned.add(folderId);
    const children = await listChildren(drive, folderId);
    const folders = children.filter((file) => targetMime(file) === FOLDER_MIME);
    const audio = children.filter((file) => isAudioMime(targetMime(file)));
    if (audio.length > 0) {
      await collectAudioTracks(
        drive,
        folderId,
        source,
        rootId,
        folderTitle || source,
        audiobookId || folderId,
        seen,
        items,
      );
    }
    for (const folder of folders.sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
      await walk(targetId(folder), folder.name ?? "Audiobook", targetId(folder));
    }
    onProgress?.({
      operation: "Scanning BookShelf audiobooks",
      source,
      audiobookTracks: items.length,
    });
  };
  await walk(rootId);
}

export async function scanBookshelf(onProgress?: (progress: any) => void) {
  const auth = await authFor("source");
  const drive = google.drive({ version: "v3", auth });
  const books: BookshelfItem[] = [];
  const audio: BookshelfItem[] = [];
  const seen = new Set<string>();

  for (const [source, folderId] of Object.entries(BOOKSHELF_FOLDERS)) {
    await scanEbookFolder(drive, source, folderId, false, seen, books, onProgress);
  }
  for (const [source, folderId] of Object.entries(BOOKSHELF_RECURSIVE_EBOOK_FOLDERS)) {
    await scanEbookFolder(drive, source, folderId, true, seen, books, onProgress);
  }
  for (const [source, folderId] of Object.entries(BOOKSHELF_AUDIOBOOK_FOLDERS)) {
    await scanAudiobookFolder(drive, source, folderId, seen, audio, onProgress);
  }

  return [...books, ...audio].sort(
    (a, b) =>
      a.kind.localeCompare(b.kind) ||
      a.source.localeCompare(b.source) ||
      (a.parentTitle ?? "").localeCompare(b.parentTitle ?? "") ||
      a.name.localeCompare(b.name),
  );
}

export async function rescueBookshelf(destination: string, onProgress?: (progress: any) => void) {
  const auth = await authFor("source");
  const drive = google.drive({ version: "v3", auth });
  const root = path.join(destination, `BookShelf Rescue ${new Date().toISOString().slice(0, 10)}`);
  const libraryRoot = path.join(root, "library");
  await mkdir(libraryRoot, { recursive: true });

  const books = await scanBookshelf(onProgress);
  const usedBySource = new Map<string, Set<string>>();
  let copied = 0;
  let failed = 0;

  for (const book of books) {
    try {
      const folder = path.join(
        libraryRoot,
        book.kind === "audiobook-track" ? "Audiobooks" : "Ebooks",
        safeSegment(book.source),
        book.parentTitle ? safeSegment(book.parentTitle) : "",
      );
      await mkdir(folder, { recursive: true });
      const used = usedBySource.get(book.source) ?? new Set<string>();
      usedBySource.set(book.source, used);
      const filename = uniqueName(used, book.name, book.mimeType, book.id);
      const finalPath = path.join(folder, filename);
      const tempPath = `${finalPath}.${process.pid}.tmp`;
      const hash = createHash("sha256");
      const response = await drive.files.get(
        { fileId: book.id, alt: "media" },
        { responseType: "stream" },
      );
      response.data.on("data", (chunk: Buffer) => hash.update(chunk));
      await pipeline(response.data, createWriteStream(tempPath));
      await rename(tempPath, finalPath);
      book.rescuedPath = path.relative(root, finalPath);
      book.sha256 = hash.digest("hex");
      book.status = "rescued";
      copied++;
    } catch (error) {
      book.status = "failed";
      book.error = error instanceof Error ? error.message : String(error);
      failed++;
    }
      onProgress?.({
      operation: "Rescuing BookShelf files",
      files: books.length,
      copied,
      failed,
      current: book.name,
    });
  }

  const generatedAt = new Date().toISOString();
  const ebookCount = books.filter((book) => book.kind === "ebook").length;
  const audiobookTrackCount = books.filter((book) => book.kind === "audiobook-track").length;
  const audiobookCount = new Set(
    books
      .filter((book) => book.kind === "audiobook-track")
      .map((book) => book.audiobookId || book.parentTitle || book.id),
  ).size;
  const payload = {
    generatedAt,
    source: "joshua.parris@cornerstone.edu.au",
    folders: {
      fixedEbooks: BOOKSHELF_FOLDERS,
      recursiveEbooks: BOOKSHELF_RECURSIVE_EBOOK_FOLDERS,
      audiobooks: BOOKSHELF_AUDIOBOOK_FOLDERS,
    },
    counts: { discovered: books.length, ebooks: ebookCount, audiobooks: audiobookCount, audiobookTracks: audiobookTrackCount, rescued: copied, failed },
    books,
  };
  await atomicWrite(path.join(root, "bookshelf-rescue.json"), JSON.stringify(payload, null, 2));
  await atomicWrite(
    path.join(root, "bookshelf-rescue.csv"),
    [
      "kind,source,parent_title,name,id,mime_type,size,modified_time,reading_progress,last_opened,rescued_path,sha256,status,error",
      ...books.map((book) =>
        [
          book.kind,
          book.source,
          book.parentTitle ?? "",
          book.name,
          book.id,
          book.mimeType,
          book.size ?? "",
          book.modifiedTime ?? "",
          book.readingProgress,
          book.lastOpened ?? "",
          book.rescuedPath ?? "",
          book.sha256 ?? "",
          book.status ?? "",
          book.error ?? "",
        ]
          .map(csvCell)
          .join(","),
      ),
    ].join("\n"),
  );
  return { root, discovered: books.length, rescued: copied, failed };
}
