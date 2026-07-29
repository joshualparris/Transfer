import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
const photo = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".heic",
  ".tif",
  ".tiff",
  ".mp4",
  ".mov",
  ".avi",
  ".mkv",
  ".3gp",
]);
async function digest(file: string) {
  const h = createHash("sha256");
  await new Promise<void>((ok, no) =>
    createReadStream(file)
      .on("data", (b) => h.update(b))
      .on("end", ok)
      .on("error", no),
  );
  return h.digest("hex");
}

function archiveKind(file: string) {
  const lower = file.toLowerCase();
  if (lower.endsWith(".zip")) return "zip";
  if (lower.endsWith(".tgz") || lower.endsWith(".tar.gz")) return "tgz";
  if (lower.endsWith(".tar")) return "tar";
  return "";
}

function html(value: string) {
  return value.replace(/[&<>"']/g, (x) => {
    const entity: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entity[x];
  });
}

async function walkFiles(root: string) {
  const out: string[] = [],
    stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const d of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, d.name);
      if (d.isDirectory()) stack.push(full);
      else if (d.isFile()) out.push(full);
    }
  }
  return out;
}

async function uniqueDestination(file: string, sha256: string) {
  const ext = path.extname(file),
    base = file.slice(0, -ext.length);
  let candidate = file,
    n = 1;
  try {
    await stat(candidate);
    candidate = `${base}-${sha256.slice(0, 8)}${ext}`;
    while (true) {
      try {
        await stat(candidate);
        candidate = `${base}-${sha256.slice(0, 8)}-${n++}${ext}`;
      } catch {
        return candidate;
      }
    }
  } catch {
    return candidate;
  }
}

async function photoTakenDate(file: string) {
  for (const sidecar of [`${file}.json`, `${file.slice(0, -path.extname(file).length)}.json`]) {
    try {
      const raw = await readFile(sidecar, "utf8");
      const parsed = JSON.parse(raw);
      const timestamp =
        parsed?.photoTakenTime?.timestamp ??
        parsed?.creationTime?.timestamp ??
        parsed?.modificationTime?.timestamp;
      if (timestamp) return new Date(Number(timestamp) * 1000);
    } catch {}
  }
  return new Date((await stat(file)).mtimeMs);
}

function monthFolder(date: Date) {
  const year = Number.isFinite(date.getFullYear()) ? date.getFullYear() : "unknown";
  const month = Number.isFinite(date.getMonth())
    ? String(date.getMonth() + 1).padStart(2, "0")
    : "00";
  return path.join(String(year), month);
}

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(command, args, { windowsHide: true, shell: false });
    let err = "";
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err || `${command} exited ${code}`));
    });
  });
}

async function extractArchive(archive: string, destination: string) {
  const kind = archiveKind(archive);
  if (!kind) throw new Error(`Unsupported archive type: ${path.basename(archive)}`);
  await mkdir(destination, { recursive: true });

  if (kind === "zip") {
    if (process.platform === "win32") {
      await run("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force",
        archive,
        destination,
      ]);
    } else {
      await run("unzip", ["-oq", archive, "-d", destination]);
    }
    return;
  }

  await run("tar", ["-xf", archive, "-C", destination]);
}

export async function scanTakeout(root: string, output: string, progress?: (x: any) => void) {
  const base = path.resolve(root);
  if (base === path.parse(base).root)
    throw new Error("Choose the extracted Google Takeout folder, not a disk root");
  const rows: any[] = [],
    stack = [base];
  let files = 0,
    bytes = 0;
  while (stack.length) {
    const dir = stack.pop()!;
    for (const d of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, d.name);
      if (d.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!d.isFile()) continue;
      const rel = path.relative(base, full),
        lower = rel.toLowerCase(),
        service = lower.includes("google photos")
          ? "photos"
          : lower.includes("keep")
            ? "keep"
            : "other";
      const s = await stat(full);
      rows.push({ service, path: rel, size: s.size, sha256: await digest(full) });
      files++;
      bytes += s.size;
      if (files % 25 === 0) progress?.({ operation: "Hashing Takeout files", files, bytes });
    }
  }
  await mkdir(output, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-"),
    baseName = path.join(output, `takeout-evidence-${stamp}`),
    summary = {
      createdAt: new Date().toISOString(),
      sourceFolder: path.basename(base),
      files,
      bytes,
      photos: rows.filter((x) => x.service === "photos").length,
      keep: rows.filter((x) => x.service === "keep").length,
      other: rows.filter((x) => x.service === "other").length,
      zeroByteFiles: rows.filter((x) => x.size === 0).length,
      photoMedia: rows.filter(
        (x) => x.service === "photos" && photo.has(path.extname(x.path).toLowerCase()),
      ).length,
      photoSidecars: rows.filter(
        (x) => x.service === "photos" && path.extname(x.path).toLowerCase() === ".json",
      ).length,
    };
  for (const [ext, data] of [
    ["json", JSON.stringify({ summary, files: rows }, null, 2)],
    [
      "csv",
      [
        "service,path,size,sha256",
        ...rows.map((x) =>
          [x.service, `"${x.path.replaceAll('"', '""')}"`, x.size, x.sha256].join(","),
        ),
      ].join("\r\n"),
    ],
  ] as const) {
    const tmp = `${baseName}.${ext}.tmp`;
    await writeFile(tmp, data, { flag: "wx" });
    await rename(tmp, `${baseName}.${ext}`);
  }
  progress?.({ operation: "Takeout verification complete", ...summary });
  return summary;
}

export async function importPhotosTakeoutArchives(
  archives: string[],
  destination: string,
  progress?: (x: any) => void,
) {
  if (!archives.length) throw new Error("Choose at least one Google Takeout archive");
  const base = path.resolve(destination);
  if (base === path.parse(base).root)
    throw new Error("Choose a dedicated local/NAS backup folder, not a disk root");

  for (const archive of archives) {
    if (!archiveKind(archive))
      throw new Error(`Unsupported archive type: ${path.basename(archive)}`);
    await stat(archive);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const importRoot = path.join(base, `Google Photos Takeout ${stamp}`);
  await mkdir(importRoot, { recursive: true });

  for (const [index, archive] of archives.entries()) {
    progress?.({
      operation: `Extracting ${path.basename(archive)}`,
      current: index + 1,
      total: archives.length,
    });
    await extractArchive(archive, importRoot);
  }

  const result = await scanTakeout(importRoot, importRoot, progress);
  return {
    ...result,
    importedArchives: archives.length,
    importFolder: importRoot,
  };
}

export async function organizeTakeoutFolder(
  sourceFolder: string,
  destination: string,
  progress?: (x: any) => void,
) {
  const source = path.resolve(sourceFolder),
    base = path.resolve(destination);
  if (source === path.parse(source).root)
    throw new Error("Choose a Takeout folder, not a disk root");
  if (base === path.parse(base).root)
    throw new Error("Choose a dedicated local/NAS destination folder, not a disk root");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-"),
    root = path.join(base, `Google Photos Organized ${stamp}`),
    extracted = path.join(root, "extracted"),
    sorted = path.join(root, "sorted"),
    mediaRoot = path.join(sorted, "media"),
    sidecarRoot = path.join(sorted, "sidecars");
  await mkdir(extracted, { recursive: true });
  await mkdir(mediaRoot, { recursive: true });
  await mkdir(sidecarRoot, { recursive: true });

  const sourceFiles = await walkFiles(source),
    archives = sourceFiles.filter((file) => archiveKind(file));

  for (const [index, archive] of archives.entries()) {
    progress?.({
      operation: `Extracting ${path.basename(archive)}`,
      current: index + 1,
      total: archives.length,
    });
    await extractArchive(archive, extracted);
  }

  if (!archives.length) {
    progress?.({ operation: "No archives found; organizing existing folder contents" });
  }

  const roots = archives.length ? [extracted] : [source],
    rows: Array<{
      kind: string;
      originalPath: string;
      sortedPath: string;
      size: number;
      sha256: string;
    }> = [],
    gallery: Array<{ type: string; src: string; name: string }> = [];
  let media = 0,
    sidecars = 0,
    bytes = 0;

  for (const rootSource of roots) {
    const files = await walkFiles(rootSource);
    for (const file of files) {
      const ext = path.extname(file).toLowerCase(),
        rel = path.relative(rootSource, file);
      if (photo.has(ext)) {
        const taken = await photoTakenDate(file),
          folder = path.join(mediaRoot, monthFolder(taken)),
          sha256 = await digest(file),
          s = await stat(file),
          destinationFile = await uniqueDestination(path.join(folder, path.basename(file)), sha256);
        await mkdir(path.dirname(destinationFile), { recursive: true });
        await copyFile(file, destinationFile);
        media++;
        bytes += s.size;
        rows.push({
          kind: "media",
          originalPath: rel,
          sortedPath: path.relative(root, destinationFile),
          size: s.size,
          sha256,
        });
        if ([".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext))
          gallery.push({
            type: "image",
            src: path.relative(root, destinationFile).split(path.sep).join("/"),
            name: path.basename(file),
          });
        if ([".mp4", ".mov", ".webm"].includes(ext))
          gallery.push({
            type: "video",
            src: path.relative(root, destinationFile).split(path.sep).join("/"),
            name: path.basename(file),
          });
      } else if (ext === ".json") {
        const sha256 = await digest(file),
          s = await stat(file),
          destinationFile = await uniqueDestination(
            path.join(sidecarRoot, path.basename(file)),
            sha256,
          );
        await copyFile(file, destinationFile);
        sidecars++;
        bytes += s.size;
        rows.push({
          kind: "sidecar",
          originalPath: rel,
          sortedPath: path.relative(root, destinationFile),
          size: s.size,
          sha256,
        });
      }
      if ((media + sidecars) % 25 === 0 && media + sidecars > 0)
        progress?.({ operation: "Sorting Takeout media", media, sidecars, bytes });
    }
  }

  const evidence = {
    createdAt: new Date().toISOString(),
    sourceFolder: source,
    organizedFolder: root,
    archivesFound: archives.length,
    media,
    sidecars,
    files: rows.length,
    bytes,
    filesDetail: rows,
  };
  await writeFile(path.join(root, "organized-evidence.json"), JSON.stringify(evidence, null, 2));
  await writeFile(
    path.join(root, "organized-evidence.csv"),
    [
      "kind,original_path,sorted_path,size,sha256",
      ...rows.map((x) =>
        [
          x.kind,
          `"${x.originalPath.replaceAll('"', '""')}"`,
          `"${x.sortedPath.replaceAll('"', '""')}"`,
          x.size,
          x.sha256,
        ].join(","),
      ),
    ].join("\r\n"),
  );

  const galleryFile = path.join(root, "photo-gallery.html");
  await writeFile(
    galleryFile,
    `<!doctype html><meta charset="utf-8"><title>Cornerstone Photos Gallery</title><style>body{font-family:system-ui;margin:24px;background:#f7f4ec;color:#172f27}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px}.item{background:white;border:1px solid #ddd5c5;border-radius:8px;padding:8px}img,video{width:100%;height:160px;object-fit:cover;border-radius:6px}.name{font-size:12px;margin-top:6px;overflow-wrap:anywhere}</style><h1>Cornerstone Photos Gallery</h1><p>${media.toLocaleString()} media files · ${sidecars.toLocaleString()} sidecars · ${archives.length.toLocaleString()} archives</p><div class="grid">${gallery
      .map((item) =>
        item.type === "video"
          ? `<div class="item"><video controls src="${html(item.src)}"></video><div class="name">${html(item.name)}</div></div>`
          : `<div class="item"><img loading="lazy" src="${html(item.src)}"><div class="name">${html(item.name)}</div></div>`,
      )
      .join("")}</div>`,
  );

  progress?.({ operation: "Takeout organization complete", ...evidence, galleryFile });
  return { ...evidence, galleryFile };
}
