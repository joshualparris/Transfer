import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { organizeTakeoutFolder, scanTakeout } from "../electron/preservation";
import { findRclone } from "../electron/rclone";

describe("preservation tooling", () => {
  it("reports a valid rclone installation or a clean environment absence", () => {
    const found = findRclone();
    expect(found === null || /^rclone v/i.test(found.version)).toBe(true);
    if (found) expect(found.path.length).toBeGreaterThan(0);
  });

  it("checksums extracted Takeout Photos media and sidecars", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "lifeboat-takeout-"));
    const output = await mkdtemp(path.join(os.tmpdir(), "lifeboat-evidence-"));
    const photos = path.join(root, "Takeout", "Google Photos", "Photos from 2020");
    await mkdir(photos, { recursive: true });
    await writeFile(path.join(photos, "beach.jpg"), "photo-bytes");
    await writeFile(path.join(photos, "beach.jpg.json"), '{"title":"beach.jpg"}');
    await writeFile(path.join(root, "Takeout", "archive_browser.html"), "<html></html>");

    const result = await scanTakeout(root, output);

    expect(result.files).toBe(3);
    expect(result.photos).toBe(2);
    expect(result.other).toBe(1);
    expect(result.photoMedia).toBe(1);
    expect(result.photoSidecars).toBe(1);

    const evidenceFile = (await readdir(output)).find((x) => x.endsWith(".json"));
    expect(evidenceFile).toBeTruthy();
    const evidence = await readFile(path.join(output, evidenceFile!), "utf8");
    expect(JSON.parse(evidence).summary.files).toBe(3);
  });

  it("organizes existing Takeout media into a dated gallery folder", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "lifeboat-takeout-source-"));
    const output = await mkdtemp(path.join(os.tmpdir(), "lifeboat-takeout-organized-"));
    const photos = path.join(root, "Takeout", "Google Photos", "Photos from 2020");
    await mkdir(photos, { recursive: true });
    await writeFile(path.join(photos, "beach.jpg"), "photo-bytes");
    await writeFile(
      path.join(photos, "beach.jpg.json"),
      JSON.stringify({ photoTakenTime: { timestamp: "1577836800" } }),
    );

    const result = await organizeTakeoutFolder(root, output);

    expect(result.media).toBe(1);
    expect(result.sidecars).toBe(1);
    expect(result.galleryFile.endsWith("photo-gallery.html")).toBe(true);
    expect(await readFile(result.galleryFile, "utf8")).toContain("beach.jpg");
    const evidence = JSON.parse(
      await readFile(path.join(result.organizedFolder, "organized-evidence.json"), "utf8"),
    );
    expect(evidence.files).toBe(2);
  });
});
