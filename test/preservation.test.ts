import { describe, expect, it } from "vitest";
import { findRclone } from "../electron/rclone";

describe("preservation tooling", () => {
  it("reports a valid rclone installation or a clean environment absence", () => {
    const found = findRclone();
    expect(found === null || /^rclone v/i.test(found.version)).toBe(true);
    if (found) expect(found.path.length).toBeGreaterThan(0);
  });
});
