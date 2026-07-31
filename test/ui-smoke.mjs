import { chromium } from "playwright";

const scopes = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/contacts.other.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
];

const dashboard = {
  settings: {
    deadline: "2026-08-14",
    dryRun: true,
    sourceEmail: "joshua.parris@cornerstone.edu.au",
    destinationEmail: "joshualparris@gmail.com",
    fallbackEmail: "joshparriscornerstone@gmail.com",
  },
  accounts: [
    {
      role: "source",
      email: "joshua.parris@cornerstone.edu.au",
      subject: "source-subject",
      scopes,
      connectedAt: new Date().toISOString(),
    },
    {
      role: "destination",
      email: "joshualparris@gmail.com",
      subject: "dest-subject",
      scopes: ["openid", "email"],
      connectedAt: new Date().toISOString(),
    },
  ],
  latestInventory: null,
  inventory: { running: false, progress: null, logs: [] },
  queue: {},
  drive: {
    config: { destination: "/tmp/lifeboat-backup" },
    rclone: null,
    stats: { discovered: 0, native: 0, shared: 0, verified: 0, failed: 0, bytes: 0 },
    jobs: [],
    running: false,
    progress: null,
  },
  gmail: {
    stats: { discovered: 0, copied: 0, verified: 0, failed: 0 },
    runs: [],
    running: false,
    progress: null,
    config: { method: "insert", query: "-in:spam -in:trash", includeDrafts: true },
  },
  contacts: {
    stats: {},
    running: false,
    progress: null,
    config: { otherPolicy: "archive" },
  },
  calendar: { stats: {}, running: false, progress: null },
  preservation: { running: false, progress: null, result: null },
  activity: { logs: [], diagnostics: [], modules: {} },
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (error) => consoleErrors.push(error.message));
await page.addInitScript((data) => {
  const off = () => {};
  window.lifeboat = {
    dashboard: async () => data,
    pickClient: async () => true,
    connect: async () => data,
    disconnect: async () => data,
    saveSettings: async () => data,
    authorizeInventory: async () => data,
    runInventory: async () => data,
    cancelInventory: async () => data,
    onInventoryProgress: () => off,
    exportReports: async () => null,
    detectRclone: async () => data,
    setDriveRemote: async () => data,
    rcloneAbout: async () => ({}),
    pickDriveDestination: async () => data,
    testDriveDestination: async () => data,
    discoverDrive: async () => data,
    drivePage: async () => [],
    startDrive: async () => data,
    pauseDrive: async () => data,
    verifyDrive: async () => data,
    onDriveProgress: () => off,
    authorizeGmail: async () => data,
    saveGmailConfig: async () => data,
    pickGmailArchive: async () => data,
    discoverGmail: async () => data,
    startGmail: async () => data,
    pauseGmail: async () => data,
    gmailPage: async () => [],
    forwardingAudit: async () => ({}),
    updateVacation: async () => ({}),
    onGmailProgress: () => off,
    authorizeContacts: async () => data,
    discoverContacts: async () => data,
    startContacts: async () => data,
    exportContacts: async () => null,
    convertOtherContacts: async () => data,
    verifyContactsDestinationOnly: async () => data,
    onContactsProgress: () => off,
    authorizeCalendar: async () => data,
    discoverCalendar: async () => data,
    startCalendar: async () => data,
    exportCalendars: async () => null,
    verifyCalendarDestinationOnly: async () => data,
    onCalendarProgress: () => off,
    scanTakeout: async () => data,
    importPhotosTakeout: async () => data,
    onPreservationProgress: () => off,
  };
}, dashboard);
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "Overview" }).waitFor();
await page.getByText("16 days remaining").waitFor();
await page.getByRole("button", { name: "Run inventory" }).waitFor();
await page.getByText("Source inventory access authorised").waitFor();
await page.getByRole("button", { name: "Inventory", exact: true }).click();
await page.getByRole("heading", { name: "Inventory" }).waitFor();
await page.getByRole("button", { name: "Re-authorise source inventory access" }).waitFor();
await page.getByRole("button", { name: "Account inventory" }).waitFor();
for (const name of [
  "Accounts",
  "Drive setup",
  "Gmail migration",
  "Contacts migration",
  "Calendar migration",
  "Photos + Keep",
  "Security",
]) {
  await page.getByRole("button", { name, exact: true }).click();
  await page.getByRole("heading", { name }).waitFor();
}
if (consoleErrors.length) {
  throw new Error(`Console errors:\n${consoleErrors.join("\n")}`);
}
await browser.close();
