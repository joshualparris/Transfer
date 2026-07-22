import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LifeboatDatabase } from "../electron/database";
describe("unified activity logging", () => {
  it("persists and filters structured module logs", () => {
    const db = new LifeboatDatabase(
      path.join(mkdtempSync(path.join(tmpdir(), "lifeboat-activity-")), "state.db"),
    );
    db.activityLog("contacts", "info", "Migrating contacts", { processed: 12 });
    db.activityLog("calendar", "error", "Rate limited", { retry: true });
    const logs = db.activityLogs(10);
    expect(logs.some((x) => x.module === "contacts" && x.message === "Migrating contacts")).toBe(
      true,
    );
    expect(logs.some((x) => x.module === "calendar" && x.level === "error")).toBe(true);
    expect(db.failureDiagnostics()).toEqual([]);
    db.close();
  });
});
