const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {createBrowserHarness,startNewAdventure}=require('./helpers/browser.cjs');
const {manualAnimationClock}=require('./helpers/manual-clock.cjs');
const {run}=createBrowserHarness({before,after});
const options={init:manualAnimationClock};
async function settings(page){await page.evaluate(()=>openSettingsModal());}
async function rebind(page,bindings){
  await settings(page);await page.locator('#key-settings').evaluate(el=>el.open=true);
  for(const [key,value] of Object.entries(bindings))await page.locator('#binding-'+key).selectOption(value);
  await page.locator('#settings-close').click();
  if(await page.locator('#pause-menu').isVisible())await page.getByRole('button',{name:'계속하기',exact:true}).click();
}
const tick=page=>page.evaluate(()=>{for(let i=0;i<12;i++)stepGame(false);});

test('start-screen settings support keyboard focus, Escape and return without starting a session',()=>run(async page=>{
  await page.getByRole('button',{name:'설정',exact:true}).click();
  assert.equal(await page.locator('#autosave-toggle').evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Shift+Tab');assert.equal(await page.locator('#settings-close').evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Tab');assert.equal(await page.locator('#autosave-toggle').evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Escape');
  assert.deepEqual(await page.evaluate(()=>({start:overlayVisible('start-screen'),pause:overlayVisible('pause-menu'),playing:isPlaying,settings:overlayVisible('settings-modal')})),{start:true,pause:false,playing:false,settings:false});
},options));

test('all accessibility controls persist across reload, new adventure and save loading',()=>run(async page=>{
  await settings(page);
  await page.locator('#autosave-toggle').uncheck();await page.locator('#shake-toggle').uncheck();await page.locator('#mute-toggle').check();
  await page.locator('#volume-setting').fill('25');await page.locator('#ui-size-setting').selectOption('1.3');
  await page.locator('#hitstop-toggle').uncheck();await page.locator('#effects-setting').fill('0');await page.locator('#settings-close').click();
  await page.reload();await startNewAdventure(page);
  const result=await page.evaluate(()=>{
    const save=getSaveData();applySaveData(save);
    return {volume:accessibility.volume,scale:accessibility.uiScale,hitStop:accessibility.hitStop,effects:accessibility.effects,
      auto:autoSaveEnabled,shake:shakeEnabled,mute:sfxMuted,large:document.body.hasAttribute('data-large-ui'),version:save.version,
      inSave:'bindings' in save || 'accessibility' in save};
  });
  assert.deepEqual(result,{volume:.25,scale:1.3,hitStop:false,effects:0,auto:false,shake:false,mute:true,large:true,version:6,inSave:false});
},options));

test('rebound movement uses real browser keys; previous key stops working and keyup releases motion',()=>run(async page=>{
  await startNewAdventure(page);await rebind(page,{KeyW:'ArrowUp',ShiftLeft:'Space'});
  await page.keyboard.down('w');assert.equal(await page.evaluate(()=>!!keys.KeyW),false);await page.keyboard.up('w');
  const y=await page.evaluate(()=>player.y);await page.keyboard.down('ArrowUp');await page.keyboard.down('Space');await tick(page);
  assert.equal(await page.evaluate(()=>keys.KeyW&&keys.ShiftLeft),true);assert.ok(await page.evaluate(y=>player.y<y,y));
  await page.keyboard.up('ArrowUp');await page.keyboard.up('Space');assert.deepEqual(await page.evaluate(()=>keys),{});
},options));

test('both default Shift keys remain held until both are released; blur drops all physical keys',()=>run(async page=>{
  await startNewAdventure(page);await page.keyboard.down('ShiftLeft');await page.keyboard.down('ShiftRight');await page.keyboard.up('ShiftLeft');
  assert.equal(await page.evaluate(()=>keys.ShiftLeft),true);await page.keyboard.up('ShiftRight');assert.deepEqual(await page.evaluate(()=>keys),{});
  await page.keyboard.down('d');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.keyboard.up('d');
  assert.deepEqual(await page.evaluate(()=>({keys,held:heldPhysicalKeys.size,paused:isPaused})),{keys:{},held:0,paused:true});
},options));

test('custom skill and weapon switch keys execute once per physical press and update HUD hints',()=>run(async page=>{
  await startNewAdventure(page);await rebind(page,{KeyQ:'KeyT',Tab:'KeyY'});
  await page.evaluate(()=>{equipped.bow={...findItemById('bow_wood')};equipped.sword={...findItemById('sword_iron')};activeWeaponSlot='bow';skills.learnedBow=true;syncActiveWeapon();recalcAllStats();});
  await page.keyboard.press('q');assert.equal(await page.evaluate(()=>bowState.homingActive),false);
  await page.keyboard.down('t');await page.keyboard.down('t');await page.keyboard.up('t');assert.equal(await page.evaluate(()=>bowState.homingActive),true);
  await page.keyboard.press('y');assert.equal(await page.evaluate(()=>activeWeaponSlot),'sword');
  assert.equal(await page.locator('#skill-slot-q .key-label').textContent(),'T');
  assert.equal(await page.locator('#weapon-switch-key').textContent(),'Y');
  await page.evaluate(()=>{elfQueenDefeated=true;openNpcModal('elfqueen');});
  assert.match(await page.locator('#npc-content').textContent(),/\[T\].*유도 사격[\s\S]*Y 키/);
  assert.match(await page.locator('#current-binding-guide').textContent(),/스킬 T\/E\/F\/R.*무기 전환 Y/);
},options));

test('rebound charged skill honors physical hold and release through the actual simulation',()=>run(async page=>{
  await startNewAdventure(page);await rebind(page,{KeyE:'KeyH'});
  await page.evaluate(()=>{equipped.staff={...findItemById('staff_apprentice')};activeWeaponSlot='staff';skills.learnedStaff=true;awakenState.staff.stage='awakened';statMp=37;syncActiveWeapon();recalcAllStats();mp=maxMp;gameState='training';setupTraining();player.x=400;player.y=500;});
  await page.keyboard.down('h');await tick(page);assert.equal(await page.evaluate(()=>frostFx?.phase),'charge');
  await page.keyboard.up('h');await tick(page);assert.equal(await page.evaluate(()=>frostFx?.phase),'burst');
},options));

test('custom potion keys consume once, preserve quantities and display the current key',()=>run(async page=>{
  await startNewAdventure(page);await rebind(page,{Digit1:'KeyH'});
  await page.evaluate(()=>{hp=1;hotbar[0]={...potionItems[0],count:5};setupInventory();});
  await page.keyboard.press('1');assert.equal(await page.evaluate(()=>hotbar[0].count),5);
  await page.keyboard.down('h');await page.keyboard.down('h');await page.keyboard.up('h');assert.equal(await page.evaluate(()=>hotbar[0].count),4);
  assert.equal(await page.locator('.inv-grid-hotbar .slot-key').first().textContent(),'H');
  assert.match(await page.locator('.inv-grid-hotbar .inv-slot').first().getAttribute('aria-label'),/키 H/);
},options));

test('rebound Shift registration works in the compact drawer without consuming a potion',()=>run(async page=>{
  await startNewAdventure(page);await rebind(page,{Digit1:'KeyH'});
  await page.evaluate(()=>{inventory[0]={...potionItems[0],count:3};setupInventory();toggleSidePanel('right-ui-panel');hoveredSlot={area:'bag',index:0};});
  await page.keyboard.press('Shift+h');
  assert.deepEqual(await page.evaluate(()=>({bag:inventory[0],hotbar:hotbar[0]?.count,panel:openSidePanel})),{bag:null,hotbar:3,panel:'right-ui-panel'});
},{...options,viewport:{width:800,height:600}}));

test('duplicate and reserved bindings are rejected without changing the current mapping',()=>run(async page=>{
  await settings(page);await page.locator('#key-settings').evaluate(el=>el.open=true);
  await page.locator('#binding-KeyQ').selectOption('KeyW');
  assert.equal(await page.locator('#binding-KeyQ').inputValue(),'KeyQ');assert.match(await page.locator('#settings-status').textContent(),/이미 사용하는 키/);
  assert.equal(await page.locator('#binding-KeyQ option[value="Escape"]').count(),0);assert.equal(await page.locator('#binding-KeyQ option[value="ShiftLeft"]').count(),0);
  const result=await page.evaluate(()=>{
    const duplicate={...DEFAULT_BINDINGS,KeyQ:'KeyW'},reserved={...DEFAULT_BINDINGS,KeyQ:'Escape'},shift={...DEFAULT_BINDINGS,KeyQ:'ShiftLeft',ShiftLeft:'KeyT'};
    return [duplicate,reserved,shift].map(bindings=>normalizePreferences({bindings}).bindings.KeyQ);
  });
  assert.deepEqual(result,['KeyQ','KeyQ','KeyQ']);
},options));

test('modified browser shortcuts and settings controls never trigger rebound gameplay',()=>run(async page=>{
  await startNewAdventure(page);await rebind(page,{KeyD:'ArrowRight'});
  await page.keyboard.press('Control+ArrowRight');assert.deepEqual(await page.evaluate(()=>keys),{});
  await settings(page);const frame=await page.evaluate(()=>frameCount);await page.keyboard.press('ArrowRight');
  assert.deepEqual(await page.evaluate(()=>({frame:frameCount,keys})),{frame,keys:{}});
},options));

test('training convenience keys also support rebinding',()=>run(async page=>{
  await startNewAdventure(page);await rebind(page,{KeyZ:'KeyJ'});
  await page.evaluate(()=>{gameState='training';setupTraining();player.x=400;player.y=500;});
  await page.keyboard.down('j');await tick(page);await page.keyboard.up('j');assert.equal(await page.evaluate(()=>trainingOpts.infMana),false);
},options));

test('volume scales actual Web Audio gains; zero volume and mute avoid creating sounds',()=>run(async page=>{
  const result=await page.evaluate(()=>{
    const gains=[];let oscillators=0;
    audioCtx={currentTime:0,state:'running',destination:{},createOscillator(){oscillators++;return {frequency:{value:0},connect(){return this;},start(){},stop(){}};},
      createGain(){return {gain:{setValueAtTime(v){gains.push(v);},exponentialRampToValueAtTime(){}},connect(){return this;}};}};
    accessibility.volume=.25;sfxMuted=false;playSfx('hit');const expected=SFX_DEFS.hit.map(n=>n.gain*.25),count=oscillators;
    accessibility.volume=0;playSfx('hit');accessibility.volume=1;sfxMuted=true;playSfx('hit');return {gains,expected,count,oscillators};
  });
  assert.deepEqual(result.gains,result.expected);assert.ok(result.count>0);assert.equal(result.oscillators,result.count);
},options));

test('disabling hitstop immediately restores simulation while enabled hitstop freezes combat time',()=>run(async page=>{
  await startNewAdventure(page);
  const result=await page.evaluate(()=>{
    accessibility.hitStop=false;hitStop=9;const before=frameCount;stepGame(false);const off=frameCount-before;
    accessibility.hitStop=true;impact(0,3,0);const frame=frameCount;stepGame(false);
    return {off,on:frameCount-frame,left:hitStop};
  });
  assert.deepEqual(result,{off:1,on:0,left:2});
},options));

test('screen flash strength changes actual rendered alpha and zero leaves warning zones intact',()=>run(async page=>{
  await startNewAdventure(page);
  const result=await page.evaluate(()=>{
    const alphas=[],original=ctx.fillRect;
    ctx.fillRect=function(x,y,w,h){if(w===880&&h===980)alphas.push(this.globalAlpha);return original.call(this,x,y,w,h);};
    for(const strength of [1,.4,0]){accessibility.effects=strength;screenFlash=.5;drawSkillFx(0);}
    ctx.fillRect=original;
    slimeZones=[{x:400,y:400,r:50,timer:30,totalTimer:60,dmg:1}];drawZoneArray(slimeZones,'#fff','#f00');
    return {alphas,zones:slimeZones.length,timer:slimeZones[0].timer};
  });
  assert.deepEqual(result,{alphas:[.5,.2,0],zones:1,timer:30});
},options));

for(const viewport of [{width:320,height:360},{width:844,height:390},{width:1600,height:1000}])test(`${viewport.width}x${viewport.height}: large UI settings remain scrollable and keyboard reachable`,()=>run(async page=>{
  await settings(page);await page.locator('#ui-size-setting').selectOption('1.3');await page.locator('#settings-close').click();await settings(page);
  const data=await page.locator('#settings-modal').evaluate(el=>{
    const box=el.getBoundingClientRect(),stage=document.getElementById('game-stage').getBoundingClientRect();return {fits:box.left>=stage.left&&box.right<=stage.right+1,font:parseFloat(getComputedStyle(document.getElementById('autosave-toggle').parentElement).fontSize)};
  });
  assert.equal(data.fits,true);assert.ok(data.font>=18);
  await page.locator('#settings-close').focus();await page.keyboard.press('Tab');assert.equal(await page.locator('#autosave-toggle').evaluate(el=>el===document.activeElement),true);
  await page.locator('#settings-close').click();assert.equal(await page.locator('#start-screen').isVisible(),true);
},{...options,viewport}));

test('default restoration resets bindings, presentation, audio and persisted preferences',()=>run(async page=>{
  await rebind(page,{KeyW:'ArrowUp'});await settings(page);await page.getByRole('button',{name:'기본 설정 복원',exact:true}).click();
  assert.equal(await page.locator('#binding-KeyW').inputValue(),'KeyW');
  await page.locator('#settings-close').click();await page.reload();
  assert.deepEqual(await page.evaluate(()=>({key:accessibility.bindings.KeyW,scale:accessibility.uiScale,volume:accessibility.volume,effects:accessibility.effects,hitStop:accessibility.hitStop,auto:autoSaveEnabled,shake:shakeEnabled,mute:sfxMuted})),
    {key:'KeyW',scale:1,volume:1,effects:1,hitStop:true,auto:true,shake:true,mute:false});
},options));

for(const raw of ['{broken',JSON.stringify({volume:-1,uiScale:99,effects:'0',hitStop:'false',autoSave:1,bindings:{KeyW:'KeyT'}})])test('malformed preferences safely fall back to validated defaults: '+raw.slice(0,18),()=>run(async page=>{
  assert.deepEqual(await page.evaluate(()=>({key:accessibility.bindings.KeyW,volume:accessibility.volume,scale:accessibility.uiScale,effects:accessibility.effects,hitStop:accessibility.hitStop,auto:autoSaveEnabled})),{key:'KeyW',volume:1,scale:1,effects:1,hitStop:true,auto:true});
},{init:new Function('('+manualAnimationClock.toString()+')();localStorage.setItem("mangiworld_preferences",'+JSON.stringify(raw)+');')}));

test('storage write failure reports the problem and retains usable session settings',()=>run(async page=>{
  await settings(page);await page.locator('#volume-setting').fill('40');await page.locator('#settings-close').click();
  assert.equal(await page.evaluate(()=>accessibility.volume),.4);assert.match(await page.locator('#top-notification').textContent(),/설정 저장에 실패/);
},{init:new Function('('+manualAnimationClock.toString()+')();const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==="mangiworld_preferences")throw new Error("storage blocked");return original.call(this,key,value);};')}));

// Integration: the prior save, inventory, objective and retry systems must survive custom controls.
test('v4 integration preserves manual saves, locked gear and tracked objectives through boss death/retry/load',()=>run(async page=>{
  await startNewAdventure(page);await rebind(page,{KeyW:'ArrowUp',KeyQ:'KeyT'});
  const result=await page.evaluate(()=>{
    trackedObjective='dungeon:slime';inventory[0]={...findItemById('sword_iron')};lockedSlots[0]=true;
    dungeonProgress.slime.progress=dungeonDefs.slime.tiers.map(t=>t.target);gold=700;saveToSlot(1,false);
    enterDungeonStage('slime',2,true,false);applyPlayerDamage(99999,'슬라임 킹');respawnPlayerAtInn();const retried=retryCombat();
    saveToSlot(1,true);const manual=readSaveRecord(1,'manual').data;applySaveData(manual);
    return {retried,gold,trackedObjective,locked:lockedSlots[0],item:inventory[0].id,move:accessibility.bindings.KeyW,skill:accessibility.bindings.KeyQ,logs:damageLog.length,version:manual.version};
  });
  assert.deepEqual(result,{retried:true,gold:700,trackedObjective:'dungeon:slime',locked:true,item:'sword_iron',move:'ArrowUp',skill:'KeyT',logs:0,version:6});
},options));
