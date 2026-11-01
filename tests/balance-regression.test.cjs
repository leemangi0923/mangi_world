const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {createBrowserHarness,startNewAdventure}=require('./helpers/browser.cjs');const {manualAnimationClock}=require('./helpers/manual-clock.cjs');const {run}=createBrowserHarness({before,after});const options={init:manualAnimationClock};
for(const mode of ['easy','normal','hard'])test(mode+' scales real damage, enemy HP and preserves rewards',()=>run(async page=>{
 await startNewAdventure(page);const r=await page.evaluate(mode=>{difficulty='normal';const base=createDungeonBoss('wolf'),baseMob=createDungeonMob('slime',0),damage=mitigateDamage(100);difficulty=mode;const boss=createDungeonBoss('wolf'),mob=createDungeonMob('slime',0);return {hp:boss.hp/base.hp,mob:mob.hp/baseMob.hp,damage:mitigateDamage(100)/damage,exp:boss.exp===base.exp,gold:mob.gold===baseMob.gold,profile:difficultyProfile()};},mode);
 assert.ok(Math.abs(r.hp-r.profile.hp)<1e-9);assert.ok(Math.abs(r.mob-r.profile.hp)<1e-9);assert.equal(r.damage,r.profile.incoming);assert.equal(r.exp,true);assert.equal(r.gold,true);
},options));
test('safe-zone change preserves resources; every combat map rejects changes and keeps the encounter',()=>run(async page=>{
 await startNewAdventure(page);const r=await page.evaluate(()=>{gold=73;hp=41;mp=17;skills.cooldowns.q=90;setDifficulty('easy');const safe={gold,hp,mp,cd:skills.cooldowns.q};const blocked=[];for(const state of COMBAT_STATES){gameState=state;blocked.push(setDifficulty('hard')===false&&difficulty==='easy');}return {safe,blocked};});assert.deepEqual(r.safe,{gold:73,hp:41,mp:17,cd:90});assert.ok(r.blocked.every(Boolean));
},options));
test('start selection applies to a fresh adventure and current saves; old versions migrate to normal',()=>run(async page=>{
 await page.evaluate(()=>{setDifficulty('hard');startNewGame();while(storyAnimRunning)advanceStory();});
 const r=await page.evaluate(()=>{const save=getSaveData();applySaveData(save);const restored=difficulty;const old={...save,version:5};delete old.difficulty;old.exp=20;old.nextExp=55;const migrated=normalizeSaveData(old);let bad=0;for(const value of [undefined,'nightmare',null,1])try{normalizeSaveData({...save,difficulty:value});}catch{bad++;}return {restored,version:save.version,migrated:migrated.difficulty,exp:migrated.exp,next:migrated.nextExp,bad};});assert.deepEqual(r,{restored:'hard',version:7,migrated:'normal',exp:19,next:54,bad:4});
},options));
test('easy warning and zones arm once and render safely through extended telegraphs',()=>run(async page=>{
 await startNewAdventure(page);const r=await page.evaluate(()=>{setDifficulty('easy');enterDungeonStage('wolf',2,true,false);const boss=enemies[0];boss.state='telegraph';boss.stateTimer=40;armDifficultyWarning(boss);const first=boss.stateTimer;armDifficultyWarning(boss);const second=boss.stateTimer;const zones=[{x:player.x,y:player.y,r:30,timer:60,totalTimer:60,dmg:3}];armDifficultyZones(zones);armDifficultyZones(zones);drawDungeonMob(boss,0);drawZoneArray(zones,'#f00','#f00');
 for(const [create,draw] of [[createMinjeBoss,drawMinjeBoss],[createElfQueenBoss,drawElfQueenBoss],[createArchmageBoss,drawArchmageBoss]]){const b=create(false);b.state='spin_wind';b.stateTimer=45;draw(b,1);}return {first,second,zone:zones[0].timer,total:zones[0].totalTimer};});assert.deepEqual(r,{first:52,second:52,zone:78,total:78});
},options));
test('admin difficulty testing is isolated and retry keeps the chosen difficulty',()=>run(async page=>{
 await startNewAdventure(page);await page.evaluate(()=>{setDifficulty('hard');openSettingsModal();document.getElementById('admin-code').value='6974';enterAdminMode();document.getElementById('admin-difficulty').value='easy';adminChangeDifficulty();document.getElementById('admin-dungeon-stage').value='boss';adminStartEncounter();});
 const r=await page.evaluate(()=>{const max=enemies[0].maxHp;applyPlayerDamage(99999,'적');respawnPlayerAtInn();const retried=retryCombat(),same=enemies[0].maxHp===max,mode=difficulty;exitAdminMode();return {retried,same,mode,restored:difficulty};});assert.deepEqual(r,{retried:true,same:true,mode:'easy',restored:'hard'});
},options));
test('deterministic weapon and growth benchmark documents intended balance rather than only implementation shape',()=>run(async page=>{
 await startNewAdventure(page);const r=await page.evaluate(()=>{statCrit=0;critChance=0;const original=Math.random;Math.random=()=>.99;const samples={};for(const slot of ['sword','bow','staff']){activeWeaponSlot=slot;samples[slot]=rollPlayerDamage(slot==='bow'?1.3:slot==='staff'?1.1:1).dmg;}Math.random=original;return {samples,base:getPlayerAttackPower(),mob:mobHpForLevel(100),boss:bossHpForLevel(100),xp:expForLevel(100)};});
 assert.equal(r.mob,2065);assert.equal(r.boss,14400);assert.equal(r.xp,27240);assert.ok(Math.abs(r.samples.sword/r.base-.945)<1e-9);assert.ok(Math.abs(r.samples.bow/r.base-.936)<1e-9);assert.ok(Math.abs(r.samples.staff/r.base-.858)<1e-9);
},options));
test('low health cue and combat summaries render on compact viewport with effects disabled',()=>run(async page=>{
 await startNewAdventure(page);await page.evaluate(()=>{hp=20;updateHUD();accessibility.effects=0;enterDungeonStage('slime',2,true,false);drawBattleReadability();});assert.equal(await page.locator('#status-hud').evaluate(el=>el.classList.contains('critical-health')),true);assert.equal(await page.locator('#battle-summary').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=12 && el.getBoundingClientRect().right<=innerWidth),true);
},{...options,viewport:{width:320,height:360}}));
test('admin presets retain selected difficulty and the theoretical DPS table stays pure',()=>run(async page=>{
 await page.evaluate(()=>{openSettingsModal();document.getElementById('admin-code').value='6974';enterAdminMode();setDifficulty('hard');adminPreset('mid');});const r=await page.evaluate(()=>{const before=JSON.stringify(getSaveData(),(k,v)=>k==='savedAt'?0:v),text=weaponBalanceSummary();return {mode:difficulty,pure:before===JSON.stringify(getSaveData(),(k,v)=>k==='savedAt'?0:v),text,interval:attackIntervalMs('bow',10,false)};});assert.equal(r.mode,'hard');assert.equal(r.pure,true);assert.match(r.text,/검/);assert.match(r.text,/활/);assert.equal(r.interval,620);
},options));

test('repeated same-name windups get one easy extension per new attack',()=>run(async page=>{
 await startNewAdventure(page);const r=await page.evaluate(()=>{setDifficulty('easy');gameState='dungeon';const en={state:'d8_wind',stateTimer:20};armDifficultyWarning(en);const first=en.stateTimer;en.stateTimer=1;armDifficultyWarning(en);en.stateTimer=20;armDifficultyWarning(en);const second=en.stateTimer;armDifficultyWarning(en);return {first,second,last:en.stateTimer};});assert.deepEqual(r,{first:26,second:26,last:26});
},options));
