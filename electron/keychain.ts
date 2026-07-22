import keytar from "keytar";
import type { AccountRole } from "./types";
const SERVICE = "Cornerstone Lifeboat OAuth";
export const tokens = {
  set: (role: AccountRole, value: unknown) =>
    keytar.setPassword(SERVICE, role, JSON.stringify(value)),
  async get(role: AccountRole) {
    const v = await keytar.getPassword(SERVICE, role);
    return v ? JSON.parse(v) : null;
  },
  remove: (role: AccountRole) => keytar.deletePassword(SERVICE, role),
};
