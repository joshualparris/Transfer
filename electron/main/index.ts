import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { z } from 'zod';
import { LifeboatDatabase } from '../database';
import { authenticate, inventory, authFor } from '../google';
import { tokens } from '../keychain';
import { exportReports } from '../report';
import { validateAccountRoles } from '../security';
import type { AccountRole } from '../types';
let win:BrowserWindow|null=null,db:LifeboatDatabase,clientPath='';
const settingsSchema=z.object({deadline:z.string(),dryRun:z.boolean(),sourceEmail:z.string().email(),destinationEmail:z.string().email(),fallbackEmail:z.string().email()});
function dashboard(){return {settings:db.setting('settings',{deadline:'2026-08-03',dryRun:true,sourceEmail:'joshua.parris@cornerstone.edu.au',destinationEmail:'joshualparris@gmail.com',fallbackEmail:'joshparriscornerstone@gmail.com'}),accounts:db.accounts(),latestInventory:db.latestInventory(),queue:db.queueCounts()};}
function createWindow(){win=new BrowserWindow({width:1360,height:900,minWidth:980,minHeight:680,backgroundColor:'#f4f1e8',webPreferences:{preload:path.join(__dirname,'../preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});if(process.env.VITE_DEV_SERVER_URL)win.loadURL(process.env.VITE_DEV_SERVER_URL);else win.loadFile(path.join(__dirname,'../../dist/index.html'));}
app.whenReady().then(()=>{db=new LifeboatDatabase(path.join(app.getPath('userData'),'lifeboat.db'));createWindow();});app.on('window-all-closed',()=>{db?.close();if(process.platform!=='darwin')app.quit();});
ipcMain.handle('dashboard',()=>dashboard());
ipcMain.handle('pick-client',async()=>{const r=await dialog.showOpenDialog(win!,{title:'Select Google OAuth desktop client',properties:['openFile'],filters:[{name:'JSON',extensions:['json']}]});if(r.canceled)return false;clientPath=r.filePaths[0];db.setSetting('clientPath',clientPath);return true;});
ipcMain.handle('connect',async(_e,role:AccountRole)=>{if(!['source','destination'].includes(role))throw new Error('Invalid account role');const p=clientPath||db.setting('clientPath','');if(!p)throw new Error('Select client_secret.json first');const acct=await authenticate(role,p);const others=db.accounts().filter(a=>a.role!==role);const set=dashboard().settings;if(role==='source'&&others[0])validateAccountRoles(acct.email,others[0].email,[set.destinationEmail,set.fallbackEmail]);if(role==='destination'&&others[0])validateAccountRoles(others[0].email,acct.email,[set.destinationEmail,set.fallbackEmail]);db.saveAccount(acct);return dashboard();});
ipcMain.handle('disconnect',async(_e,role:AccountRole)=>{if(!['source','destination'].includes(role))throw new Error('Invalid account role');try{const auth=await authFor(role);if(auth.credentials.access_token)await auth.revokeToken(auth.credentials.access_token);}catch{}await tokens.remove(role);db.removeAccount(role);return dashboard();});
ipcMain.handle('save-settings',(_e,value)=>{const s=settingsSchema.parse(value);const accounts=db.accounts();const source=accounts.find(a=>a.role==='source'),dest=accounts.find(a=>a.role==='destination');if(source&&dest)validateAccountRoles(source.email,dest.email,[s.destinationEmail,s.fallbackEmail]);db.setSetting('settings',s);return dashboard();});
ipcMain.handle('run-inventory',async()=>{const source=db.accounts().find(a=>a.role==='source');if(!source)throw new Error('Connect the source account first');const snap=await inventory(source.email);db.saveInventory(snap);return dashboard();});
ipcMain.handle('export-reports',async()=>{const snap=db.latestInventory();if(!snap)throw new Error('Run an inventory first');const r=await dialog.showOpenDialog(win!,{title:'Choose report folder',properties:['openDirectory','createDirectory']});if(r.canceled)return null;return exportReports(r.filePaths[0],snap,db.exportRows());});
