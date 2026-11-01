const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {createBrowserHarness,startNewAdventure}=require('./helpers/browser.cjs');
const {manualAnimationClock}=require('./helpers/manual-clock.cjs');
const {run}=createBrowserHarness({before,after});
const options={init:manualAnimationClock};
const readyBoss=()=>{
  dungeonProgress.slime.progress=dungeonDefs.slime.tiers.map(t=>t.target);
  returnStack=[{state:'portal_room',x:150,y:190}];
  enterDungeonStage('slime',2,true,false);
};

test('real contact damage records mitigated value and attacker without changing damage rules',()=>run(async page=>{
  await startNewAdventure(page);
  const value=await page.evaluate(()=>{
    enterDungeonStage('slime',0,false,false);const en=enemies[0];
    en.x=player.x;en.y=player.y;en.hitTimer=0;en.state='idle';en.aiType='chase';
    const amount=mitigateDamage(8+en.level*1.2),before=hp;updateDungeonMobAI(en);
    return {amount,loss:before-hp,hit:damageLog.at(-1),name:en.name};
  });
  assert.ok(Math.abs(value.loss-value.amount)<1e-9);assert.equal(value.hit.amount,value.amount);assert.equal(value.hit.source,value.name);
},options));

test('projectiles retain source and zones report freeze with actual timers',()=>run(async page=>{
  await startNewAdventure(page);
  const value=await page.evaluate(()=>{
    startMageDuel(false);projectiles=[{x:player.x,y:player.y,vx:0,vy:0,r:8,dmg:10,life:10,color:'#fff',source:'시험 마법사'}];
    const expected=mitigateDamage(10);updateAndDrawProjectiles();const projectile={...damageLog.at(-1)};
    archmageZones=[{x:player.x,y:player.y,r:50,timer:1,dmg:3,freeze:90}];tickZoneArray(archmageZones,'대마법사 에녹');
    return {expected,projectile,zone:damageLog.at(-1),frozen:player.frozenTimer,zones:archmageZones.length};
  });
  assert.equal(value.projectile.source,'시험 마법사');assert.equal(value.projectile.attack,'투사체');assert.equal(value.projectile.amount,value.expected);
  assert.equal(value.zone.attack,'범위 공격');assert.equal(value.frozen,90);assert.equal(value.zones,0);
},options));

test('fatal hit clears hazards, abilities and statuses once, preserving death penalties',()=>run(async page=>{
  await startNewAdventure(page);await page.evaluate(readyBoss);
  const value=await page.evaluate(()=>{
    gold=123;towerFloor=12;towerBestFloor=30;exp=7;player.frozenTimer=90;player.knockbackTimer=20;
    projectiles=[{life:10}];pendingSpawns=[{}];ghostDecoys=[{}];slimeZones=[{timer:100}];meteors=[{}];fireZones=[{}];
    skills.cooldowns.q=50;activeBuffs={def:{val:10,timeLeft:100}};
    const old=enemies[0];applyPlayerDamage(999,'슬라임 왕','범위 공격');respawnPlayerAtInn();
    const death=lastDeath;respawnPlayerAtInn();updateSlimeBossAI(old);damageEnemy(old,999999,false);handleEnemyDeath(old);
    return {state:gameState,hp,maxHp,mp,maxMp,gold,exp,towerFloor,towerBestFloor,death,same:death===lastDeath,
      arrays:[enemies,projectiles,pendingSpawns,ghostDecoys,slimeZones,meteors,fireZones].map(a=>a.length),
      frozen:player.frozenTimer,knockback:player.knockbackTimer,cd:skills.cooldowns.q,buffs:Object.keys(activeBuffs),log:damageLog.length};
  });
  assert.equal(value.state,'inn');assert.equal(value.hp,value.maxHp);assert.equal(value.mp,value.maxMp);assert.equal(value.gold,0);
  assert.equal(value.exp,7);assert.equal(value.towerFloor,0);assert.equal(value.towerBestFloor,30);assert.equal(value.death.gold,123);assert.equal(value.same,true);
  assert.deepEqual(value.arrays,[0,0,0,0,0,0,0]);assert.equal(value.frozen,0);assert.equal(value.knockback,0);assert.equal(value.cd,0);assert.deepEqual(value.buffs,[]);assert.equal(value.log,1);
  await assert.doesNotReject(()=>page.getByRole('heading',{name:'전투 패배'}).waitFor());
  assert.equal(await page.locator('#top-notification').evaluate(el=>el.classList.contains('show')),false);
},options));

test('valid dungeon retry makes a fresh boss without refunds or duplicate rewards',()=>run(async page=>{
  await startNewAdventure(page);await page.evaluate(readyBoss);
  const value=await page.evaluate(()=>{
    const old=enemies[0];old.hp=1;gold=90;exp=12;const saved=JSON.stringify(inventory);
    applyPlayerDamage(999,'슬라임 왕');respawnPlayerAtInn();const first=retryCombat(),fresh=enemies[0];const second=retryCombat();
    const before=gold;handleEnemyDeath(old);
    return {first,second,state:gameState,fresh:fresh!==old,full:fresh.hp===fresh.maxHp,hp:hp===maxHp,mp:mp===maxMp,
      gold,exp,sameInventory:saved===JSON.stringify(inventory),noReward:gold===before,returns:returnStack,ticket:!!retryTicket};
  });
  assert.equal(value.first,true);assert.equal(value.second,false);assert.equal(value.state,'dungeon');assert.equal(value.fresh,true);assert.equal(value.full,true);
  assert.equal(value.hp,true);assert.equal(value.mp,true);assert.equal(value.gold,0);assert.equal(value.exp,12);assert.equal(value.sameInventory,true);assert.equal(value.noReward,true);assert.equal(value.ticket,true);
  assert.deepEqual(value.returns,[{state:'portal_room',x:150,y:190}]);
},options));

for(const scenario of ['locked','cooldown','tower','leftBoss']) test(`${scenario} cannot bypass encounter rules with retry`,()=>run(async page=>{
  await startNewAdventure(page);
  const result=await page.evaluate(scenario=>{
    dungeonProgress.slime.progress=dungeonDefs.slime.tiers.map(t=>t.target);enterDungeonStage('slime',2,true,false);
    if(scenario==='locked')dungeonProgress.slime.progress[0]=0;
    if(scenario==='cooldown')bossRespawnCooldown.slime=600;
    if(scenario==='tower'){gameState='tower';towerFloor=5;enemies[0].isTowerMob=true;}
    if(scenario==='leftBoss'){currentDungeon.isBoss=false;enemies=[createDungeonMob('slime',0)];}
    applyPlayerDamage(999,'적');respawnPlayerAtInn();return {retry:retryCombat(),hidden:document.getElementById('combat-retry').classList.contains('hidden')};
  },scenario);
  assert.deepEqual(result,{retry:false,hidden:true});
},options));

for(const [slot,start] of [['sword','startMinjeDuel'],['bow','startElfQueenDuel'],['staff','startMageDuel']]){
  for(const awakened of [false,true])test(`${slot} ${awakened?'awakened':'normal'} duel retry retains fight kind and consumes no progression`,()=>run(async page=>{
    await startNewAdventure(page);
    const result=await page.evaluate(({slot,start,awakened})=>{
      level=80;dungeonProgress.wolf.bossDefeated=true;dungeonProgress.ghost.bossDefeated=true;
      if(awakened){demonDefeated=true;minjeDefeated=true;elfQueenDefeated=true;archmageDefeated=true;skills.learnedSword=true;skills.learnedBow=true;skills.learnedStaff=true;awakenState[slot].stage='ready';}
      window[start](awakened);const old=enemies[0];applyPlayerDamage(99999,old.name);respawnPlayerAtInn();
      const retried=retryCombat(),boss=enemies[0];return {retried,awakened:boss.awakened,fresh:boss!==old,full:boss.hp===boss.maxHp,stage:awakenState[slot].stage};
    },{slot,start,awakened});
    assert.equal(result.retried,true);assert.equal(result.awakened,awakened);assert.equal(result.fresh,true);assert.equal(result.full,true);if(awakened)assert.equal(result.stage,'ready');
  },options));
}

test('victory and save loading invalidate retry and runtime history',()=>run(async page=>{
  await startNewAdventure(page);await page.evaluate(readyBoss);
  const result=await page.evaluate(()=>{
    applyPlayerDamage(1,'적');damageEnemy(enemies[0],999999,false);const afterVictory=retryTicket;
    const save=getSaveData();applySaveData(save);return {afterVictory,logs:damageLog.length,ticket:retryTicket,death:lastDeath,mode:combatReportMode,version:getSaveData().version};
  });
  assert.deepEqual(result,{afterVictory:null,logs:0,ticket:null,death:null,mode:null,version:6});
},options));

test('history pauses combat, traps focus and returns to pause without revoking active retry',()=>run(async page=>{
  await startNewAdventure(page);await page.evaluate(readyBoss);await page.evaluate(()=>{togglePauseMenu();openCombatHistory();});
  await page.keyboard.press('Tab');assert.equal(await page.locator('#combat-report-content').evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#pause-menu').isVisible(),true);
  assert.deepEqual(await page.evaluate(()=>({paused:isPaused,ticket:!!retryTicket})),{paused:true,ticket:true});
},options));

test('compact defeat report scrolls and keeps actions within the stage',()=>run(async page=>{
  await startNewAdventure(page);await page.evaluate(readyBoss);
  await page.evaluate(()=>{for(let i=0;i<8;i++)applyPlayerDamage(1,'긴 공격자 이름','범위 공격');applyPlayerDamage(999,'슬라임 왕');respawnPlayerAtInn();});
  const result=await page.locator('#combat-report-screen').evaluate(el=>{
    const stage=document.getElementById('game-stage').getBoundingClientRect(),box=el.getBoundingClientRect();
    return {inside:box.left>=stage.left&&box.right<=stage.right+1,buttons:[...el.querySelectorAll('button')].filter(b=>!b.classList.contains('hidden')).every(b=>{const r=b.getBoundingClientRect();return r.top>=box.top&&r.bottom<=box.bottom+1;}),logs:damageLog.length};
  });
  assert.deepEqual(result,{inside:true,buttons:true,logs:8});
  assert.equal(await page.locator('#combat-report-content').evaluate(el=>{el.scrollTop=el.scrollHeight;const last=el.lastElementChild.lastElementChild.getBoundingClientRect();return el.scrollHeight>el.clientHeight && last.bottom<=el.getBoundingClientRect().bottom+1;}),true);
},{...options,viewport:{width:320,height:360}}));

test('first intro cannot skip; completed intro skips once with one gift and survives reload',()=>run(async page=>{
  await page.getByRole('button',{name:'게임 시작',exact:true}).click();await page.getByRole('button',{name:'새로운 모험 시작',exact:true}).first().click();
  assert.equal(await page.locator('#story-skip').isVisible(),false);
  assert.equal(await page.evaluate(()=>{skipSeenStory();return storyIndex;}),0);
  await page.evaluate(()=>{while(storyAnimRunning)advanceStory();});
  assert.equal(await page.evaluate(()=>gold),150);
  await page.reload();await page.getByRole('button',{name:'게임 시작',exact:true}).click();await page.getByRole('button',{name:'새로운 모험 시작',exact:true}).first().click();
  await page.locator('#story-skip').click();
  assert.deepEqual(await page.evaluate(()=>{skipSeenStory();advanceStory();return {gold,state:gameState,playing:isPlaying};}),{gold:150,state:'village',playing:true});
},options));

test('ending completion marks only ending and repeated skip completes once',()=>run(async page=>{
  const result=await page.evaluate(()=>{
    let completed=0;beginStory(endingScripts,()=>completed++);skipSeenStory();const first=storyIndex;
    while(storyAnimRunning)advanceStory();beginStory(endingScripts,()=>completed++);skipSeenStory();skipSeenStory();advanceStory();
    return {first,completed,seen:seenStories()};
  });
  assert.deepEqual(result,{first:0,completed:2,seen:['ending']});
},options));

test('life drain is attributed as periodic damage and stops outside its beam',()=>run(async page=>{
  await startNewAdventure(page);
  const result=await page.evaluate(()=>{
    enterDungeonStage('zombie',2,true,false);const boss=enemies[0];
    boss.x=300;boss.y=500;player.x=450;player.y=500;beginEncounterAttack(boss,'drain');boss.encounterAttack.left=1;
    updateZombieBossAI(boss);const hit=damageLog.at(-1),shape=encounterShape(boss,boss.encounterAttack),inside=encounterContains(shape,player.x,player.y);
    player.y=600;for(let i=0;i<18;i++)updateZombieBossAI(boss);
    return {inside,outside:encounterContains(shape,player.x,player.y),hit,count:damageLog.length};
  });
  assert.equal(result.inside,true);assert.equal(result.outside,false);assert.equal(result.hit.attack,'생명력 흡수 (주기 피해)');assert.equal(result.count,1);
},options));

test('actual fatal simulation tick opens report and repeated retry death creates a fresh ticket',()=>run(async page=>{
  await startNewAdventure(page);await page.evaluate(readyBoss);
  const result=await page.evaluate(()=>{
    hp=1;const boss=enemies[0];boss.x=player.x;boss.y=player.y;beginSlimeAttack(boss,'sweep');boss.slimeAttack.phase='active';boss.slimeAttack.left=12;boss.slimeAttack.angle=0;
    stepGame(false);const first={state:gameState,report:combatReportMode,log:damageLog.length};
    const retry=retryCombat();applyPlayerDamage(9999,'슬라임 왕');respawnPlayerAtInn();
    const second=retryCombat();return {first,retry,second,state:gameState,gold};
  });
  assert.deepEqual(result,{first:{state:'inn',report:'death',log:1},retry:true,second:true,state:'dungeon',gold:0});
},options));

test('retry rechecks changed prerequisites and closing defeat forfeits the ticket',()=>run(async page=>{
  await startNewAdventure(page);await page.evaluate(readyBoss);
  const result=await page.evaluate(()=>{
    applyPlayerDamage(9999,'슬라임 왕');respawnPlayerAtInn();bossRespawnCooldown.slime=60;
    const blocked=retryCombat();bossRespawnCooldown.slime=0;closeCombatReport();
    return {blocked,afterClose:retryCombat(),ticket:retryTicket,state:gameState};
  });
  assert.deepEqual(result,{blocked:false,afterClose:false,ticket:null,state:'inn'});
},options));
