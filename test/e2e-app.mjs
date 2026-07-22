import { _electron as electron } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd(),exe=path.join(root,'node_modules','electron','dist','electron.exe'),out=path.join(root,'test-results');
await mkdir(out,{recursive:true});
const launchEnv={...process.env};delete launchEnv.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:exe,args:['.'],cwd:root,env:launchEnv});
try{
  const page=await app.firstWindow(),errors=[];
  page.on('console',m=>{if(m.type()==='error')errors.push(`console: ${m.text()}`)});
  page.on('pageerror',e=>errors.push(`page: ${e.message}`));
  await page.waitForSelector('text=Cornerstone',{timeout:30_000});
  const dashboard=await page.evaluate(()=>window.lifeboat.dashboard());
  assert.equal(dashboard.accounts.length,2,'source and destination must be connected');
  assert.notEqual(dashboard.accounts[0].subject,dashboard.accounts[1].subject,'stable account IDs must differ');
  const expected=['Overview','Accounts','Inventory','Drive setup','Backup','Shared items','Verification','Gmail migration','Contacts migration','Security','Final report'];
  for(const name of expected){console.log(`screen: ${name}`);const nav=page.getByRole('button',{name,exact:true});await nav.evaluate(el=>el.click());await page.waitForTimeout(250);const h1=page.locator('main h1'),title=await h1.count()?await h1.textContent():null;if(title?.trim()!==name)throw new Error(`Navigation to ${name} failed; still on ${title}; renderer errors: ${errors.join(' | ')}`);await page.screenshot({path:path.join(out,`${name.toLowerCase().replaceAll(' ','-')}.png`),fullPage:false});}
  await page.getByRole('button',{name:'Inventory',exact:true}).click();
  if(process.env.LIFEBOAT_LIVE==='1'&&!dashboard.latestInventory){
    await page.getByRole('button',{name:'Account inventory',exact:true}).click();
    await page.waitForFunction(()=>!document.body.innerText.includes('Inventory running'),null,{timeout:30*60_000});
    const after=await page.evaluate(()=>window.lifeboat.dashboard());
    assert(after.latestInventory,'live inventory did not persist a snapshot');
    assert(after.inventory.logs.some(x=>x.done),'live inventory did not produce completion logs');
  }
  await page.getByRole('button',{name:'Gmail migration',exact:true}).click();
  assert(await page.getByText(/Source access is read-only/).count());
  assert(await page.getByText(/never sends migrated drafts/i).count());
  const gmail=await page.evaluate(()=>window.lifeboat.dashboard());
  if(process.env.LIFEBOAT_LIVE==='1'){
    await page.evaluate(async()=>window.lifeboat.discoverGmail({query:'newer_than:1d -in:spam -in:trash',method:'insert',includeDrafts:false,archivePath:''}));
    const discovered=await page.evaluate(()=>window.lifeboat.dashboard());
    assert(discovered.gmail.runs.length>gmail.gmail.runs.length,'Gmail dry run did not persist a run');
  }
  await page.getByRole('button',{name:'Security',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:/Revoke|remove/i}).count()>0,true,'security controls missing');
  assert.deepEqual(errors,[],`renderer errors:\n${errors.join('\n')}`);
  console.log(JSON.stringify({ok:true,live:process.env.LIFEBOAT_LIVE==='1',screens:expected.length,inventory:!!dashboard.latestInventory,gmailRuns:dashboard.gmail.runs.length},null,2));
}finally{await app.close()}
