import { app, BrowserWindow, dialog, ipcMain, session } from "electron";
import path from "node:path";
import { z } from "zod";
import { LifeboatDatabase } from "../database";
import { authenticate, inventory, authFor } from "../google";
import { tokens } from "../keychain";
import { exportReports } from "../report";
import { redact, validateAccountRoles } from "../security";
import {
  copyArgs,
  findRclone,
  listRemotes,
  parseProgress,
  RcloneProcess,
  remoteAbout,
  testDestination,
  validateDestination,
  validateRemote,
  checkArgs,
} from "../rclone";
import { discoverDrive, sharedAudit } from "../drive";
import type { AccountRole } from "../types";
import { aggregateVerification, validateSample } from "../verification";
import {
  authorizeFeature,
  GMAIL_COPY_SCOPES,
  GMAIL_SETTINGS_SCOPES,
  CONTACTS_COPY_SCOPES,
  CALENDAR_DESTINATION_SCOPES,
  assertGrantedScopes,
} from "../google";
import {
  contactStats,
  convertOtherContacts,
  exportContacts,
  inventoryContacts,
  runContacts,
  verifyContactsDestinationOnly,
} from "../contacts";
import {
  calendarStats,
  exportCalendars,
  inventoryCalendars,
  runCalendars,
  verifyCalendarsDestinationOnly,
} from "../calendar";
import { scanTakeout } from "../preservation";
import {
  discoverGmail,
  ensureLabels,
  forwardingAudit,
  GmailRunner,
  updateVacation,
  verifyGmailAggregate,
  cleanupArchiveTemps,
} from "../gmail";
let win: BrowserWindow | null = null,
  db: LifeboatDatabase,
  clientPath = "",
  activeJob: string | null = null,
  progress: any = {},
  inventoryProgress: any = {},
  inventoryLogs: any[] = [],
  inventoryRunning = false,
  inventoryCancelled = false,
  gmailProgress: any = {},
  gmailRun: string | null = null;
let contactsRunning = false,
  contactsProgress: any = {};
let calendarRunning = false,
  calendarProgress: any = {};
let preservationRunning = false,
  preservationProgress: any = {};
const runner = new RcloneProcess(),
  gmailRunner = new GmailRunner();
const settingsSchema = z.object({
  deadline: z.string(),
  dryRun: z.boolean(),
  sourceEmail: z.string().email(),
  destinationEmail: z.string().email(),
  fallbackEmail: z.string().email(),
});
const defaults = {
  deadline: "2026-07-24",
  dryRun: true,
  sourceEmail: "joshua.parris@cornerstone.edu.au",
  destinationEmail: "joshualparris@gmail.com",
  fallbackEmail: "joshparriscornerstone@gmail.com",
};
const activityClock = new Map<string, number>();
function recordActivity(module: string, value: any, level = "info") {
  const now = Date.now(),
    urgent = level !== "info" || value?.done || value?.error;
  if (!urgent && now - (activityClock.get(module) ?? 0) < 1000) return;
  activityClock.set(module, now);
  const message = String(value?.message ?? value?.operation ?? value?.current ?? "Working");
  db.activityLog(module, level, redact(message), {
    progress: redact(JSON.stringify(value ?? {})),
  });
}
function dashboard() {
  return {
    settings: db.setting("settings", defaults),
    accounts: db.accounts(),
    latestInventory: db.latestInventory(),
    inventory: {
      running: inventoryRunning,
      progress: inventoryProgress,
      logs: inventoryLogs.slice(-250),
    },
    queue: db.queueCounts(),
    drive: {
      config: db.setting("driveConfig", {}),
      rclone: db.setting("rcloneInfo", null),
      stats: db.driveStats(),
      jobs: db.jobs(),
      running: runner.running(),
      progress,
    },
    gmail: {
      config: db.setting("gmailConfig", {
        method: "insert",
        query: "-in:spam -in:trash",
        includeDrafts: true,
        archivePath: "",
      }),
      stats: db.gmailStats(),
      runs: db.gmailRuns(),
      running: !!gmailRun,
      progress: gmailProgress,
    },
    contacts: {
      stats: contactStats(db),
      running: contactsRunning,
      progress: contactsProgress,
      config: db.setting("contactsConfig", { otherPolicy: "archive" }),
    },
    calendar: {
      stats: calendarStats(db),
      running: calendarRunning,
      progress: calendarProgress,
    },
    preservation: {
      running: preservationRunning,
      progress: preservationProgress,
      result: db.setting("takeoutResult", null),
    },
    activity: {
      logs: db.activityLogs(1500),
      diagnostics: db.failureDiagnostics(),
      modules: {
        inventory: { running: inventoryRunning, progress: inventoryProgress },
        drive: { running: runner.running(), progress },
        gmail: { running: !!gmailRun, progress: gmailProgress },
        contacts: { running: contactsRunning, progress: contactsProgress },
        calendar: { running: calendarRunning, progress: calendarProgress },
        preservation: {
          running: preservationRunning,
          progress: preservationProgress,
        },
      },
    },
  };
}
function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#f4f1e8",
    webPreferences: {
      preload: path.join(__dirname, "../preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !!process.env.VITE_DEV_SERVER_URL,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, "../../../dist/index.html"));
}
app.whenReady().then(() => {
  db = new LifeboatDatabase(path.join(app.getPath("userData"), "lifeboat.db"));
  const savedSettings = db.setting("settings", defaults);
  if (savedSettings.deadline === "2026-08-03")
    db.setSetting("settings", { ...savedSettings, deadline: defaults.deadline });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  void cleanupArchiveTemps(db.setting<any>("gmailConfig", {}).archivePath ?? "");
  createWindow();
});
app.on("before-quit", () => {
  runner.pause();
  gmailRunner.pause();
});
app.on("window-all-closed", () => {
  db?.close();
  if (process.platform !== "darwin") app.quit();
});
ipcMain.handle("dashboard", () => dashboard());
ipcMain.handle("pick-client", async () => {
  const r = await dialog.showOpenDialog(win!, {
    title: "Select Google OAuth desktop client",
    properties: ["openFile"],
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (r.canceled) return false;
  clientPath = r.filePaths[0];
  db.setSetting("clientPath", clientPath);
  return true;
});
ipcMain.handle("connect", async (_e, role: AccountRole) => {
  if (!["source", "destination"].includes(role)) throw new Error("Invalid account role");
  const p = clientPath || db.setting("clientPath", "");
  if (!p) throw new Error("Select client_secret.json first");
  const acct = await authenticate(role, p),
    others = db.accounts().filter((a) => a.role !== role),
    set = dashboard().settings;
  if (role === "source" && others[0])
    validateAccountRoles(acct.email, others[0].email, [set.destinationEmail, set.fallbackEmail]);
  if (role === "destination" && others[0])
    validateAccountRoles(others[0].email, acct.email, [set.destinationEmail, set.fallbackEmail]);
  db.saveAccount(acct);
  return dashboard();
});
ipcMain.handle("disconnect", async (_e, role: AccountRole) => {
  if (!["source", "destination"].includes(role)) throw new Error("Invalid account role");
  try {
    const auth = await authFor(role);
    if (auth.credentials.access_token) await auth.revokeToken(auth.credentials.access_token);
  } catch {}
  await tokens.remove(role);
  db.removeAccount(role);
  return dashboard();
});
ipcMain.handle("save-settings", (_e, v) => {
  const s = settingsSchema.parse(v),
    a = db.accounts(),
    source = a.find((x) => x.role === "source"),
    dest = a.find((x) => x.role === "destination");
  if (source && dest)
    validateAccountRoles(source.email, dest.email, [s.destinationEmail, s.fallbackEmail]);
  db.setSetting("settings", s);
  return dashboard();
});
ipcMain.handle("run-inventory", async () => {
  const source = db.accounts().find((a) => a.role === "source");
  if (!source) throw new Error("Connect the source account first");
  if (inventoryRunning) throw new Error("Account inventory is already running");
  inventoryRunning = true;
  inventoryCancelled = false;
  inventoryLogs = [];
  inventoryProgress = { module: "inventory", message: "Starting" };
  try {
    const snap = await inventory(
      source.email,
      (event) => {
        const entry = { at: new Date().toISOString(), ...event };
        inventoryProgress = entry;
        inventoryLogs.push(entry);
        recordActivity(event.module ?? "inventory", entry, event.error ? "error" : "info");
        win?.webContents.send("inventory-progress", entry);
      },
      () => inventoryCancelled,
    );
    if (!inventoryCancelled) db.saveInventory(snap);
    return dashboard();
  } finally {
    inventoryRunning = false;
    const entry = {
      at: new Date().toISOString(),
      module: "inventory",
      message: inventoryCancelled ? "Cancelled" : "Inventory finished",
      done: true,
    };
    recordActivity("inventory", entry);
    win?.webContents.send("inventory-progress", entry);
  }
});
ipcMain.handle("cancel-inventory", () => {
  inventoryCancelled = true;
  return dashboard();
});
ipcMain.handle("export-reports", async () => {
  const snap = db.latestInventory();
  if (!snap) throw new Error("Run an inventory first");
  const r = await dialog.showOpenDialog(win!, {
    title: "Choose report folder",
    properties: ["openDirectory", "createDirectory"],
  });
  if (r.canceled) return null;
  return exportReports(r.filePaths[0], snap, db.exportRows(), {
    drive: dashboard().drive,
    manifest: db.phaseAll("SELECT * FROM drive_manifest ORDER BY relative_path"),
    shared: sharedAudit(
      db.phaseAll("SELECT * FROM drive_manifest WHERE shared=1 ORDER BY relative_path"),
      dashboard().settings.destinationEmail,
    ),
    gmail: dashboard().gmail,
    gmailManifest: db.phaseAll("SELECT * FROM gmail_messages ORDER BY created_at"),
    contacts: dashboard().contacts,
    contactsManifest: db.phaseAll(
      "SELECT source_type,status,verification_status,photo_present FROM contacts_manifest",
    ),
    calendar: dashboard().calendar,
    calendarManifest: db.phaseAll(
      "SELECT status,verification_status,recurrence_json FROM calendar_events_v2",
    ),
    preservation: dashboard().preservation,
  } as any);
});
ipcMain.handle("rclone-detect", async () => {
  let found = findRclone(db.setting("rclonePath", ""));
  if (!found) {
    const r = await dialog.showOpenDialog(win!, {
      title: "Select rclone executable",
      properties: ["openFile"],
    });
    if (r.canceled) return dashboard();
    found = findRclone(r.filePaths[0]);
  }
  if (!found) throw new Error("rclone was not found or did not pass “rclone version”");
  const info = { ...found, remotes: listRemotes(found.path) };
  db.setSetting("rclonePath", found.path);
  db.setSetting("rcloneInfo", info);
  return dashboard();
});
ipcMain.handle("rclone-about", (_e, remote: string) => {
  const info = db.setting<any>("rcloneInfo", null);
  if (!info) throw new Error("Detect rclone first");
  return remoteAbout(info.path, validateRemote(remote));
});
ipcMain.handle("drive-set-remote", (_e, remote: string) => {
  const info = db.setting<any>("rcloneInfo", null);
  if (!info?.remotes?.includes(remote)) throw new Error("Select a configured rclone remote");
  remoteAbout(info.path, remote);
  db.setSetting("driveConfig", { ...db.setting("driveConfig", {}), remote });
  return dashboard();
});
ipcMain.handle("drive-pick-destination", async () => {
  const r = await dialog.showOpenDialog(win!, {
    title: "Choose local or NAS backup destination",
    properties: ["openDirectory", "createDirectory"],
  });
  if (r.canceled) return dashboard();
  const tested = await testDestination(r.filePaths[0]);
  db.setSetting("driveConfig", {
    ...db.setting("driveConfig", {}),
    destination: tested.path,
    freeBytes: tested.freeBytes,
    totalBytes: tested.totalBytes,
  });
  return dashboard();
});
ipcMain.handle("drive-test-destination", async (_e, destination: string) => {
  const tested = await testDestination(destination);
  db.setSetting("driveConfig", {
    ...db.setting("driveConfig", {}),
    destination: tested.path,
    freeBytes: tested.freeBytes,
    totalBytes: tested.totalBytes,
  });
  return dashboard();
});
ipcMain.handle("drive-discover", async () => {
  const source = db.accounts().find((a) => a.role === "source");
  if (!source) throw new Error("Connect the source account first");
  await discoverDrive(db, false, (n) => {
    progress = { operation: "Discovering Drive", files: n };
    win?.webContents.send("drive-progress", progress);
  });
  return dashboard();
});
ipcMain.handle("drive-page", (_e, o = 0, l = 100, shared = false) =>
  shared
    ? sharedAudit(db.drivePage(o, l, true), dashboard().settings.destinationEmail)
    : db.drivePage(o, l, false),
);
ipcMain.handle("drive-start", async (_e, input: { remote: string; destination: string }) => {
  const source = db.accounts().find((a) => a.role === "source");
  if (!source) throw new Error("Connect source first");
  const info = db.setting<any>("rcloneInfo", null);
  if (!info) throw new Error("Detect rclone first");
  validateRemote(input.remote);
  const destination = validateDestination(input.destination);
  const remoteBinding = db.setting<any>("driveRemoteBinding", null);
  if (
    remoteBinding &&
    (remoteBinding.remote !== input.remote || remoteBinding.sourceSubject !== source.subject)
  )
    throw new Error(
      "This migration case is locked to a different rclone remote or Google source identity. Re-select the originally confirmed remote.",
    );
  const confirm = await dialog.showMessageBox(win!, {
    type: "warning",
    buttons: ["Cancel", "Start read-only source backup"],
    defaultId: 0,
    cancelId: 0,
    title: "Confirm Drive backup",
    message: `Copy from ${source.email} via ${input.remote}:`,
    detail: `Destination: ${destination}\n\nConfirm that ${input.remote}: is configured for ${source.email}. This remote name will be locked to the source account's stable Google identity. This uses rclone copy and never deletes source or destination files.`,
  });
  if (confirm.response !== 1) return dashboard();
  if (!source.subject) throw new Error("Reconnect source to record its stable Google identity");
  db.setSetting("driveRemoteBinding", {
    remote: input.remote,
    sourceSubject: source.subject,
    sourceEmail: source.email,
    confirmedAt: new Date().toISOString(),
  });
  const args = copyArgs(input.remote, destination),
    id = db.startJob({
      type: "drive_backup_copy",
      remote: input.remote,
      destination,
      rclonePath: info.path,
      version: info.version,
      args,
    });
  activeJob = id;
  progress = {
    bytes: 0,
    totalBytes: 0,
    files: 0,
    checks: 0,
    errors: 0,
    speed: "—",
    eta: "—",
    current: "Starting",
  };
  runner.start(info.path, args, {
    line(line) {
      progress = parseProgress(line, progress);
      db.log(id, line);
      db.updateJob(id, "running", progress);
      win?.webContents.send("drive-progress", progress);
    },
    exit(code, signal) {
      const paused = signal === "SIGTERM";
      db.updateJob(
        id,
        paused ? "paused" : code === 0 ? "complete" : "failed",
        progress,
        code === 0 ? undefined : `rclone exited ${code ?? signal}`,
      );
      activeJob = null;
      win?.webContents.send("drive-progress", progress);
    },
  });
  return dashboard();
});
ipcMain.handle("calendar-authorize", async () => {
  const p = clientPath || db.setting("clientPath", "");
  if (!p) throw new Error("Select client_secret.json first");
  const existing = db.accounts().find((a) => a.role === "destination");
  if (!existing) throw new Error("Connect destination first");
  const acct = await authorizeFeature("destination", p, CALENDAR_DESTINATION_SCOPES);
  if (acct.subject !== existing.subject || acct.email !== existing.email)
    throw new Error(`Authorised ${acct.email}, expected ${existing.email}`);
  db.saveAccount({
    ...acct,
    scopes: [...new Set([...existing.scopes, ...acct.scopes])],
  });
  return dashboard();
});
ipcMain.handle("calendar-discover", async () => {
  if (calendarRunning) throw new Error("Calendar work is already running");
  const { source, destination } = gmailAccounts();
  calendarRunning = true;
  recordActivity("calendar", { operation: "Starting Calendar inventory" });
  try {
    await inventoryCalendars(db, source.subject!, destination.subject!, (p) => {
      calendarProgress = p;
      recordActivity("calendar", p);
      win?.webContents.send("calendar-progress", p);
    });
    recordActivity("calendar", {
      operation: "Calendar inventory finished",
      done: true,
    });
    return dashboard();
  } catch (e) {
    recordActivity("calendar", { message: redact(e) }, "error");
    throw e;
  } finally {
    calendarRunning = false;
  }
});
ipcMain.handle("calendar-start", async () => {
  if (calendarRunning) throw new Error("Calendar work is already running");
  const { source, destination } = gmailAccounts();
  await assertGrantedScopes("destination", CALENDAR_DESTINATION_SCOPES);
  const confirm = await dialog.showMessageBox(win!, {
    type: "warning",
    buttons: ["Cancel", "Create destination calendars"],
    defaultId: 0,
    cancelId: 0,
    message: `Copy calendars ${source.email} → ${destination.email}`,
    detail:
      "New prefixed calendars and events will be created. Source calendars remain read-only. Nothing is deleted.",
  });
  if (confirm.response !== 1) return dashboard();
  calendarRunning = true;
  recordActivity("calendar", { operation: "Starting Calendar migration" });
  try {
    await runCalendars(db, source.subject!, destination.subject!, (p) => {
      calendarProgress = p;
      recordActivity("calendar", p);
      win?.webContents.send("calendar-progress", p);
    });
    recordActivity("calendar", {
      operation: "Calendar migration finished",
      done: true,
    });
    return dashboard();
  } catch (e) {
    recordActivity("calendar", { message: redact(e) }, "error");
    throw e;
  } finally {
    calendarRunning = false;
  }
});
ipcMain.handle("calendar-export", async () => {
  const r = await dialog.showOpenDialog(win!, {
    title: "Choose Calendar backup folder",
    properties: ["openDirectory", "createDirectory"],
  });
  if (r.canceled) return null;
  return exportCalendars(r.filePaths[0]);
});
ipcMain.handle("calendar-verify-destination", async () => {
  const { source, destination } = gmailAccounts();
  calendarProgress = {
    operation: "Destination-only Calendar verification",
    ...(await verifyCalendarsDestinationOnly(db, source.subject!, destination.subject!)),
  };
  return dashboard();
});
ipcMain.handle("takeout-scan", async () => {
  const source = await dialog.showOpenDialog(win!, {
    title: "Choose extracted Google Takeout folder",
    properties: ["openDirectory"],
  });
  if (source.canceled) return dashboard();
  const output = await dialog.showOpenDialog(win!, {
    title: "Choose a separate folder for checksum evidence",
    properties: ["openDirectory", "createDirectory"],
  });
  if (output.canceled) return dashboard();
  preservationRunning = true;
  recordActivity("preservation", {
    operation: "Starting Takeout checksum scan",
  });
  try {
    const result = await scanTakeout(source.filePaths[0], output.filePaths[0], (p) => {
      preservationProgress = p;
      recordActivity("preservation", p);
      win?.webContents.send("preservation-progress", p);
    });
    db.setSetting("takeoutResult", result);
    recordActivity("preservation", {
      operation: "Takeout checksum scan finished",
      ...result,
      done: true,
    });
    return dashboard();
  } catch (e) {
    recordActivity("preservation", { message: redact(e) }, "error");
    throw e;
  } finally {
    preservationRunning = false;
  }
});
ipcMain.handle("drive-pause", () => {
  if (!activeJob) return dashboard();
  runner.pause();
  return dashboard();
});
ipcMain.handle("drive-verify", async (_e, input: { remote: string; destination: string }) => {
  if (runner.running()) throw new Error("Pause or finish the backup before verification");
  const source = db.accounts().find((a) => a.role === "source"),
    binding = db.setting<any>("driveRemoteBinding", null);
  if (
    !source?.subject ||
    !binding ||
    binding.remote !== input.remote ||
    binding.sourceSubject !== source.subject
  )
    throw new Error(
      "Verify the same rclone remote that was locked to the connected source account",
    );
  const info = db.setting<any>("rcloneInfo", null);
  if (!info) throw new Error("Detect rclone first");
  const args = checkArgs(input.remote, input.destination),
    id = db.startJob({
      type: "drive_backup_verify",
      remote: input.remote,
      destination: input.destination,
      rclonePath: info.path,
      version: info.version,
      args,
    });
  activeJob = id;
  progress = { operation: "Verification", errors: 0 };
  db.beginDriveReconciliation();
  runner.start(info.path, args, {
    line(line) {
      db.log(id, line);
      const item = db.reconcileDriveCheckLine(line);
      if (item && ["+", "*", "!"].includes(item.symbol))
        progress.errors = (progress.errors ?? 0) + 1;
      if (item && !item.matched && item.symbol !== "-")
        progress.unmatched = (progress.unmatched ?? 0) + 1;
      progress.current = line.slice(0, 160);
      db.updateJob(id, "verifying", progress);
      win?.webContents.send("drive-progress", progress);
    },
    async exit(code) {
      const unreconciled = db.finishDriveReconciliation();
      const stats = db.driveStats(),
        all = db.drivePage(0, 100000) as any[],
        rows = all.filter((x) => !x.is_folder && x.relative_path).slice(0, 20),
        samples = await Promise.all(
          rows.map((x) =>
            validateSample(
              path.join(input.destination, "Cornerstone-Lifeboat", "drive", x.relative_path),
              x.size,
            ),
          ),
        ),
        unsupported = all.filter((x) => x.is_native && !x.export_extension).length,
        result = aggregateVerification({
          rcloneExitCode: code,
          discrepancies: progress.errors ?? 0,
          failed: (stats.failed ?? 0) + unreconciled,
          unsupported,
          samples,
        });
      db.updateJob(
        id,
        result.status,
        progress,
        result.status === "verified"
          ? undefined
          : "Verification has discrepancies or documented limitations",
        {
          ...result,
          unreconciled,
          manifest: stats,
          limitations: [
            "Google-native exports cannot match source checksums",
            "Shared externally-owned items may become inaccessible",
          ],
        },
      );
      activeJob = null;
    },
  });
  return dashboard();
});
const gmailConfigSchema = z.object({
  query: z.string().max(500),
  method: z.enum(["insert", "import"]),
  includeDrafts: z.boolean(),
  archivePath: z.string().max(1000).optional(),
});
function gmailAccounts() {
  const a = db.accounts(),
    source = a.find((x) => x.role === "source"),
    destination = a.find((x) => x.role === "destination");
  if (!source?.subject || !destination?.subject)
    throw new Error("Reconnect both Google accounts to verify their stable identities");
  validateAccountRoles(source.email, destination.email, [
    dashboard().settings.destinationEmail,
    dashboard().settings.fallbackEmail,
  ]);
  if (source.subject === destination.subject)
    throw new Error("Source and destination are the same underlying Google account");
  return { source, destination };
}
ipcMain.handle("contacts-authorize", async () => {
  const p = clientPath || db.setting("clientPath", "");
  if (!p) throw new Error("Select client_secret.json first");
  const existing = db.accounts().find((a) => a.role === "destination");
  if (!existing) throw new Error("Connect destination first");
  const acct = await authorizeFeature("destination", p, CONTACTS_COPY_SCOPES);
  if (acct.subject !== existing.subject || acct.email !== existing.email)
    throw new Error(`Authorised ${acct.email}, expected ${existing.email}`);
  db.saveAccount({
    ...acct,
    scopes: [...new Set([...existing.scopes, ...acct.scopes])],
  });
  return dashboard();
});
ipcMain.handle("contacts-discover", async (_e, input: { otherPolicy: string }) => {
  if (contactsRunning) throw new Error("Contacts work is already running");
  const { source, destination } = gmailAccounts();
  contactsRunning = true;
  db.setSetting("contactsConfig", { otherPolicy: input.otherPolicy });
  recordActivity("contacts", { operation: "Starting Contacts inventory" });
  try {
    await inventoryContacts(
      db,
      {
        sourceSubject: source.subject!,
        sourceEmail: source.email,
        destinationSubject: destination.subject!,
        destinationEmail: destination.email,
        otherPolicy: input.otherPolicy,
      },
      (p) => {
        contactsProgress = p;
        recordActivity("contacts", p);
        win?.webContents.send("contacts-progress", p);
      },
    );
    recordActivity("contacts", {
      operation: "Contacts inventory finished",
      done: true,
    });
    return dashboard();
  } catch (e) {
    recordActivity("contacts", { message: redact(e) }, "error");
    throw e;
  } finally {
    contactsRunning = false;
    win?.webContents.send("contacts-progress", contactsProgress);
  }
});
ipcMain.handle("contacts-start", async () => {
  if (contactsRunning) throw new Error("Contacts work is already running");
  const { source, destination } = gmailAccounts();
  if (!destination.scopes.includes("https://www.googleapis.com/auth/contacts"))
    throw new Error("Authorise destination Contacts access first");
  const count = contactStats(db).discovered ?? 0,
    confirm = await dialog.showMessageBox(win!, {
      type: "warning",
      buttons: ["Cancel", "Create destination contacts"],
      defaultId: 0,
      cancelId: 0,
      title: "Confirm Contacts migration",
      message: `Copy ${source.email} → ${destination.email}`,
      detail: `Selected personal contacts: ${count}\nSource remains read-only. Existing destination contacts are never merged or deleted. Ambiguous matches require review.`,
    });
  if (confirm.response !== 1) return dashboard();
  contactsRunning = true;
  recordActivity("contacts", { operation: "Starting Contacts migration" });
  try {
    await runContacts(db, source.subject!, destination.subject!, (p) => {
      contactsProgress = p;
      recordActivity("contacts", p);
      win?.webContents.send("contacts-progress", p);
    });
    recordActivity("contacts", {
      operation: "Contacts migration finished",
      done: true,
    });
    return dashboard();
  } catch (e) {
    recordActivity("contacts", { message: redact(e) }, "error");
    throw e;
  } finally {
    contactsRunning = false;
    win?.webContents.send("contacts-progress", contactsProgress);
  }
});
ipcMain.handle("contacts-export", async () => {
  const r = await dialog.showOpenDialog(win!, {
    title: "Choose Contacts backup folder",
    properties: ["openDirectory", "createDirectory"],
  });
  if (r.canceled) return null;
  return exportContacts(r.filePaths[0]);
});
ipcMain.handle("contacts-convert-other", async () => {
  const { source, destination } = gmailAccounts();
  if (!destination.scopes.includes("https://www.googleapis.com/auth/contacts"))
    throw new Error("Authorise destination Contacts access first");
  const confirm = await dialog.showMessageBox(win!, {
    type: "warning",
    buttons: ["Cancel", "Convert archived Other Contacts"],
    defaultId: 0,
    cancelId: 0,
    message: `Convert Other Contacts to ordinary contacts in ${destination.email}`,
    detail:
      "This is a conversion, not exact preservation. Existing or ambiguous matches will be skipped for review. Source Other Contacts are not changed.",
  });
  if (confirm.response !== 1) return dashboard();
  contactsRunning = true;
  try {
    await convertOtherContacts(db, source.subject!, destination.subject!, (p) => {
      contactsProgress = p;
      win?.webContents.send("contacts-progress", p);
    });
    return dashboard();
  } finally {
    contactsRunning = false;
  }
});
ipcMain.handle("contacts-verify-destination", async () => {
  const { source, destination } = gmailAccounts();
  contactsProgress = { operation: "Destination-only Contacts verification" };
  const result = await verifyContactsDestinationOnly(db, source.subject!, destination.subject!);
  contactsProgress = { ...contactsProgress, ...result };
  return dashboard();
});
ipcMain.handle("gmail-authorize", async (_e, feature: "copy" | "settings") => {
  const role = feature === "copy" ? "destination" : "source",
    p = clientPath || db.setting("clientPath", "");
  if (!p) throw new Error("Select client_secret.json first");
  const acct = await authorizeFeature(
      role,
      p,
      feature === "copy" ? GMAIL_COPY_SCOPES : GMAIL_SETTINGS_SCOPES,
    ),
    existing = db.accounts().find((a) => a.role === role),
    set = dashboard().settings;
  if (existing && acct.email !== existing.email)
    throw new Error(`Authorised ${acct.email}, expected ${existing.email}`);
  if (role === "destination")
    validateAccountRoles(db.accounts().find((a) => a.role === "source")?.email ?? "", acct.email, [
      set.destinationEmail,
      set.fallbackEmail,
    ]);
  db.saveAccount({
    ...acct,
    scopes: [...new Set([...(existing?.scopes ?? []), ...acct.scopes])],
  });
  if (feature === "copy") {
    const source = db.accounts().find((a) => a.role === "source");
    if (source?.subject && acct.subject) {
      const requeued = db.retryGmailPermissionFailures(source.subject, acct.subject);
      recordActivity("gmail", { operation: "Gmail permission repaired", requeued });
    }
  }
  return dashboard();
});
ipcMain.handle("gmail-pick-archive", async () => {
  const r = await dialog.showOpenDialog(win!, {
    title: "Choose protected raw-email archive folder",
    properties: ["openDirectory", "createDirectory"],
  });
  if (r.canceled) return dashboard();
  const cfg = { ...dashboard().gmail.config, archivePath: r.filePaths[0] };
  db.setSetting("gmailConfig", cfg);
  return dashboard();
});
ipcMain.handle("gmail-save-config", (_e, v) => {
  const cfg = gmailConfigSchema.parse(v);
  db.setSetting("gmailConfig", cfg);
  return dashboard();
});
ipcMain.handle("gmail-page", (_e, o = 0, l = 100) => db.gmailPage(o, l));
ipcMain.handle("gmail-discover", async (_e, v) => {
  if (gmailRun) throw new Error("Gmail work is already running");
  const cfg = gmailConfigSchema.parse(v),
    { source, destination } = gmailAccounts(),
    id = db.startGmailRun({
      sourceSubject: source.subject!,
      sourceEmail: source.email,
      destinationSubject: destination.subject!,
      destinationEmail: destination.email,
      query: cfg.query,
      method: cfg.method,
      includeDrafts: cfg.includeDrafts,
      archivePath: cfg.archivePath,
    });
  gmailRun = id;
  try {
    const result = await discoverGmail(
      db,
      {
        runId: id,
        sourceSubject: source.subject!,
        destinationSubject: destination.subject!,
        query: cfg.query,
        includeDrafts: cfg.includeDrafts,
        method: cfg.method,
      },
      (p) => {
        gmailProgress = p;
        db.updateGmailRun(id, "running", p);
        recordActivity("gmail", p);
        win?.webContents.send("gmail-progress", p);
      },
    );
    db.updateGmailRun(id, "complete", { ...result, dryRun: true });
    db.setSetting("gmailConfig", cfg);
  } catch (e) {
    recordActivity("gmail", { message: redact(e) }, "error");
    db.updateGmailRun(id, "failed", gmailProgress, e instanceof Error ? e.message : String(e));
    throw e;
  } finally {
    gmailRun = null;
  }
  return dashboard();
});
ipcMain.handle("gmail-start", async (_e, v) => {
  if (gmailRun) throw new Error("Gmail work is already running");
  const cfg = gmailConfigSchema.parse(v),
    { source, destination } = gmailAccounts();
  await assertGrantedScopes("destination", GMAIL_COPY_SCOPES);
  const confirm = await dialog.showMessageBox(win!, {
    type: "warning",
    buttons: ["Cancel", "Start Gmail migration"],
    defaultId: 0,
    cancelId: 0,
    title: "Confirm Gmail migration",
    message: `Copy ${source.email} → ${destination.email}`,
    detail: `Method: ${cfg.method}\nQuery: ${cfg.query || "(full mailbox)"}\nDrafts: ${cfg.includeDrafts ? "included, never sent" : "excluded"}\n\nNo source messages will be modified.`,
  });
  if (confirm.response !== 1) return dashboard();
  const id = db.startGmailRun({
    sourceSubject: source.subject!,
    sourceEmail: source.email,
    destinationSubject: destination.subject!,
    destinationEmail: destination.email,
    query: cfg.query,
    method: cfg.method,
    includeDrafts: cfg.includeDrafts,
    archivePath: cfg.archivePath,
  });
  gmailRun = id;
  void (async () => {
    try {
      await discoverGmail(
        db,
        {
          runId: id,
          sourceSubject: source.subject!,
          destinationSubject: destination.subject!,
          query: cfg.query,
          includeDrafts: cfg.includeDrafts,
          method: cfg.method,
        },
        (p) => {
          gmailProgress = p;
          recordActivity("gmail", p);
          win?.webContents.send("gmail-progress", p);
        },
      );
      const selected = db.gmailRunSelectedCount(id);
      if (!selected) {
        db.updateGmailRun(id, "complete", { selected: 0 });
        return;
      }
      const exactConfirm = await dialog.showMessageBox(win!, {
        type: "warning",
        buttons: ["Cancel", `Copy ${selected.toLocaleString()} selected items`],
        defaultId: 0,
        cancelId: 0,
        title: "Confirm exact Gmail selection",
        message: `${selected.toLocaleString()} unfinished messages and drafts match this run`,
        detail: `Only items attached to run ${id.slice(0, 8)} will be processed. Method: ${cfg.method}. Previously discovered items outside this run are excluded.`,
      });
      if (exactConfirm.response !== 1) {
        db.updateGmailRun(id, "cancelled", { selected });
        return;
      }
      await ensureLabels(db, source.subject!, destination.subject!);
      const result = await gmailRunner.run(
        db,
        id,
        source.subject!,
        destination.subject!,
        cfg.archivePath,
        (p) => {
          gmailProgress = p;
          db.updateGmailRun(id, "running", p);
          recordActivity("gmail", p);
          win?.webContents.send("gmail-progress", p);
        },
      );
      if (result.paused) db.updateGmailRun(id, "paused", result.stats);
      else {
        const verification = await verifyGmailAggregate(db, source.subject!, destination.subject!);
        db.updateGmailRun(id, verification.status, {
          ...result.stats,
          verification,
        });
      }
    } catch (e) {
      recordActivity("gmail", { message: redact(e) }, "error");
      db.updateGmailRun(id, "failed", gmailProgress, e instanceof Error ? e.message : String(e));
    } finally {
      gmailRun = null;
      win?.webContents.send("gmail-progress", gmailProgress);
    }
  })();
  return dashboard();
});
ipcMain.handle("gmail-pause", () => {
  gmailRunner.pause();
  return dashboard();
});
ipcMain.handle("gmail-forwarding-audit", async () => {
  const result = await forwardingAudit();
  db.gmailLog(db.gmailRuns()[0]?.id ?? "settings", "forwarding-audit", {
    enabled: result.autoForwarding.enabled,
    creationSupported: false,
  });
  return result;
});
ipcMain.handle("gmail-vacation", async (_e, input: { subject: string; body: string }) => {
  const { source, destination } = gmailAccounts();
  if ((db.gmailStats().verified ?? 0) < 1)
    throw new Error("Review at least one verified migrated message first");
  const confirm = await dialog.showMessageBox(win!, {
    type: "warning",
    buttons: ["Cancel", "Enable vacation responder"],
    defaultId: 0,
    cancelId: 0,
    message: `Change source Gmail settings for ${source.email}`,
    detail: `Auto-reply will direct people to ${destination.email}. This is a source-account write and does not enable forwarding.`,
  });
  if (confirm.response !== 1) return null;
  const result = await updateVacation(destination.email, input.subject, input.body);
  db.gmailLog(db.gmailRuns()[0]?.id ?? "settings", "vacation-responder-enabled", {
    source: source.email,
    destination: destination.email,
  });
  return result;
});
