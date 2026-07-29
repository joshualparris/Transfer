import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readdir, rename, stat, writeFile } from "node:fs/promises";
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
