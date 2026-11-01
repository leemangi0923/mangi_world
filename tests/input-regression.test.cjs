const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {createBrowserHarness,startNewAdventure}=require('./helpers/browser.cjs');
const {run}=createBrowserHarness({before,after});

async function equipTestItems(page) {
  await page.evaluate(()=>{
    equipped.sword={...findItemById('sword_iron')};equipped.bow={...findItemById('bow_wood')};
    activeWeaponSlot='bow';skills.learnedBow=true;syncActiveWeapon();recalcAllStats();
    hp=50;hotbar[0]={...potionItems[0],count:5};statPoints=2;setupInventory();updateHUD();
  });
}

test('blur releases held movement and requires explicit resume, including after focus returns',()=>run(async page=>{
  await startNewAdventure(page);
  await page.keyboard.down('d');
  await page.waitForFunction(()=>player.vx>0);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  const stopped=await page.evaluate(()=>({x:player.x,frame:frameCount}));
  await page.keyboard.up('d');
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(100);
  assert.deepEqual(await page.evaluate(()=>({x:player.x,frame:frameCount,keys,vx:player.vx,paused:isPaused})),
    {...stopped,keys:{},vx:0,paused:true});
  await page.getByRole('button',{name:'계속하기',exact:true}).click();
  await page.waitForFunction(frame=>frameCount>frame,stopped.frame);
  assert.equal(await page.evaluate(x=>player.x===x,stopped.x),true);
  await page.keyboard.down('d');
  await page.waitForFunction(x=>player.x>x,stopped.x);
  await page.keyboard.up('d');
}));

test('hidden tab cannot resume; visible tab still waits for explicit resume',()=>run(async page=>{
  await startNewAdventure(page);
  await page.evaluate(()=>{
    window.testHidden=true;
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.testHidden});
    document.dispatchEvent(new Event('visibilitychange'));
    togglePauseMenu();
  });
  assert.equal(await page.evaluate(()=>isPaused && overlayVisible('pause-menu')),true);
  await page.evaluate(()=>{window.testHidden=false;document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await page.evaluate(()=>isPaused),true);
  await page.getByRole('button',{name:'계속하기',exact:true}).click();
  assert.equal(await page.evaluate(()=>isPaused),false);
}));

test('real browser tab switch clears input and does not resume gameplay on return',()=>run(async page=>{
  await startNewAdventure(page);
  // Playwright normally emulates a focused page in every tab. Disable that emulation so
  // Chromium delivers the native blur/focus events for the actual tab transition.
  const client=await page.context().newCDPSession(page);
  const other=await page.context().newPage();
  const otherClient=await page.context().newCDPSession(other);
  await client.send('Emulation.setFocusEmulationEnabled',{enabled:false});
  await otherClient.send('Emulation.setFocusEmulationEnabled',{enabled:false});
  await page.bringToFront();
  if(await page.evaluate(()=>isPaused))await page.getByRole('button',{name:'계속하기',exact:true}).click();
  await page.keyboard.down('d');await page.waitForFunction(()=>player.vx>0);
  await other.bringToFront();await other.keyboard.up('d');
  await page.waitForFunction(()=>isPaused);
  await page.bringToFront();await other.close();
  assert.equal(await page.evaluate(()=>isPaused && Object.keys(keys).length===0 && player.vx===0),true);
  await page.getByRole('button',{name:'계속하기',exact:true}).click();
  assert.equal(await page.evaluate(()=>isPaused),false);
}));

test('held toggle, weapon-switch, potion and Escape keys act only once per press',()=>run(async page=>{
  await startNewAdventure(page);await equipTestItems(page);
  await page.keyboard.down('q');await page.waitForFunction(()=>skills.cooldowns.q===0);
  await page.keyboard.down('q');await page.keyboard.up('q');
  assert.equal(await page.evaluate(()=>bowState.homingActive),true);
  await page.keyboard.press('q');assert.equal(await page.evaluate(()=>bowState.homingActive),false);
  await page.keyboard.down('Tab');await page.keyboard.down('Tab');await page.keyboard.up('Tab');
  assert.equal(await page.evaluate(()=>activeWeaponSlot),'sword');
  await page.keyboard.down('1');await page.keyboard.down('1');await page.keyboard.up('1');
  assert.equal(await page.evaluate(()=>hotbar[0].count),4);
  await page.keyboard.down('Escape');await page.keyboard.down('Escape');await page.keyboard.up('Escape');
  assert.equal(await page.evaluate(()=>isPaused && overlayVisible('pause-menu')),true);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>isPaused),false);
}));

for(const overlay of ['npc-modal','guild-ui','blacksmith-ui','potion-ui','alert-modal','tower-choice-modal']) {
  test(`${overlay} blocks movement, combat and side-panel actions and freezes the game clock`,()=>run(async page=>{
    await startNewAdventure(page);await equipTestItems(page);
    await page.evaluate(id=>{
      if(id==='npc-modal')openNpcModal('minje');
      else if(id==='alert-modal')showAlertModal('test','test');
      else document.getElementById(id).classList.remove('hidden');
    },overlay);
    const frame=await page.evaluate(()=>frameCount);
    await page.keyboard.press('q');await page.keyboard.press('Tab');await page.keyboard.press('1');
    await page.keyboard.down('d');
    await page.locator('#inv-hotbar .inv-slot').first().click();
    await page.locator('#left-ui-panel .stat-btn').first().click();
    // Dispatch directly to the canvas as well: the gameplay guard must protect against event leakage.
    await page.locator('#gameCanvas').dispatchEvent('mousedown',{button:0,clientX:750,clientY:350});
    await page.waitForTimeout(80);await page.keyboard.up('d');
    assert.deepEqual(await page.evaluate(()=>({frame:frameCount,weapon:activeWeaponSlot,homing:bowState.homingActive,
      count:hotbar[0].count,hp,statPoints,attack:player.lastAttackTime,keys})),
      {frame,weapon:'bow',homing:false,count:5,hp:50,statPoints:2,attack:0,keys:{}});
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(id=>overlayVisible(id),overlay),false);
    await page.waitForFunction(value=>frameCount>value,frame);
  }));
}

test('settings and save screens return to pause before gameplay resumes',()=>run(async page=>{
  await startNewAdventure(page);await equipTestItems(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'설정',exact:true}).click();
  await page.keyboard.press('1');await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>isPaused && overlayVisible('pause-menu') && !overlayVisible('settings-modal')),true);
  await page.getByRole('button',{name:'불러오기',exact:true}).click();
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await page.keyboard.press('1');await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>isPaused && overlayVisible('pause-menu') && !overlayVisible('save-screen')),true);
  assert.equal(await page.evaluate(()=>hotbar[0].count),5);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>isPaused),false);
}));

test('focus pause layered over NPC dialogue closes one layer at a time',()=>run(async page=>{
  await startNewAdventure(page);
  await page.evaluate(()=>{openNpcModal('minje');window.dispatchEvent(new Event('blur'));});
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>overlayVisible('npc-modal') && !overlayVisible('pause-menu')),true);
  const frame=await page.evaluate(()=>frameCount);await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>frameCount),frame);
  await page.keyboard.press('Escape');
  await page.waitForFunction(value=>frameCount>value,frame);
  assert.equal(await page.evaluate(()=>activeNpc),null);
}));

test('pause freezes survival, skill cooldowns, buffs, projectiles and HP until resume',()=>run(async page=>{
  await startNewAdventure(page);
  await page.evaluate(()=>{
    enterDungeonStage('slime',2,false,true);skills.learnedSword=true;skills.cooldowns.q=100;
    activeBuffs={atk:{val:10,timeLeft:100}};
    projectiles=[{x:20,y:20,vx:1,vy:0,r:3,dmg:1,life:100,owner:'enemy',color:'#fff'}];
  });
  await page.keyboard.press('Escape');
  const snapshot=()=>page.evaluate(()=>({frame:frameCount,progress:dungeonProgress.slime.progress[2],cd:skills.cooldowns.q,
    buff:activeBuffs.atk.timeLeft,projectile:projectiles[0].x,hp}));
  const frozen=await snapshot();await page.waitForTimeout(120);assert.deepEqual(await snapshot(),frozen);
  await page.keyboard.press('Escape');await page.waitForFunction(frame=>frameCount>frame,frozen.frame);
  const resumed=await snapshot();assert.ok(resumed.progress>frozen.progress);assert.ok(resumed.cd<frozen.cd);
  assert.ok(resumed.buff<frozen.buff);assert.ok(resumed.projectile>frozen.projectile);
}));

test('normal side-panel stat and potion clicks still work during active play',()=>run(async page=>{
  await startNewAdventure(page);await equipTestItems(page);
  await page.locator('#left-ui-panel .stat-btn').first().click();
  assert.equal(await page.evaluate(()=>statPoints),1);
  await page.locator('#inv-hotbar .inv-slot').first().click();
  assert.equal(await page.evaluate(()=>hotbar[0].count),4);
  const x=await page.evaluate(()=>player.x);
  await page.keyboard.down('d');await page.waitForFunction(value=>player.x>value,x);await page.keyboard.up('d');
}));

test('topmost tower and alert dialogs close before the focus-loss pause menu',()=>run(async page=>{
  await startNewAdventure(page);
  await page.evaluate(()=>{
    showAlertModal('test','test');document.getElementById('tower-choice-modal').classList.remove('hidden');
    window.dispatchEvent(new Event('blur'));
  });
  await page.keyboard.press('Escape');
  assert.deepEqual(await page.evaluate(()=>({tower:overlayVisible('tower-choice-modal'),alert:overlayVisible('alert-modal'),pause:overlayVisible('pause-menu')})),
    {tower:false,alert:true,pause:true});
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>overlayVisible('alert-modal')),false);
  assert.equal(await page.evaluate(()=>isPaused),true);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>isPaused),false);
}));

test('typing into a control and browser shortcut modifiers do not trigger combat',()=>run(async page=>{
  await startNewAdventure(page);await equipTestItems(page);
  await page.evaluate(()=>{
    const input=document.createElement('input');input.id='typing-test';document.body.appendChild(input);input.focus();
  });
  await page.keyboard.press('q');await page.keyboard.press('1');
  assert.equal(await page.evaluate(()=>!bowState.homingActive && hotbar[0].count===5),true);
  await page.evaluate(()=>{
    document.getElementById('typing-test').remove();
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyQ',ctrlKey:true}));
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyQ',metaKey:true}));
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'Digit1',altKey:true}));
  });
  assert.equal(await page.evaluate(()=>!bowState.homingActive && hotbar[0].count===5),true);
}));

test('charged skill freezes on focus loss and releases once after explicit resume',()=>run(async page=>{
  await startNewAdventure(page);
  await page.evaluate(()=>{
    equipped.staff={...findItemById('staff_apprentice')};activeWeaponSlot='staff';skills.learnedStaff=true;
    awakenState.staff.stage='awakened';statMp=37;syncActiveWeapon();recalcAllStats();mp=maxMp;
    gameState='training';setupTraining();player.x=400;player.y=500;
  });
  await page.keyboard.down('e');await page.waitForFunction(()=>frostFx?.phase==='charge' && frostFx.charge>1);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  const charge=await page.evaluate(()=>frostFx.charge);
  await page.keyboard.up('e');await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>frostFx.charge),charge);
  await page.getByRole('button',{name:'계속하기',exact:true}).click();
  await page.waitForFunction(()=>frostFx?.phase==='burst');
  assert.equal(await page.evaluate(()=>frostFx.charge<=FROST_CHARGE_MAX && !keys.KeyE),true);
}));

test('rapid story transitions tolerate a frame timestamp older than the latest input event',()=>run(async page=>{
  await page.evaluate(()=>{
    startNewGame();
    cancelAnimationFrame(storyFrame);
    storyIndex=storyScripts.findIndex(scene=>scene.scene==='silence');
    storySceneStart=performance.now()+100;
    // Chromium can supply a RAF timestamp captured before the latest click's performance.now().
    // The silence scene used to throw RangeError from a negative String.repeat count.
    storyLoop(performance.now());
    stopStoryPlayback();
  });
  assert.equal(await page.evaluate(()=>storyFrame===null && !storyAnimRunning),true);
}));
