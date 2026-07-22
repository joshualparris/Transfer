import type { DashboardData } from "../electron/types";

export type GmailMethod = "insert" | "import";

export interface GmailConfig {
  query: string;
  method: GmailMethod;
  includeDrafts: boolean;
  archivePath?: string;
}

export interface DriveConfig {
  remote: string;
  destination: string;
}

export interface LifeboatApi {
  dashboard: () => Promise<DashboardData>;
  pickClient: () => Promise<boolean>;
  connect: (role: "source" | "destination") => Promise<DashboardData>;
  disconnect: (role: "source" | "destination") => Promise<DashboardData>;
  saveSettings: (value: unknown) => Promise<DashboardData>;
  runInventory: () => Promise<DashboardData>;
  cancelInventory: () => Promise<DashboardData>;
  onInventoryProgress: (fn: (progress: any) => void) => () => void;
  exportReports: () => Promise<string | null>;
  detectRclone: () => Promise<DashboardData>;
  setDriveRemote: (remote: string) => Promise<DashboardData>;
  rcloneAbout: (remote: string) => Promise<any>;
  pickDriveDestination: () => Promise<DashboardData>;
  testDriveDestination: (path: string) => Promise<DashboardData>;
  discoverDrive: () => Promise<DashboardData>;
  drivePage: (offset?: number, limit?: number, shared?: boolean) => Promise<any[]>;
  startDrive: (value: DriveConfig) => Promise<DashboardData>;
  pauseDrive: () => Promise<DashboardData>;
  verifyDrive: (value: DriveConfig) => Promise<DashboardData>;
  onDriveProgress: (fn: (progress: any) => void) => () => void;
  authorizeGmail: (feature: "copy" | "settings") => Promise<DashboardData>;
  saveGmailConfig: (value: GmailConfig) => Promise<DashboardData>;
  pickGmailArchive: () => Promise<DashboardData>;
  discoverGmail: (value: GmailConfig) => Promise<DashboardData>;
  startGmail: (value: GmailConfig) => Promise<DashboardData>;
  pauseGmail: () => Promise<DashboardData>;
  gmailPage: (offset?: number, limit?: number) => Promise<any[]>;
  forwardingAudit: () => Promise<any>;
  updateVacation: (value: { subject: string; body: string }) => Promise<any>;
  onGmailProgress: (fn: (progress: any) => void) => () => void;
  authorizeContacts: () => Promise<DashboardData>;
  discoverContacts: (value:{otherPolicy:string}) => Promise<DashboardData>;
  startContacts: () => Promise<DashboardData>;
  exportContacts: () => Promise<string|null>;
  convertOtherContacts:()=>Promise<DashboardData>;
  verifyContactsDestinationOnly:()=>Promise<DashboardData>;
  onContactsProgress: (fn:(progress:any)=>void)=>()=>void;
  authorizeCalendar:()=>Promise<DashboardData>;
  discoverCalendar:()=>Promise<DashboardData>;
  startCalendar:()=>Promise<DashboardData>;
  exportCalendars:()=>Promise<string[]|null>;
  verifyCalendarDestinationOnly:()=>Promise<DashboardData>;
  onCalendarProgress:(fn:(progress:any)=>void)=>()=>void;
}
