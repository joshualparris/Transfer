import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  copyArgs,
  checkArgs,
  parseProgress,
  validateDestination,
  validateRemote,
} from "../electron/rclone";
import {
  classifyShared,
  deterministicName,
  exportFor,
  isSafeRelative,
  safeSegment,
} from "../electron/drive-policy";
import { aggregateVerification } from "../electron/verification";
describe("safe rclone construction", () => {
  it("rejects remote injection", () => {
    for (const x of ["bad:remote", "x; rm", "../x", ""]) expect(() => validateRemote(x)).toThrow();
  });
  it("uses copy and never sync/delete", () => {
    const a = copyArgs("source", path.join(process.cwd(), "backup"));
    expect(a[0]).toBe("copy");
    expect(a.join(" ")).not.toMatch(/\bsync\b|--delete/);
    expect(a).toContain("--create-empty-src-dirs");
  });
  it("constructs non-destructive verification", () => {
    const a = checkArgs("source", path.join(process.cwd(), "backup"));
    expect(a[0]).toBe("check");
    expect(a).toContain("--download");
  });
  it("accepts local destination forms", () => {
    expect(validateDestination(path.join(process.cwd(), "backup"))).toBeTruthy();
    if (process.platform === "win32") {
      expect(validateDestination("Z:\\Cornerstone Backup")).toMatch(/^Z:/i);
      expect(validateDestination("\\\\server\\share\\Cornerstone")).toMatch(/^\\\\server/);
    }
  });
});
describe("Drive paths and exports", () => {
  it("maps native formats", () => {
    expect(exportFor("application/vnd.google-apps.document")?.extension).toBe(".docx");
    expect(exportFor("application/vnd.google-apps.spreadsheet")?.extension).toBe(".xlsx");
    expect(exportFor("unknown")).toBeNull();
  });
  it("sanitizes and resolves collisions deterministically", () => {
    const used = new Set<string>();
    expect(safeSegment("../bad:name")).not.toContain("/");
    expect(
      deterministicName("Report", "application/vnd.google-apps.document", "abc123", used),
    ).toBe("Report.docx");
    expect(deterministicName("Report.docx", "application/octet-stream", "abc123", used)).toBe(
      "Report (abc123).docx",
    );
  });
  it("prevents traversal", () => {
    expect(isSafeRelative("folder/file")).toBe(true);
    expect(isSafeRelative("../secret")).toBe(false);
    expect(isSafeRelative("/absolute")).toBe(false);
  });
});
describe("progress and audit", () => {
  it("parses representative stats", () => {
    const p = parseProgress("Transferred: 1.500 GBytes / 3 GBytes, 50%, 10 MBytes/s, ETA 2m0s");
    expect(p.bytes).toBeGreaterThan(1_000_000_000);
    expect(p.eta).toBe("2m0s");
  });
  it("classifies shared files", () => {
    expect(
      classifyShared({
        owned: false,
        destinationAccess: false,
        canDownload: false,
        canCopy: false,
        canShare: false,
      }),
    ).toBe("download-prohibited");
    expect(
      classifyShared({
        owned: false,
        destinationAccess: true,
        canDownload: true,
        canCopy: true,
        canShare: false,
      }),
    ).toBe("destination-already-has-access");
  });
  it("aggregates verification conservatively", () => {
    expect(
      aggregateVerification({
        rcloneExitCode: 0,
        discrepancies: 0,
        failed: 0,
        unsupported: 1,
        samples: [],
      }).status,
    ).toBe("verified-with-limitations");
    expect(
      aggregateVerification({
        rcloneExitCode: 1,
        discrepancies: 1,
        failed: 0,
        unsupported: 0,
        samples: [],
      }).status,
    ).toBe("incomplete");
  });
});
