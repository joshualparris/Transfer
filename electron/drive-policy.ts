import path from "node:path";

export const NATIVE_EXPORTS: Record<string, { extension: string; mime: string; rclone: string }> = {
  "application/vnd.google-apps.document": {
    extension: ".docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    rclone: "docx",
  },
  "application/vnd.google-apps.spreadsheet": {
    extension: ".xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    rclone: "xlsx",
  },
  "application/vnd.google-apps.presentation": {
    extension: ".pptx",
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    rclone: "pptx",
  },
  "application/vnd.google-apps.drawing": {
    extension: ".pdf",
    mime: "application/pdf",
    rclone: "pdf",
  },
};
export function exportFor(mime: string) {
  return NATIVE_EXPORTS[mime] ?? null;
}
export function safeSegment(name: string) {
  const clean = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/, "")
    .trim();
  return clean && clean !== "." && clean !== ".." ? clean : "unnamed";
}
export function deterministicName(name: string, mime: string, sourceId: string, used: Set<string>) {
  const e = exportFor(mime);
  let candidate = safeSegment(name);
  if (e && !candidate.toLowerCase().endsWith(e.extension)) candidate += e.extension;
  const key = candidate.toLowerCase();
  if (!used.has(key)) {
    used.add(key);
    return candidate;
  }
  const parsed = path.parse(candidate),
    suffix = sourceId.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "copy";
  candidate = `${parsed.name} (${suffix})${parsed.ext}`;
  used.add(candidate.toLowerCase());
  return candidate;
}
export function isSafeRelative(p: string) {
  if (!p || path.isAbsolute(p)) return false;
  const normalized = p.replaceAll("\\", "/");
  return !normalized.split("/").some((x) => x === "..");
}
export type SharedClass =
  | "safely-backed-up"
  | "destination-already-has-access"
  | "can-likely-share"
  | "copy-no-ownership-transfer"
  | "external-owner-action-required"
  | "download-prohibited"
  | "inaccessible"
  | "unsupported-or-uncertain";
export function classifyShared(x: {
  owned: boolean;
  destinationAccess: boolean;
  canDownload: boolean;
  canCopy: boolean;
  canShare: boolean;
  inaccessible?: boolean;
}): SharedClass {
  if (x.inaccessible) return "inaccessible";
  if (x.owned) return "safely-backed-up";
  if (x.destinationAccess) return "destination-already-has-access";
  if (!x.canDownload) return "download-prohibited";
  if (x.canShare) return "can-likely-share";
  if (x.canCopy) return "copy-no-ownership-transfer";
  return "external-owner-action-required";
}
