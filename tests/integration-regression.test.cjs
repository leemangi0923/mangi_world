const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {createBrowserHarness,startNewAdventure}=require('./helpers/browser.cjs');const {manualAnimationClock}=require('./helpers/manual-clock.cjs');const {run}=createBrowserHarness({before,after});const options={init:manualAnimationClock};
test('journey checkpoints connect guild, bosses, tower awakening and ending without duplicate rewards',()=>run(async page=>{
 await startNewAdventure(page);
 const r=await page.evaluate(()=>{
  setDifficulty('hard');acceptQuest('q_slime_novice');enterDungeonStage('slime',0,false,false);
  for(let i=0;i<5;i++){const en=createDungeonMob('slime',0,300,300);enemies=[en];damageEnemy(en,en.hp+1,false);}
  const completed=activeQuests.q_slime_novice.status;gameState='guild_map';turnInQuest('q_slime_novice');const once=gold;turnInQuest('q_slime_novice');const unique=gold===once;
  // Prepare the long progression gates, then use the real kill/awakening/ending handlers.
  level=100;nextExp=expForLevel(level);exp=0;
  for(const cat of TOWER_CATS){dungeonProgress[cat].progress=dungeonDefs[cat].tiers.map(t=>t.target);enterDungeonStage(cat,2,true,false);damageEnemy(enemies[0],1e9,false);closeAlertModal();}
  const bosses=TOWER_CATS.every(cat=>dungeonProgress[cat].bossDefeated)&&demonDefeated;
  minjeDefeated=elfQueenDefeated=archmageDefeated=true;skills.learnedSword=skills.learnedBow=skills.learnedStaff=true;
  awakenState.sword={...makeAwakenSlot(),stage:'quest',mats:AWAKEN_DEFS.sword.matNeed};enterTowerAt(30);damageEnemy(enemies[0],1e9,false);closeAlertModal();
  const ready=awakenState.sword.stage;startMinjeDuel(true);damageEnemy(enemies[0],1e9,false);closeAlertModal();
  saveToSlot(1,false);doLoadSlot(1);const loaded={mode:difficulty,awaken:awakenState.sword.stage,best:towerBestFloor};
  gameState='mage_tower';openNpcModal('archmage');document.getElementById('npc-action-btn2').click();document.getElementById('npc-action-btn').click();
  const story=gameState==='story'&&!isPlaying;while(storyAnimRunning)advanceStory();advanceStory();
  return {completed,unique,bosses,ready,loaded,story,clear:overlayVisible('clear-screen'),seen:seenStories().includes('ending')};
 });
 assert.deepEqual(r,{completed:'completed',unique:true,bosses:true,ready:'ready',loaded:{mode:'hard',awaken:'awakened',best:30},story:true,clear:true,seen:true});
},options));

test('ending and new stories hide battle summary and buff HUD while preserving singular completion',()=>run(async page=>{
 await startNewAdventure(page);const r=await page.evaluate(()=>{
  enterDungeonStage('slime',2,true,false);drawBattleReadability();document.getElementById('buff-hud').classList.remove('hidden');const visible=overlayVisible('battle-summary');
  showTopNotification('이전 전투 알림');startEndingSequence();const hidden=!overlayVisible('battle-summary')&&!overlayVisible('buff-hud')&&!document.getElementById('top-notification').classList.contains('show');while(storyAnimRunning)advanceStory();
  document.getElementById('clear-screen').classList.add('hidden');document.getElementById('battle-summary').classList.remove('hidden');let done=0;beginStory(storyScripts,()=>done++);const introHidden=!overlayVisible('battle-summary');while(storyAnimRunning)advanceStory();advanceStory();
  return {visible,hidden,introHidden,done,route:endingScripts.some(s=>s.text.includes('대마법사의 탑'))};
 });assert.deepEqual(r,{visible:true,hidden:true,introHidden:true,done:1,route:true});
},options));

for(const mode of ['easy','normal','hard'])test(`${mode}: four simulated minutes of eight boss/teacher arenas stay finite and bounded`,()=>run(async page=>{
 await startNewAdventure(page);
 const report=await page.evaluate(mode=>{
  difficulty=mode;adminMode.active=true;adminMode.invincible=true;autoSaveEnabled=false;accessibility.hitStop=false;sfxMuted=true;
  let seed=123456789;const random=Math.random;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  const reports=[];ctx.save();ctx.beginPath();ctx.rect(0,0,0,0);ctx.clip();
  try{
   for(const kind of [...TOWER_CATS,'sword','bow','staff']){
    clearBattleRuntime();player.x=400;player.y=500;hp=maxHp;mp=maxMp;portalCooldown=999999;
    if(TOWER_CATS.includes(kind))enterDungeonStage(kind,2,true,false);else ({sword:startMinjeDuel,bow:startElfQueenDuel,staff:startMageDuel})[kind](true);
    portalCooldown=999999;let peakProjectiles=0,peakZones=0,peakEnemies=0,finite=true;const began=frameCount;
    for(let frame=0;frame<1800;frame++){
     stepGame(false);peakProjectiles=Math.max(peakProjectiles,projectiles.length+encounterShots.length);peakEnemies=Math.max(peakEnemies,enemies.length);
     peakZones=Math.max(peakZones,[slimeZones,ghostZones,demonZones,encounterHazards,minjeZones,elfZones,archmageZones].reduce((n,a)=>n+a.length,0));
     if(![hp,mp,player.x,player.y,...enemies.flatMap(en=>[en.x,en.y,en.hp]),...projectiles.flatMap(p=>[p.x,p.y,p.life]),...encounterShots.flatMap(p=>[p.x,p.y,p.life])].every(Number.isFinite)){finite=false;break;}
    }
    reports.push({kind,steps:frameCount-began,peakProjectiles,peakZones,peakEnemies,finite});
   }
  }finally{ctx.restore();Math.random=random;}
  return reports;
 },mode);
 for(const result of report){assert.equal(result.finite,true,JSON.stringify(result));assert.equal(result.steps,1800);assert.ok(result.peakProjectiles<256,JSON.stringify(result));assert.ok(result.peakZones<128,JSON.stringify(result));assert.ok(result.peakEnemies<64,JSON.stringify(result));}
 console.log(mode+' arena peaks '+JSON.stringify(report));
},options));

test('legacy migration, custom controls, difficulty and admin reload recovery survive in one session',()=>run(async page=>{
 await startNewAdventure(page);
 await page.evaluate(()=>{const old=getSaveData();old.version=5;delete old.difficulty;applySaveData(old);setDifficulty('hard');gold=834;lockedEquipment.sword=true;trackedObjective='dungeon:slime';accessibility.bindings.KeyW='ArrowUp';persistPreferences();saveToSlot(2,false);openSettingsModal();document.getElementById('admin-code').value='6974';enterAdminMode();adminPreset('tower');gold=999999;});
 await page.reload();
 const r=await page.evaluate(()=>({mode:difficulty,gold,admin:adminMode.active,move:accessibility.bindings.KeyW,locked:lockedEquipment.sword,goal:trackedObjective,record:readSaveRecord(2).data.gold,paused:isPaused}));
 assert.deepEqual(r,{mode:'hard',gold:834,admin:false,move:'ArrowUp',locked:true,goal:'dungeon:slime',record:834,paused:true});
},options));

test('ending autosaves final progress before stopping; failed writes keep the session playable',()=>run(async page=>{
 await startNewAdventure(page);const r=await page.evaluate(()=>{
  gameState='mage_tower';demonDefeated=true;archmageDefeated=true;skills.learnedStaff=true;setDifficulty('hard');gold=672;
  const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===saveKey(currentSaveSlot,'auto'))throw new Error('blocked');return original.call(this,key,value);};
  startEndingSequence();const blocked=isPlaying&&!storyAnimRunning&&gameState==='mage_tower'&&gold===672;
  Storage.prototype.setItem=original;startEndingSequence();const record=readSaveRecord(currentSaveSlot,'auto');
  return {blocked,playing:isPlaying,status:record.status,demon:record.data.demonDefeated,mode:record.data.difficulty,gold:record.data.gold,location:record.data.gameState};
 });assert.deepEqual(r,{blocked:true,playing:false,status:'valid',demon:true,mode:'hard',gold:672,location:'mage_tower'});
},options));
