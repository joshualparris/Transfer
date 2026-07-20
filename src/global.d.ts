import type { DashboardData } from "../electron/types";
declare global {
  interface Window {
    lifeboat: {
      dashboard: () => Promise<DashboardData>;
      pickClient: () => Promise<boolean>;
      connect: (r: "source" | "destination") => Promise<DashboardData>;
      disconnect: (r: "source" | "destination") => Promise<DashboardData>;
      saveSettings: (v: unknown) => Promise<DashboardData>;
      runInventory: () => Promise<DashboardData>;
      exportReports: () => Promise<string | null>;
      detectRclone: () => Promise<DashboardData>;
      setDriveRemote: (r: string) => Promise<DashboardData>;
      rcloneAbout: (r: string) => Promise<any>;
      pickDriveDestination: () => Promise<DashboardData>;
      testDriveDestination: (p: string) => Promise<DashboardData>;
      discoverDrive: () => Promise<DashboardData>;
      drivePage: (o?: number, l?: number, s?: boolean) => Promise<any[]>;
      startDrive: (v: unknown) => Promise<DashboardData>;
      pauseDrive: () => Promise<DashboardData>;
      verifyDrive: (v: unknown) => Promise<DashboardData>;
      onDriveProgress: (fn: (p: any) => void) => () => void;
      authorizeGmail: (feature: "copy" | "settings") => Promise<DashboardData>;
      saveGmailConfig: (v: unknown) => Promise<DashboardData>;
      pickGmailArchive: () => Promise<DashboardData>;
      discoverGmail: (v: unknown) => Promise<DashboardData>;
      startGmail: (v: unknown) => Promise<DashboardData>;
      pauseGmail: () => Promise<DashboardData>;
      gmailPage: (o?: number, l?: number) => Promise<any[]>;
      forwardingAudit: () => Promise<any>;
      updateVacation: (v: unknown) => Promise<any>;
      onGmailProgress: (fn: (p: any) => void) => () => void;
    };
  }
}
export {};
