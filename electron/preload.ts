import { contextBridge, ipcRenderer } from "electron";
import type { LifeboatApi } from "../src/ipc";

const listen = (channel: string, fn: (p: any) => void) => {
  const handler = (_event: unknown, payload: any) => fn(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

const lifeboat: LifeboatApi = {
  dashboard: () => ipcRenderer.invoke("dashboard"),
  pickClient: () => ipcRenderer.invoke("pick-client"),
  connect: (role) => ipcRenderer.invoke("connect", role),
  disconnect: (role) => ipcRenderer.invoke("disconnect", role),
  saveSettings: (value) => ipcRenderer.invoke("save-settings", value),
  runInventory: () => ipcRenderer.invoke("run-inventory"),
  cancelInventory: () => ipcRenderer.invoke("cancel-inventory"),
  onInventoryProgress: (fn) => listen("inventory-progress", fn),
  exportReports: () => ipcRenderer.invoke("export-reports"),
  detectRclone: () => ipcRenderer.invoke("rclone-detect"),
  setDriveRemote: (remote) => ipcRenderer.invoke("drive-set-remote", remote),
  rcloneAbout: (remote) => ipcRenderer.invoke("rclone-about", remote),
  pickDriveDestination: () => ipcRenderer.invoke("drive-pick-destination"),
  testDriveDestination: (path) => ipcRenderer.invoke("drive-test-destination", path),
  discoverDrive: () => ipcRenderer.invoke("drive-discover"),
  drivePage: (offset = 0, limit = 100, shared = false) =>
    ipcRenderer.invoke("drive-page", offset, limit, shared),
  startDrive: (value) => ipcRenderer.invoke("drive-start", value),
  pauseDrive: () => ipcRenderer.invoke("drive-pause"),
  verifyDrive: (value) => ipcRenderer.invoke("drive-verify", value),
  onDriveProgress: (fn) => listen("drive-progress", fn),
  authorizeGmail: (feature) => ipcRenderer.invoke("gmail-authorize", feature),
  saveGmailConfig: (value) => ipcRenderer.invoke("gmail-save-config", value),
  pickGmailArchive: () => ipcRenderer.invoke("gmail-pick-archive"),
  discoverGmail: (value) => ipcRenderer.invoke("gmail-discover", value),
  startGmail: (value) => ipcRenderer.invoke("gmail-start", value),
  pauseGmail: () => ipcRenderer.invoke("gmail-pause"),
  gmailPage: (offset = 0, limit = 100) => ipcRenderer.invoke("gmail-page", offset, limit),
  forwardingAudit: () => ipcRenderer.invoke("gmail-forwarding-audit"),
  updateVacation: (value) => ipcRenderer.invoke("gmail-vacation", value),
  onGmailProgress: (fn) => listen("gmail-progress", fn),
  authorizeContacts:()=>ipcRenderer.invoke('contacts-authorize'),
  discoverContacts:(value)=>ipcRenderer.invoke('contacts-discover',value),
  startContacts:()=>ipcRenderer.invoke('contacts-start'),
  exportContacts:()=>ipcRenderer.invoke('contacts-export'),
  convertOtherContacts:()=>ipcRenderer.invoke('contacts-convert-other'),
  verifyContactsDestinationOnly:()=>ipcRenderer.invoke('contacts-verify-destination'),
  onContactsProgress:(fn)=>listen('contacts-progress',fn),
  authorizeCalendar:()=>ipcRenderer.invoke('calendar-authorize'),
  discoverCalendar:()=>ipcRenderer.invoke('calendar-discover'),
  startCalendar:()=>ipcRenderer.invoke('calendar-start'),
  exportCalendars:()=>ipcRenderer.invoke('calendar-export'),
  verifyCalendarDestinationOnly:()=>ipcRenderer.invoke('calendar-verify-destination'),
  onCalendarProgress:(fn)=>listen('calendar-progress',fn),
  scanTakeout:()=>ipcRenderer.invoke('takeout-scan'),
  onPreservationProgress:(fn)=>listen('preservation-progress',fn),
};

contextBridge.exposeInMainWorld("lifeboat", lifeboat);
