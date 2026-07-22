import type { LifeboatApi } from "./ipc";
declare global {
  interface Window {
    lifeboat: LifeboatApi;
  }
}
export {};
