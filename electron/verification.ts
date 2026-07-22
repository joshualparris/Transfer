import { open, stat } from "node:fs/promises";
import path from "node:path";
export type SampleResult = { path: string; valid: boolean; method: string; reason?: string };
export async function validateSample(
  file: string,
  expectedSize?: number | null,
): Promise<SampleResult> {
  try {
    const s = await stat(file);
    if (expectedSize === 0 && s.size === 0) return { path: file, valid: true, method: "zero-byte" };
    if (s.size === 0)
      return { path: file, valid: false, method: "size", reason: "Unexpected empty file" };
    const h = await open(file, "r");
    try {
      const b = Buffer.alloc(8);
      await h.read(b, 0, 8, 0);
      const ext = path.extname(file).toLowerCase();
      if (ext === ".pdf")
        return { path: file, valid: b.subarray(0, 5).toString() === "%PDF-", method: "PDF header" };
      if ([".docx", ".xlsx", ".pptx"].includes(ext))
        return {
          path: file,
          valid: b[0] === 0x50 && b[1] === 0x4b,
          method: "Office ZIP signature",
        };
      if ([".jpg", ".jpeg"].includes(ext))
        return { path: file, valid: b[0] === 0xff && b[1] === 0xd8, method: "JPEG signature" };
      if (ext === ".png")
        return {
          path: file,
          valid: b.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
          method: "PNG signature",
        };
      return { path: file, valid: true, method: "readable non-empty file" };
    } finally {
      await h.close();
    }
  } catch (e) {
    return {
      path: file,
      valid: false,
      method: "filesystem",
      reason: e instanceof Error ? e.message : "Unreadable",
    };
  }
}
export function aggregateVerification(x: {
  rcloneExitCode: number | null;
  discrepancies: number;
  failed: number;
  unsupported: number;
  samples: SampleResult[];
}) {
  const badSamples = x.samples.filter((s) => !s.valid).length;
  if (x.rcloneExitCode !== 0 || x.discrepancies > 0 || x.failed > 0 || badSamples > 0)
    return { status: "incomplete", badSamples, ...x };
  if (x.unsupported > 0) return { status: "verified-with-limitations", badSamples, ...x };
  return { status: "verified", badSamples, ...x };
}
