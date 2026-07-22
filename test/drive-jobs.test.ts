import { describe, expect, it } from "vitest";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { LifeboatDatabase } from "../electron/database";
const state = () => path.join(mkdtempSync(path.join(tmpdir(), "lifeboat-phase2-")), "state.db");
describe("persistent Drive jobs", () => {
  it("prevents conflicting jobs and recovers a crash", () => {
    const file = state();
    let db = new LifeboatDatabase(file);
    const input = {
      type: "drive_backup_copy",
      remote: "source",
      destination: path.join(tmpdir(), "backup"),
      rclonePath: "rclone",
      version: "test",
      args: ["copy"],
    };
    db.startJob(input);
    expect(() => db.startJob(input)).toThrow(/already active/);
    db.close();
    db = new LifeboatDatabase(file);
    expect(db.jobs()[0].status).toBe("interrupted");
    db.close();
  });
  it("pages the manifest", () => {
    const db = new LifeboatDatabase(state());
    for (let i = 0; i < 3; i++)
      db.upsertDrive({
        sourceId: String(i),
        name: `f${i}`,
        mimeType: "text/plain",
        parents: "[]",
        resolvedPath: `f${i}`,
        relativePath: `f${i}`,
        size: 1,
        createdTime: null,
        modifiedTime: null,
        md5: null,
        isNative: 0,
        isFolder: 0,
        isShortcut: 0,
        shortcutTarget: null,
        owned: 1,
        ownerName: null,
        ownerEmail: null,
        shared: 0,
        trashed: 0,
        exportExtension: null,
        canDownload: 1,
        canCopy: 1,
        permissions: "[]",
        updatedAt: new Date().toISOString(),
      });
    expect(db.drivePage(0, 2)).toHaveLength(2);
    expect(db.drivePage(2, 2)).toHaveLength(1);
    db.close();
  });
});
