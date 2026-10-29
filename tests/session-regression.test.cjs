const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {createBrowserHarness, startNewAdventure} = require('./helpers/browser.cjs');
const {run} = createBrowserHarness({before, after});

test('starting a new adventure in the same page clears previous progression', () => run(async page => {
  await startNewAdventure(page);
  await page.evaluate(()=>{
    level=80;statStr=90;skills.learnedSword=true;demonDefeated=true;
    inventory[0]={...blacksmithItems[0]};activeQuests.q_slime_novice={status:'done',progress:5};
    dungeonProgress.slime.progress=[25,3,5400];awakenState.sword.stage='awakened';
    doNewGame(2);
  });
  assert.deepEqual(await page.evaluate(()=>({level,statStr,learned:skills.learnedSword,demonDefeated,item:inventory[0],
    quests:activeQuests,progress:dungeonProgress.slime.progress,awaken:awakenState.sword.stage,isPlaying,isPaused})),
    {level:1,statStr:10,learned:false,demonDefeated:false,item:null,quests:{},progress:[0,0,0],awaken:'locked',isPlaying:false,isPaused:true});
}));

test('loading another session clears transient buffs, hazards, player status and dialogs', () => run(async page => {
  await startNewAdventure(page);
  assert.deepEqual(await page.evaluate(()=>{
    const clean=getSaveData();
    activeBuffs={atk:{val:100,timeLeft:300}};player.frozenTimer=120;player.knockbackTimer=15;keys={KeyD:true};
    pendingSpawns=[{}];slimeZones=[{}];ghostDecoys=[{}];staffMeteorZones=[{}];staffTeleportFx=[{}];staffUltimateFx={};
    cameraShake=12;hitStop=10;bossRespawnCooldown.slime=999;openNpcModal('minje');
    document.getElementById('alert-modal').classList.remove('hidden');
    applySaveData(clean);
    return {buffs:activeBuffs,frozen:player.frozenTimer,knockback:player.knockbackTimer,keys,pending:pendingSpawns.length,
      zones:slimeZones.length,decoys:ghostDecoys.length,meteors:staffMeteorZones.length,teleport:staffTeleportFx.length,ultimate:staffUltimateFx,
      shake:cameraShake,stop:hitStop,bossWait:bossRespawnCooldown.slime,npc:activeNpc,
      dialogs:['npc-modal','alert-modal'].some(id=>!document.getElementById(id).classList.contains('hidden'))};
  }),{buffs:{},frozen:0,knockback:0,keys:{},pending:0,zones:0,decoys:0,meteors:0,teleport:0,ultimate:null,
    shake:0,stop:0,bossWait:0,npc:null,dialogs:false});
}));

for (const [npc, state] of [['minje','minje_duel'],['elfqueen','elf_duel'],['archmage','mage_duel']]) {
  test(`first ${npc} duel is a normal skill lesson, not an awakening rematch`, () => run(async page => {
    await startNewAdventure(page);
    await page.evaluate(id=>openNpcModal(id),npc);
    await page.locator('#npc-action-btn').click();
    assert.deepEqual(await page.evaluate(()=>({state:gameState,awakened:enemies[0].awakened})),{state,awakened:false});
  }));
}

test('menu return saves once, clears the session, and starts a clean second slot without reloading', () => run(async page => {
  await startNewAdventure(page);
  await page.evaluate(()=>{gold=700;level=30;saveToSlot(1,false);window.samePageMarker=true;});
  await page.keyboard.press('Escape');
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'메인 메뉴',exact:true}).click();
  await page.waitForFunction(()=>gameState==='menu' && !isPlaying);
  assert.deepEqual(await page.evaluate(()=>({samePage:window.samePageMarker,manual:loadSlotData(1).gold,auto:loadSlotData(1,'auto').gold,
    backup:readSaveRecord(1,'autoBackup').status,level,menuVisible:!document.getElementById('start-screen').classList.contains('hidden')})),
    {samePage:true,manual:700,auto:700,backup:'empty',level:1,menuVisible:true});
  await startNewAdventure(page);
  assert.deepEqual(await page.evaluate(()=>({slot:currentSaveSlot,level,gold,original:loadSlotData(1).gold})),{slot:2,level:1,gold:150,original:700});
}));

test('cancelled or failed menu return preserves the running session', () => run(async page => {
  await startNewAdventure(page);
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{gold=321;});
  page.once('dialog',dialog=>dialog.dismiss());
  await page.getByRole('button',{name:'메인 메뉴',exact:true}).click();
  assert.equal(await page.evaluate(()=>isPlaying && isPaused && gold===321),true);
  await page.evaluate(()=>{window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError')};});
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'메인 메뉴',exact:true}).click();
  assert.equal(await page.evaluate(()=>isPlaying && isPaused && gold===321 && gameState==='village'),true);
  await page.evaluate(()=>{Storage.prototype.setItem=window.originalSet;});
}));

test('repeated new games and loads keep only one animation loop and cancel old session timers', () => run(async page => {
  await page.evaluate(()=>{
    window.staleTimerRan=false;
    setSessionTimeout(()=>{window.staleTimerRan=true;},40);
    startNewGame();startNewGame();
  });
  assert.deepEqual(await page.evaluate(()=>({story:[...window.pendingFrames.values()].filter(name=>name==='storyLoop').length,
    game:[...window.pendingFrames.values()].filter(name=>name==='loop').length})),{story:1,game:0});
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>window.staleTimerRan),false);
  assert.deepEqual(await page.evaluate(()=>{
    while(storyAnimRunning)advanceStory();
    const data=getSaveData();applySaveData(data);applySaveData(data);applySaveData(data);
    return {story:[...window.pendingFrames.values()].filter(name=>name==='storyLoop').length,
      game:[...window.pendingFrames.values()].filter(name=>name==='loop').length};
  }),{story:0,game:1});
}, {init:()=>{
  window.pendingFrames=new Map();
  const raf=window.requestAnimationFrame.bind(window),cancel=window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame=callback=>{
    const id=raf(time=>{window.pendingFrames.delete(id);callback(time);});
    window.pendingFrames.set(id,callback.name);return id;
  };
  window.cancelAnimationFrame=id=>{window.pendingFrames.delete(id);cancel(id);};
}}));

test('movement, pause/resume, weapon switching and three normal attacks work through browser input', () => run(async page => {
  await startNewAdventure(page);
  const before=await page.evaluate(()=>player.x);
  await page.keyboard.down('d');
  await page.waitForFunction(x=>player.x>x+10,before);
  await page.keyboard.up('d');
  await page.keyboard.press('Escape');
  const pausedFrame=await page.evaluate(()=>frameCount);
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>frameCount),pausedFrame);
  await page.getByRole('button',{name:'계속하기',exact:true}).click();
  await page.waitForFunction(frame=>frameCount>frame,pausedFrame);
  await page.evaluate(()=>{
    equipped.sword={...findItemById('sword_iron')};equipped.bow={...findItemById('bow_wood')};equipped.staff={...findItemById('staff_apprentice')};
    activeWeaponSlot='sword';syncActiveWeapon();recalcAllStats();
    gameState='training';setupTraining();player.x=400;player.y=370;
  });
  async function attackAndExpectDamage() {
    const hits=await page.evaluate(()=>trainingStats.hits);
    await page.evaluate(()=>{player.lastAttackTime=0;});
    const rect=await page.locator('#gameCanvas').boundingBox();
    await page.mouse.click(rect.x+rect.width*0.5,rect.y+rect.height/3);
    await page.waitForFunction(value=>trainingStats.hits>value,hits);
  }
  await attackAndExpectDamage();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>activeWeaponSlot),'bow');
  await attackAndExpectDamage();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>activeWeaponSlot),'staff');
  await attackAndExpectDamage();
}));

test('slime dungeon objectives unlock the next stage and survive progress reaches the boss portal', () => run(async page => {
  await startNewAdventure(page);
  await page.evaluate(()=>{
    enterDungeonStage('slime',0,false,true);
    dungeonProgress.slime.progress[0]=TIER_KILL_TARGET-1;
    const last=enemies[0];damageEnemy(last,last.hp,false);
  });
  assert.equal(await page.evaluate(()=>dungeonProgress.slime.progress[0]),25);
  // Use the actual portal collision in the next game frame; accelerate only test prerequisites.
  await page.evaluate(()=>{player.x=400;player.y=130;portalCooldown=0;});
  await page.waitForFunction(()=>currentDungeon.stage===1);
  assert.equal(await page.evaluate(()=>returnStack.at(-1).dungeon.stage),0);
  assert.equal(await page.evaluate(()=>{
    const regular=enemies[0];damageEnemy(regular,regular.hp,false);
    return dungeonProgress.slime.progress[1];
  }),0);
  await page.evaluate(()=>{
    dungeonProgress.slime.progress[1]=TIER_ELITE_TARGET-1;
    const elite=createEliteMob('slime',1);enemies.push(elite);damageEnemy(elite,elite.hp,false);
    player.x=400;player.y=130;portalCooldown=0;
  });
  await page.waitForFunction(()=>currentDungeon.stage===2 && !currentDungeon.isBoss);
  await page.evaluate(()=>{dungeonProgress.slime.progress[2]=TIER_SURVIVE_TARGET-1;});
  await page.waitForFunction(()=>dungeonProgress.slime.progress[2]>=TIER_SURVIVE_TARGET);
  await page.evaluate(()=>{player.x=400;player.y=130;portalCooldown=0;});
  await page.waitForFunction(()=>currentDungeon.isBoss && enemies.some(en=>en.isBoss));
  assert.deepEqual(await page.evaluate(()=>{
    const boss=enemies[0];damageEnemy(boss,boss.hp,false);
    const result={defeated:dungeonProgress.slime.bossDefeated,cooldown:bossRespawnCooldown.slime>0};
    saveToSlot(1,false);doLoadSlot(1);
    return {...result,restored:dungeonProgress.slime.bossDefeated,location:gameState,progress:dungeonProgress.slime.progress};
  }),{defeated:true,cooldown:true,restored:true,location:'village',progress:[25,3,5400]});
}));

test('invalid load leaves the current session and its active effects unchanged', () => run(async page => {
  await startNewAdventure(page);
  assert.deepEqual(await page.evaluate(()=>{
    activeBuffs={atk:{val:50,timeLeft:300}};player.frozenTimer=60;keys={KeyA:true};
    const frame=gameLoopFrame;
    let rejected=false;try{applySaveData({});}catch{rejected=true;}
    return {rejected,buff:activeBuffs.atk.val,frozen:player.frozenTimer,keys,sameLoop:frame===gameLoopFrame,isPlaying};
  }),{rejected:true,buff:50,frozen:60,keys:{KeyA:true},sameLoop:true,isPlaying:true});
}));

for (const [slot,npc,learned,defeated,itemId] of [
  ['sword','minje','learnedSword','minjeDefeated','sword_iron'],
  ['bow','elfqueen','learnedBow','elfQueenDefeated','bow_wood'],
  ['staff','archmage','learnedStaff','archmageDefeated','staff_apprentice']
]) {
  test(`${slot} lesson, awakening trial, rematch and save reload preserve the correct progression`, () => run(async page => {
    await startNewAdventure(page);
    await page.evaluate(({slot,npc,itemId})=>{
      equipped[slot]={...findItemById(itemId)};activeWeaponSlot=slot;syncActiveWeapon();recalcAllStats();openNpcModal(npc);
    },{slot,npc,itemId});
    await page.locator('#npc-action-btn').click();
    await page.evaluate(()=>{damageEnemy(enemies[0],enemies[0].hp,false);closeAlertModal();});
    assert.deepEqual(await page.evaluate(({slot,learned})=>({learned:skills[learned],stage:awakenState[slot].stage}),{slot,learned}),
      {learned:true,stage:'locked'});
    // Supply the long-running prerequisites, then exercise the actual quest and rematch UI.
    await page.evaluate(({npc})=>{demonDefeated=true;openNpcModal(npc);}, {npc});
    if(slot==='staff') await page.locator('#npc-action-btn').click(); // The mage first offers awakening vs. ending.
    await page.locator('#npc-action-btn').click();
    assert.equal(await page.evaluate(slot=>awakenState[slot].stage,slot),'quest');
    await page.evaluate(slot=>{
      awakenState[slot].mats=AWAKEN_DEFS[slot].matNeed;
      if(slot==='sword')towerBestFloor=30;
      if(slot==='bow')awakenState[slot].demonKills=40;
      if(slot==='staff')for(const cat of ['slime','wolf','zombie','ghost'])awakenState[slot].bosses[cat]=true;
      refreshAwakenReady(slot);closeAlertModal();
    },slot);
    assert.equal(await page.evaluate(slot=>awakenState[slot].stage,slot),'ready');
    await page.evaluate(npc=>openNpcModal(npc),npc);
    if(slot==='staff') await page.locator('#npc-action-btn').click();
    await page.locator('#npc-action-btn').click();
    assert.equal(await page.evaluate(()=>enemies[0].awakened),true);
    await page.evaluate(()=>{damageEnemy(enemies[0],enemies[0].hp,false);closeAlertModal();});
    await page.waitForFunction(slot=>document.querySelector('#skill-slot-q .skill-icon').innerText===awakenSkillDefs[slot].q.icon,slot);
    assert.deepEqual(await page.evaluate(({slot,learned,defeated})=>{
      saveToSlot(1,false);doLoadSlot(1); // Loading must not hide or replace the awakened skills with base skills.
      return {learned:skills[learned],stage:awakenState[slot].stage,defeated:getSaveData()[defeated],weapon:activeWeaponSlot};
    },{slot,learned,defeated}),{learned:true,stage:'awakened',defeated:true,weapon:slot});
    await page.locator('#skill-hud').waitFor({state:'visible'});
    await page.locator('#skill-slot-g').waitFor({state:'visible'});
  }));
}

test('ending story stops gameplay, completes once and returns to a clean title screen', () => run(async page => {
  await startNewAdventure(page);
  assert.deepEqual(await page.evaluate(()=>{
    startEndingSequence();
    const stopped={playing:isPlaying,gameFrame:gameLoopFrame};
    while(storyAnimRunning)advanceStory();
    advanceStory(); // A late extra click must not repeat the callback or throw.
    return {...stopped,storyFrame,callback:onStoryComplete,clear:!document.getElementById('clear-screen').classList.contains('hidden')};
  }),{playing:false,gameFrame:null,storyFrame:null,callback:null,clear:true});
  await page.getByRole('button',{name:'처음 화면으로',exact:true}).click();
  await page.waitForFunction(()=>gameState==='menu');
  assert.equal(await page.getByRole('button',{name:'게임 시작',exact:true}).isVisible(),true);
}));

test('session resets preserve sound, shake and autosave preferences while clearing combat buffs', () => run(async page => {
  await startNewAdventure(page);
  await page.evaluate(()=>{
    autoSaveEnabled=false;shakeEnabled=false;sfxMuted=true;activeBuffs={atk:{val:50,timeLeft:300}};
    saveToSlot(1,false);
  });
  await page.keyboard.press('Escape');
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'메인 메뉴',exact:true}).click();
  await startNewAdventure(page);
  assert.deepEqual(await page.evaluate(()=>({autoSaveEnabled,shakeEnabled,sfxMuted,buffs:activeBuffs,auto:readSaveRecord(1,'auto').status})),
    {autoSaveEnabled:false,shakeEnabled:false,sfxMuted:true,buffs:{},auto:'empty'});
}));
