const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {createBrowserHarness,startNewAdventure}=require('./helpers/browser.cjs');
const {run}=createBrowserHarness({before,after});

test('fresh journey points to guild acceptance without automatically accepting or granting rewards',()=>run(async page=>{
  await startNewAdventure(page);
  const result=await page.evaluate(()=>{
    refreshObjectiveUI(true);const goal=currentObjective(),nav=objectiveNavigation(goal);
    return {id:goal.id,target:goal.target.map,quests:activeQuests,gold,nav:nav.point.label};
  });
  assert.deepEqual(result,{id:'quest:q_slime_novice',target:'guild_map',quests:{},gold:150,nav:'모험가 길드 문'});
  assert.ok((await page.locator('#quest-hud-text').innerText()).includes('수락 전'));
}));

test('quest tracking follows acceptance, kill completion, reward collection and fallback',()=>run(async page=>{
  await startNewAdventure(page);
  assert.deepEqual(await page.evaluate(()=>{
    selectObjective('quest:q_slime_novice');const before=activeQuests.q_slime_novice;
    acceptQuest('q_slime_novice');enterDungeonStage('slime',0,false,true);
    activeQuests.q_slime_novice.progress=4;damageEnemy(enemies[0],enemies[0].hp,false);refreshObjectiveUI(true);
    const completed={status:activeQuests.q_slime_novice.status,map:currentObjective().target.map,tracking:trackedObjective};
    turnInQuest('q_slime_novice');refreshObjectiveUI(true);
    return {unaccepted:before===undefined,completed,done:activeQuests.q_slime_novice.status,tracking:trackedObjective,next:currentObjective().id};
  }),{unaccepted:true,completed:{status:'completed',map:'guild_map',tracking:'quest:q_slime_novice'},done:'done',tracking:null,next:'dungeon:slime'});
}));

test('repeat, sub and main quests remain distinct; repeat collection does not silently reaccept',()=>run(async page=>{
  await startNewAdventure(page);
  assert.deepEqual(await page.evaluate(()=>{
    const types=Object.fromEntries(buildObjectives().filter(g=>g.id.startsWith('quest:')).map(g=>[g.id,g.type]));
    acceptQuest('q_slime_hunter');selectObjective('quest:q_slime_hunter');activeQuests.q_slime_hunter={status:'completed',progress:15};
    turnInQuest('q_slime_hunter');refreshObjectiveUI(true);
    return {types:[types['quest:q_slime_novice'],types['quest:q_demon_scout'],types['quest:q_slime_hunter']],
      accepted:!!activeQuests.q_slime_hunter,target:currentObjective().target.map,progress:currentObjective().progress};
  }),{types:['메인 의뢰','서브 의뢰','반복 의뢰'],accepted:false,target:'guild_map',progress:'수락 전'});
}));

test('actual unlock gates are distinct from recommended dungeon levels',()=>run(async page=>{
  await startNewAdventure(page);
  assert.deepEqual(await page.evaluate(()=>{
    const all=buildObjectives(),get=id=>all.find(g=>g.id===id);
    return {wolf:get('dungeon:wolf').locked,demon:get('dungeon:demon').locked,sword:get('skill:sword').locked,
      bow:get('skill:bow').locked,staff:get('skill:staff').locked,awaken:get('awaken:sword').locked,
      tower:get('tower').locked,cannotTrack:selectObjective('skill:bow')===false};
  }),{wolf:'',demon:'마왕성 진입 Lv.80 필요',sword:'왕성 진입 Lv.30 필요',bow:'늑대왕 페릴 처치 필요',staff:'사령왕 처치 필요',
    awaken:'왕성 진입 Lv.30 필요',tower:'대마왕 처치 후 개방',cannotTrack:true});
}));

test('dungeon progress shows kill, elite, survival and boss goals and only points to open portals',()=>run(async page=>{
  await startNewAdventure(page);
  assert.deepEqual(await page.evaluate(()=>{
    selectObjective('dungeon:slime');enterDungeonStage('slime',0,false,true);
    const first=currentObjective();dungeonProgress.slime.progress[0]=25;
    const next=currentObjective(),portal=objectiveNavigation(next);
    enterDungeonStage('slime',1,false,true);
    const blocked=objectiveNavigation({...next,target:dungeonTarget('slime',null,true)});
    dungeonProgress.slime.progress=[25,3,5399];const survive=currentObjective();
    dungeonProgress.slime.progress[2]=5400;const boss=currentObjective();
    return {first:first.detail,next:next.detail,portal:portal.point.y,blocked:blocked.point,survive:survive.progress,boss:boss.target.boss};
  }),{first:'1구역 · 초록 슬라임 · 권장 Lv.1',next:'2구역 · 파랑 슬라임 · 권장 Lv.5',portal:130,blocked:null,
    survive:'1구역 일반 적 처치 25/25마리 / 2구역 정예 처치 3/3마리 / 3구역 90초 생존 89/90초 / 보스 미완료',boss:true});
}));

test('navigation gives only the current-map exit or unlocked local destination',()=>run(async page=>{
  await startNewAdventure(page);
  assert.deepEqual(await page.evaluate(()=>{
    level=40;selectObjective('skill:sword');const fromVillage=objectiveNavigation(currentObjective());
    gameState='castle_entrance';const fromEntrance=objectiveNavigation(currentObjective());
    gameState='castle_inner';const atMaster=objectiveNavigation(currentObjective());
    enterDungeonStage('wolf',0,false,true);const exit=objectiveNavigation(currentObjective());
    trackedObjective='quest:q_slime_novice';acceptQuest('q_slime_novice');enterDungeonStage('slime',2,true,true);
    const wrongBoss=objectiveNavigation(currentObjective());
    gameState='minje_duel';const duel=objectiveNavigation(currentObjective());
    return {village:fromVillage.point.label,entrance:fromEntrance.point.label,master:atMaster.point.label,exit:exit.point.y,wrongBoss:wrongBoss.point.y,duel:duel.point};
  }),{village:'오른쪽 파란 길',entrance:'왕성 문',master:'전설의 용사 민제',exit:850,wrongBoss:850,duel:null});
}));

test('tracking persists in current schema and schema 3 loads in auto mode without changing progress',()=>run(async page=>{
  await startNewAdventure(page);
  assert.deepEqual(await page.evaluate(()=>{
    selectObjective('dungeon:wolf');saveToSlot(1,false);selectObjective(null);doLoadSlot(1);
    const restored=trackedObjective,version=getSaveData().version;
    const old=getSaveData();old.version=3;delete old.trackedObjective;old.gold=777;
    applySaveData(old);const migrated={tracking:trackedObjective,gold};
    const invalid=getSaveData();invalid.trackedObjective='unknown';let rejected=false;try{applySaveData(invalid);}catch{rejected=true;}
    return {restored,version,migrated,rejected,gold};
  }),{restored:'dungeon:wolf',version:7,migrated:{tracking:null,gold:777},rejected:true,gold:777});
}));

test('objective chooser freezes gameplay, shows locked goals and returns through the right pause layer',()=>run(async page=>{
  await startNewAdventure(page);
  await page.locator('#objective-open').click();
  const frame=await page.evaluate(()=>frameCount);await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>frameCount),frame);
  assert.equal(await page.locator('[data-objective="skill:bow"] button').isDisabled(),true);
  await page.locator('[data-objective="dungeon:wolf"] button').click();
  assert.equal(await page.evaluate(()=>trackedObjective),'dungeon:wolf');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'목표와 진행',exact:true}).click();
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>isPaused&&overlayVisible('pause-menu')),true);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>isPaused),false);
}));

test('small-screen objective choice is accessible through info panel and keeps controls in viewport',()=>run(async page=>{
  await startNewAdventure(page);
  await page.getByRole('button',{name:'캐릭터 정보',exact:true}).click();
  await page.locator('#objective-open').click();
  assert.equal(await page.evaluate(()=>openSidePanel),null);
  await page.locator('[data-objective="dungeon:wolf"] button').click();
  await page.getByRole('button',{name:'캐릭터 정보',exact:true}).click();
  assert.ok((await page.locator('#quest-hud-text').innerText()).includes('늑대의 숲'));
  await page.locator('#objective-open').click();
  const size=await page.locator('#objective-screen').evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth}));assert.ok(size.scroll<=size.client);
  await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('#objective-screen')),true);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>overlayVisible('objective-screen')),false);
},{viewport:{width:320,height:360}}));

async function unlockAwakening(page) {
  await page.evaluate(()=>{
    level=90;demonDefeated=true;minjeDefeated=true;elfQueenDefeated=true;archmageDefeated=true;
    skills.learnedSword=true;skills.learnedBow=true;skills.learnedStaff=true;
    dungeonProgress.wolf.bossDefeated=true;dungeonProgress.ghost.bossDefeated=true;
    for(const slot of ['sword','bow','staff'])awakenState[slot]=makeAwakenSlot();
  });
}

test('each awakening points from trial acceptance to missing materials, tasks and rematch',()=>run(async page=>{
  await startNewAdventure(page);await unlockAwakening(page);
  assert.deepEqual(await page.evaluate(()=>{
    const find=slot=>buildObjectives().find(g=>g.id==='awaken:'+slot);
    const acceptance=find('sword').target.map;
    for(const slot of ['sword','bow','staff'])awakenState[slot].stage='quest';
    const mats=['sword','bow','staff'].map(slot=>find(slot).target.category);
    for(const slot of ['sword','bow','staff'])awakenState[slot].mats=3;
    towerBestFloor=29;awakenState.bow.demonKills=39;awakenState.staff.bosses={slime:true,wolf:true,zombie:false,ghost:false};
    const tasks=[find('sword').target.map,find('bow').target.category,find('staff').target.category];
    awakenState.sword.stage='ready';const ready=find('sword');
    awakenState.sword.stage='awakened';const completed=find('sword');
    return {acceptance,mats,tasks,readyMap:ready.target.map,rematch:ready.detail.includes('재대결'),complete:completed.complete};
  }),{acceptance:'castle_inner',mats:['slime','wolf','ghost'],tasks:['tower','demon','zombie'],readyMap:'castle_inner',rematch:true,complete:true});
}));

test('finishing tower floor 30 after collecting materials actually unlocks the sword rematch',()=>run(async page=>{
  await startNewAdventure(page);await unlockAwakening(page);
  assert.deepEqual(await page.evaluate(()=>{
    awakenState.sword.stage='quest';awakenState.sword.mats=3;towerBestFloor=29;
    selectObjective('awaken:sword');enterTowerAt(30);
    const boss=enemies[0];damageEnemy(boss,boss.hp,false);refreshObjectiveUI(true);
    return {best:towerBestFloor,stage:awakenState.sword.stage,target:currentObjective().target.map,
      exit:objectiveNavigation(currentObjective()).point.y,notice:document.getElementById('alert-title').textContent.includes('각성 준비 완료')};
  }),{best:30,stage:'ready',target:'castle_inner',exit:850,notice:true});
}));

test('loaded fulfilled awakening tasks reconcile readiness without awarding victory',()=>run(async page=>{
  await startNewAdventure(page);await unlockAwakening(page);
  assert.deepEqual(await page.evaluate(()=>{
    trackedObjective='awaken:sword';awakenState.sword.stage='quest';awakenState.sword.mats=3;towerBestFloor=30;
    const saved=getSaveData();applySaveData(saved);
    return {stage:awakenState.sword.stage,tracked:trackedObjective,detail:currentObjective().detail,alert:overlayVisible('alert-modal')};
  }),{stage:'ready',tracked:'awaken:sword',detail:'재료와 과제 완료! 스승과 각성 재대결에서 승리하세요.',alert:false});
}));

test('completed or newly locked tracked goals fall back without pointing to inaccessible locations',()=>run(async page=>{
  await startNewAdventure(page);
  assert.deepEqual(await page.evaluate(()=>{
    level=30;selectObjective('skill:sword');level=1;refreshObjectiveUI(true);
    const locked={tracking:trackedObjective,id:currentObjective().id};
    level=40;selectObjective('dungeon:wolf');dungeonProgress.wolf.bossDefeated=true;refreshObjectiveUI(true);
    const done={tracking:trackedObjective,id:currentObjective().id};
    return {locked,done};
  }),{locked:{tracking:null,id:'quest:q_slime_novice'},done:{tracking:null,id:'skill:sword'}});
}));

test('current schema rejects malformed tracking metadata atomically',()=>run(async page=>{
  await startNewAdventure(page);
  assert.equal(await page.evaluate(()=>{
    selectObjective('dungeon:wolf');const original=getSaveData(),bad=[{},42,'no-such-goal',undefined];
    return bad.every(value=>{const data={...original,trackedObjective:value};try{applySaveData(data);return false;}catch{return trackedObjective==='dungeon:wolf'&&gold===original.gold;}});
  }),true);
}));

test('focus loss inside objective menu requires returning through pause; no hidden gameplay input leaks',()=>run(async page=>{
  await startNewAdventure(page);
  await page.locator('#objective-open').click();
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>isPaused&&overlayVisible('pause-menu')&&!overlayVisible('objective-screen')),true);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>isPaused),false);
}));
