// Run: node --test tests/save-system.test.cjs (requires Playwright and Chromium).
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
let server, browser, origin;
before(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(fs.readFileSync(path.join(__dirname, '../index.html')));
    } else { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless:true, args:['--no-sandbox']});
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});
async function run(fn, init) {
  const context = await browser.newContext({viewport:{width:1600,height:1000}, acceptDownloads:true});
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.goto(origin);
  await page.evaluate(() => { gameState = 'village'; });
  try { await fn(page); assert.deepEqual(errors, [], 'No unhandled page errors'); }
  finally { await context.close(); }
}

test('current save roundtrip preserves equipment, quantities, quests, dungeon and awakening', () => run(async page => {
  const result = await page.evaluate(() => {
    const data = getSaveData();
    data.level=45; data.gold=12345;
    data.equipped.sword='sword_iron'; data.equipped.bow='bow_wood'; data.activeWeaponSlot='bow';
    data.inventory[0]='staff_apprentice'; data.hotbar[0]={id:potionItems[0].id,count:64}; data.lockedSlots={0:true};
    data.activeQuests.q_slime_novice={status:'completed',progress:5};
    data.dungeonProgress.slime={progress:[25,3,5400],bossDefeated:true,eliteTimer:120};
    data.awakenState.sword={stage:'quest',mats:2,demonKills:0,bosses:{slime:true,wolf:false,zombie:false,ghost:false}};
    const prepared=normalizeSaveData(data);
    writeSaveRecord(1,'manual',data); doLoadSlot(1);
    const loaded=getSaveData();
    return {prepared,loaded};
  });
  for (const key of ['level','gold','equipped','inventory','hotbar','lockedSlots','activeQuests','dungeonProgress','awakenState','activeWeaponSlot']) {
    assert.deepEqual(result.loaded[key], result.prepared[key], key);
  }
}));

test('legacy versions migrate without editing their source, and omitted progress resets', () => run(async page => {
  assert.deepEqual(await page.evaluate(() => {
    const old=getSaveData(); delete old.version; delete old.hotbar; delete old.awakenState;
    delete old.skills.learnedSword; old.skills.learned=true;
    old.equipped={weapon:'bow_wood'}; delete old.activeWeaponSlot;
    old.inventory=['sword_iron']; old.dungeonProgress={slime:{kills:[12,50,99],bossDefeated:true}};
    const original=JSON.stringify(old), data=normalizeSaveData(old);
    dungeonProgress.wolf.progress=[25,3,5400]; applySaveData(data);
    return {unchanged:JSON.stringify(old)===original,version:data.version,progress:data.dungeonProgress.slime.progress,
      bow:equipped.bow.id,swordLearned:skills.learnedSword,bag:inventory.length,bar:hotbar.length,wolf:dungeonProgress.wolf.progress};
  }), {unchanged:true,version:3,progress:[12,0,0],bow:'bow_wood',swordLearned:true,bag:27,bar:9,wolf:[0,0,0]});
}));

test('invalid data and future versions cannot mutate current play or storage', () => run(async page => {
  const result=await page.evaluate(() => {
    const base=getSaveData(); writeSaveRecord(1,'manual',base);
    const before=JSON.stringify(getSaveData(), (key,value)=>key==='savedAt'?0:value), stored=localStorage.getItem(saveKey(1));
    const cases=[null,{},[], {...base,version:999}, {...base,level:'1'}, {...base,gold:-1}, {...base,hp:Infinity},
      {...base,player:{x:900,y:500}}, {...base,equipped:{sword:'missing'}}, {...base,equipped:{sword:'bow_wood'}},
      {...base,inventory:[{id:'sword_iron',count:2}]}, {...base,hotbar:[{id:potionItems[0].id,count:65}]},
      {...base,activeQuests:{fake:{status:'accepted',progress:0}}}, {...base,awakenState:{sword:{stage:'fake'}}},
      {...base,skills:{learnedSword:'yes'}}, {...base,dungeonProgress:{slime:{progress:[1,'2',3]}}},
      {...base,inventory:undefined}, {...base,inventory:[]}, {...base,skills:{}}, {...base,awakenState:{}}];
    const rejected=cases.map(data=>{try {applySaveData(data); return false;}catch {return true;}});
    return {allRejected:rejected.every(Boolean),count:rejected.length,playUnchanged:JSON.stringify(getSaveData(),(key,value)=>key==='savedAt'?0:value)===before,
      storageUnchanged:localStorage.getItem(saveKey(1))===stored};
  });
  assert.deepEqual(result,{allRejected:true,count:20,playUnchanged:true,storageUnchanged:true});
}));

test('manual and auto saves are separate, each retaining its own last good backup', () => run(async page => {
  assert.deepEqual(await page.evaluate(() => {
    gold=100; saveToSlot(1,false); gold=200; saveToSlot(1,false);
    gold=300; saveToSlot(1,true); gold=400; saveToSlot(1,true);
    return Object.fromEntries(SAVE_SOURCES.map(source=>[source,loadSlotData(1,source).gold]));
  }), {manual:200,auto:400,backup:100,autoBackup:300});
}));

test('corrupt, empty and unavailable slots are distinct; corrupt writes preserve good backups', () => run(async page => {
  assert.deepEqual(await page.evaluate(() => {
    saveToSlot(1,false); gold=200; saveToSlot(1,false);
    localStorage.setItem(saveKey(1),'{broken');
    const status=readSaveRecord(1).status;
    const backup=localStorage.getItem(saveKey(1,'backup'));
    gold=300; saveToSlot(1,false);
    localStorage.setItem(saveKey(2),'{}');
    renderSaveSlots('load');
    const message=document.querySelector('#save-slots-container').textContent.includes('손상');
    const get=Storage.prototype.getItem;
    Storage.prototype.getItem=function(){throw new DOMException('Denied','SecurityError')};
    const denied=readSaveRecord(1).status;
    Storage.prototype.getItem=get;
    return {status,empty:readSaveRecord(3).status,denied,message,backupPreserved:backup===localStorage.getItem(saveKey(1,'backup'))};
  }), {status:'corrupt',empty:'empty',denied:'unavailable',message:true,backupPreserved:true});
}));

test('quota and security failures keep original saves and active slot; failure UI is truthful', () => run(async page => {
  assert.deepEqual(await page.evaluate(() => {
    saveToSlot(1,false); saveToSlot(2,false);
    const previous=localStorage.getItem(saveKey(2)), set=Storage.prototype.setItem;
    Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError')};
    const failed=saveToSlot(2,false); doSaveToSlot(3);
    const unchanged=localStorage.getItem(saveKey(2))===previous;
    Storage.prototype.setItem=set;
    return {failed,unchanged,slot:currentSaveSlot,empty:readSaveRecord(3).status};
  }), {failed:false,unchanged:true,slot:1,empty:'empty'});
}));

test('primary write failure after backup leaves original intact', () => run(async page => {
  assert.equal(await page.evaluate(() => {
    saveToSlot(1,false);const raw=localStorage.getItem(saveKey(1)),set=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){if(key===saveKey(1))throw new DOMException('Full','QuotaExceededError');return set.call(this,key,value)};
    gold=999;const ok=saveToSlot(1,false);Storage.prototype.setItem=set;
    return !ok && localStorage.getItem(saveKey(1))===raw && localStorage.getItem(saveKey(1,'backup'))===raw;
  }),true);
}));

test('invalid import files do not overwrite saves or touch play', () => run(async page => {
  await page.evaluate(()=>{saveToSlot(1,false);window.originalSave=localStorage.getItem(saveKey(1));});
  for (const text of ['{}','not json',JSON.stringify({version:999})]) {
    await page.evaluate(()=>showTopNotification('')); 
    const chooser=page.waitForEvent('filechooser'); await page.evaluate(()=>doImportToSlot(1));
    await (await chooser).setFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(text)});
    await page.waitForFunction(()=>document.body.textContent.includes('가져오기에 실패했습니다'));
  }
  assert.equal(await page.evaluate(()=>localStorage.getItem(saveKey(1))===window.originalSave && gold===100),true);
}));

test('valid import requires confirmation, preserves autosave and backs up manual data', () => run(async page => {
  await page.evaluate(()=>{saveToSlot(1,false);gold=300;saveToSlot(1,true);});
  page.once('dialog',dialog=>dialog.dismiss());
  assert.equal(await page.evaluate(()=>importSaveText(1,JSON.stringify({...getSaveData(),gold:900}),'cancel.json')),false);
  assert.equal(await page.evaluate(()=>loadSlotData(1).gold),100);
  page.once('dialog',dialog=>dialog.accept());
  const chooser=page.waitForEvent('filechooser'); await page.evaluate(()=>doImportToSlot(1));
  const data=await page.evaluate(()=>({...getSaveData(),gold:900}));
  await (await chooser).setFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
  await page.waitForFunction(()=>loadSlotData(1)?.gold===900);
  assert.deepEqual(await page.evaluate(()=>({manual:loadSlotData(1).gold,auto:loadSlotData(1,'auto').gold,backup:loadSlotData(1,'backup').gold,live:gold})),
    {manual:900,auto:300,backup:100,live:300});
}));

test('backup restore recovers corrupt manual save without changing current play', () => run(async page => {
  await page.evaluate(()=>{saveToSlot(1,false);gold=200;saveToSlot(1,false);localStorage.setItem(saveKey(1),'{}');});
  page.once('dialog',dialog=>dialog.accept());
  await page.evaluate(()=>doRestoreBackup(1));
  assert.deepEqual(await page.evaluate(()=>({stored:loadSlotData(1).gold,live:gold})),{stored:100,live:200});
  await page.evaluate(()=>doLoadSlot(1));
  assert.equal(await page.evaluate(()=>gold),100);
}));

test('file export can be imported back and download contains validated save', () => run(async page => {
  await page.evaluate(()=>{gold=777;saveToSlot(1,false);});
  const downloadPromise=page.waitForEvent('download'); await page.evaluate(()=>doExportSlot(1));
  const download=await downloadPromise, exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  assert.equal(exported.gold,777); assert.equal(exported.version,3);
  page.once('dialog',dialog=>dialog.accept());
  await page.evaluate(data=>importSaveText(2,JSON.stringify(data),'export.json'),exported);
  await page.evaluate(()=>doLoadSlot(2));
  assert.equal(await page.evaluate(()=>currentSaveSlot===2 && gold===777),true);
}));

test('unload writes autosave without overwriting manual progress', () => run(async page => {
  await page.evaluate(()=>{saveToSlot(1,false);gold=600;isPlaying=true;});
  await page.reload();
  assert.deepEqual(await page.evaluate(()=>({manual:loadSlotData(1).gold,auto:loadSlotData(1,'auto').gold})),{manual:100,auto:600});
}));

test('new-game UI remains playable with independent auto save', () => run(async page => {
  await page.getByRole('button',{name:'게임 시작',exact:true}).click();
  await page.getByRole('button',{name:'새로운 모험 시작',exact:true}).first().click();
  for(let i=0;i<100 && await page.locator('#story-screen').isVisible();i++) await page.locator('#story-screen').click();
  await page.waitForFunction(()=>isPlaying && !isPaused && gameState==='village');
  const x=await page.evaluate(()=>player.x);
  await page.keyboard.down('d');await page.waitForTimeout(400);await page.keyboard.up('d');
  assert.ok(await page.evaluate(()=>player.x)>x);
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'저장하기',exact:true}).click();
  await page.getByRole('button',{name:'수동 저장',exact:true}).first().click();
  assert.equal(await page.evaluate(()=>readSaveRecord(1).status),'valid');
}));

test('version 2 saves and combat snapshots normalize to a safe village spawn', () => run(async page => {
  assert.deepEqual(await page.evaluate(() => {
    const data=getSaveData();data.version=2;data.gameState='dungeon';data.player={x:15,y:100,facing:'left'};
    const normalized=normalizeSaveData(data);
    applySaveData(data);gameState='tower';player.x=10;player.y=20;
    const snapshot=getSaveData();
    return {version:normalized.version,state:normalized.gameState,player:normalized.player,snapshot: snapshot.player};
  }), {version:3,state:'village',player:{x:400,y:500,facing:'left'},snapshot:{x:400,y:500,facing:'left'}});
}));

test('cancelled manual overwrite and slot deletion preserve all data; active slot cannot be deleted', () => run(async page => {
  await page.evaluate(()=>{saveToSlot(1,false);gold=500;saveToSlot(1,true);});
  page.once('dialog',dialog=>dialog.dismiss());
  await page.evaluate(()=>doSaveToSlot(1));
  page.once('dialog',dialog=>dialog.dismiss());
  await page.evaluate(()=>doDeleteSlot(1,'load'));
  assert.equal(await page.evaluate(()=>loadSlotData(1).gold===100 && loadSlotData(1,'auto').gold===500),true);
  await page.evaluate(()=>{isPlaying=true;doDeleteSlot(1,'load');});
  assert.equal(await page.evaluate(()=>readSaveRecord(1).status),'valid');
  await page.evaluate(()=>{isPlaying=false;});
  page.once('dialog',dialog=>dialog.accept());
  await page.evaluate(()=>doDeleteSlot(1,'load'));
  assert.equal(await page.evaluate(()=>SAVE_SOURCES.every(source=>readSaveRecord(1,source).status==='empty')),true);
}));

test('failed backup restore keeps selected recovery point and primary unchanged', () => run(async page => {
  await page.evaluate(()=>{saveToSlot(1,false);gold=200;saveToSlot(1,false);});
  page.once('dialog',dialog=>dialog.accept());
  assert.deepEqual(await page.evaluate(()=>{
    const set=Storage.prototype.setItem;
    Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError')};
    doRestoreBackup(1);Storage.prototype.setItem=set;
    return {primary:loadSlotData(1).gold,backup:loadSlotData(1,'backup').gold,live:gold};
  }),{primary:200,backup:100,live:200});
}));

test('blocked local storage does not crash startup and shows an access failure', () => run(async page => {
  await page.getByRole('button',{name:'게임 시작',exact:true}).click();
  assert.ok((await page.locator('#save-slots-container').innerText()).includes('저장 공간 접근 실패'));
  await page.evaluate(()=>toggleSfxMute());
}, () => {
  Storage.prototype.getItem=function(){throw new DOMException('Denied','SecurityError')};
  Storage.prototype.setItem=function(){throw new DOMException('Denied','SecurityError')};
}));

test('oversized file is rejected before reading or changing storage', () => run(async page => {
  await page.evaluate(()=>{saveToSlot(1,false);});
  const chooser=page.waitForEvent('filechooser');await page.evaluate(()=>doImportToSlot(1));
  await (await chooser).setFiles({name:'large.json',mimeType:'application/json',buffer:Buffer.alloc(1024*1024+1,32)});
  await page.waitForFunction(()=>document.body.textContent.includes('1MB 이하여야'));
  assert.equal(await page.evaluate(()=>loadSlotData(1).gold),100);
}));
