import type { DashboardData } from '../electron/types';
declare global { interface Window { lifeboat:{dashboard:()=>Promise<DashboardData>;pickClient:()=>Promise<boolean>;connect:(r:'source'|'destination')=>Promise<DashboardData>;disconnect:(r:'source'|'destination')=>Promise<DashboardData>;saveSettings:(v:unknown)=>Promise<DashboardData>;runInventory:()=>Promise<DashboardData>;exportReports:()=>Promise<string|null>} } }
export {};
