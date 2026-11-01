const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {createBrowserHarness,startNewAdventure}=require('./helpers/browser.cjs');
const {manualAnimationClock}=require('./helpers/manual-clock.cjs');
const {run}=createBrowserHarness({before,after});
const options={init:manualAnimationClock};
async function enter(page,code='6974'){
  await page.evaluate(()=>openSettingsModal());await page.locator('#admin-code').fill(code);
  await page.locator('#admin-unlock-form button').click();
  if(await page.locator('#admin-panel').isVisible())await page.locator('#admin-panel details').evaluateAll(list=>list.forEach(el=>el.open=true));
}
const ordinarySnapshot=()=>Object.fromEntries(Object.keys(localStorage).filter(k=>/^mangiworld_save_[123](?:_|$)/.test(k)).sort().map(k=>[k,localStorage.getItem(k)]));

test('wrong code and inactive tool calls cannot change the session or normal saves',()=>run(async page=>{
  const before=await page.evaluate(()=>JSON.stringify(getSaveData(),(k,v)=>k==='savedAt'?0:v));await enter(page,'0000');
  assert.match(await page.locator('#admin-auth-status').textContent(),/올바르지/);
  assert.equal(await page.evaluate(()=>adminMode.active),false);
  const after=await page.evaluate(()=>{adminPreset('tower');adminHeal();adminGrantItem();adminSetProgress();adminStartEncounter();setAdminFlag('invincible',true);return JSON.stringify(getSaveData(),(k,v)=>k==='savedAt'?0:v);});
  assert.equal(before,after);assert.equal(await page.evaluate(()=>localStorage.getItem(ADMIN_RETURN_KEY)),null);
},options));

test('correct code opens isolated tools from start and exits back to start',()=>run(async page=>{
  await enter(page);assert.equal(await page.locator('#admin-panel').isVisible(),true);assert.equal(await page.locator('#admin-badge').isVisible(),true);
  assert.deepEqual(await page.evaluate(()=>({active:adminMode.active,playing:isPlaying,paused:gameplayPaused(),record:JSON.parse(localStorage.getItem(ADMIN_RETURN_KEY)).playing})),{active:true,playing:true,paused:true,record:false});
  assert.equal(await page.evaluate(()=>exitAdminMode()),true);
  assert.deepEqual(await page.evaluate(()=>({active:adminMode.active,start:overlayVisible('start-screen'),playing:isPlaying,record:localStorage.getItem(ADMIN_RETURN_KEY)})),{active:false,start:true,playing:false,record:null});
},options));

test('manual, auto, backup, import, deletion, new game and unload writes cannot contaminate ordinary slots',()=>run(async page=>{
  await startNewAdventure(page);await page.evaluate(()=>{gold=321;saveToSlot(1,false);gold=322;saveToSlot(1,false);saveToSlot(1,true);gold=323;saveToSlot(1,true);});
  const original=await page.evaluate(ordinarySnapshot);await enter(page);
  const result=await page.evaluate(()=>{
    gold=999999;const direct=[];
    for(const source of ['manual','auto'])try{writeSaveRecord(1,source,getSaveData());direct.push(false);}catch{direct.push(true);}
    let deleted=false,imported=false;try{deleteSlotData(1);}catch{deleted=true;}try{importSaveText(1,JSON.stringify(getSaveData()),'test.json');}catch{imported=true;}
    doNewGame(2);doDeleteSlot(1,'load');doRestoreBackup(1);doImportToSlot(1);doExportSlot(1);doLoadSlot(1);startNewGame();
    const loading=applySaveData(INITIAL_GAME_SAVE),saved=saveToSlot(1,false),auto=saveToSlot(1,true);
    window.dispatchEvent(new Event('beforeunload'));adminSaveTest();return {direct,deleted,imported,loading,saved,auto,gold,active:adminMode.active};
  });
  assert.deepEqual(result,{direct:[true,true],deleted:true,imported:true,loading:false,saved:false,auto:false,gold:999999,active:true});
  assert.deepEqual(await page.evaluate(ordinarySnapshot),original);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem(ADMIN_SAVE_KEY)).kind),'mangiworld-admin');
},options));

test('exit restores unsaved normal progress, slot, locks and objectives while discarding admin items and flags',()=>run(async page=>{
  await startNewAdventure(page);await page.evaluate(()=>{currentSaveSlot=2;gold=456;trackedObjective='dungeon:slime';inventory[0]={...findItemById('sword_iron')};lockedSlots[0]=true;});
  await enter(page);await page.evaluate(()=>{gold=99999;inventory[0]=null;trackedObjective=null;adminMode.invincible=true;adminMode.infiniteMana=true;exitAdminMode();});
  assert.deepEqual(await page.evaluate(()=>({gold,slot:currentSaveSlot,item:inventory[0].id,locked:lockedSlots[0],trackedObjective,active:adminMode.active,invincible:adminMode.invincible,pause:overlayVisible('pause-menu'),record:localStorage.getItem(ADMIN_RETURN_KEY)})),
    {gold:456,slot:2,item:'sword_iron',locked:true,trackedObjective:'dungeon:slime',active:false,invincible:false,pause:true,record:null});
},options));

test('reload restores the normal checkpoint and never authenticates or autosaves the test session',()=>run(async page=>{
  await startNewAdventure(page);await page.evaluate(()=>{gold=777;saveToSlot(1,false);});const snapshot=await page.evaluate(ordinarySnapshot);
  await enter(page);await page.evaluate(()=>{adminPreset('tower');gold=999999;adminMode.invincible=true;});await page.reload();
  assert.deepEqual(await page.evaluate(()=>({gold,active:adminMode.active,invincible:adminMode.invincible,pause:overlayVisible('pause-menu'),state:gameState,record:localStorage.getItem(ADMIN_RETURN_KEY)})),{gold:777,active:false,invincible:false,pause:true,state:'village',record:null});
  assert.deepEqual(await page.evaluate(ordinarySnapshot),snapshot);
},options));

test('entering from a boss battle restores to safe village without stale combat effects',()=>run(async page=>{
  await startNewAdventure(page);await page.evaluate(()=>{enterDungeonStage('slime',2,true,false);gold=555;projectiles=[{life:100}];player.frozenTimer=60;});
  await enter(page);await page.evaluate(()=>{adminPreset('mid');exitAdminMode();});
  assert.deepEqual(await page.evaluate(()=>({gold,state:gameState,enemies:enemies.length,projectiles:projectiles.length,frozen:player.frozenTimer})),{gold:555,state:'village',enemies:0,projectiles:0,frozen:0});
},options));

test('character fields validate atomically and calculate actual stats after applying valid input',()=>run(async page=>{
  await enter(page);await page.locator('#admin-level').fill('80');await page.locator('#admin-stat-Agi').fill('999');
  await page.evaluate(()=>adminApplyCharacter());assert.equal(await page.evaluate(()=>level),1);assert.match(await page.locator('#admin-status').textContent(),/10~50/);
  await page.locator('#admin-stat-Agi').fill('50');await page.locator('#admin-gold').fill('90000');await page.locator('#admin-stat-Vit').fill('40');await page.evaluate(()=>adminApplyCharacter());
  const result=await page.evaluate(()=>({level,gold,agi:statAgi,vit:statVit,hp,maxHp,exp,nextExp,expected:expForLevel(80)}));
  assert.equal(result.level,80);assert.equal(result.gold,90000);assert.equal(result.agi,50);assert.equal(result.vit,40);assert.equal(result.hp,result.maxHp);assert.equal(result.exp,0);assert.equal(result.nextExp,result.expected);
},options));

test('item search finds drops; grant conserves stacks and refuses a full bag atomically',()=>run(async page=>{
  await enter(page);await page.locator('#admin-item-search').fill('drop_demon');assert.ok(await page.locator('#admin-item option').count()>0);
  await page.locator('#admin-item-search').fill('');
  const result=await page.evaluate(()=>{
    const item=potionItems[0];document.getElementById('admin-item').value=item.id;document.getElementById('admin-item-count').value=5;
    inventory=Array(30).fill(null);inventory[0]={...item,count:63};adminGrantItem();const merged=[inventory[0].count,inventory[1].count];
    inventory=Array.from({length:30},()=>({...findItemById('sword_iron')}));const before=JSON.stringify(inventory);adminGrantItem();
    const same=before===JSON.stringify(inventory);document.getElementById('admin-item').value='sword_steel';adminEquipItem();
    return {merged,same,equipped:equipped.sword.id,active:activeWeaponSlot};
  });
  assert.deepEqual(result,{merged:[64,4],same:true,equipped:'sword_steel',active:'sword'});
},options));

test('invincibility blocks real damage only in admin mode and mana/cooldown assistance reaches casting',()=>run(async page=>{
  await enter(page);
  const result=await page.evaluate(()=>{
    adminMode.invincible=true;enterDungeonStage('slime',0,false,false);const before=hp;applyPlayerDamage(999,'적');
    const protectedHp=hp===before;setAdminFlag('infiniteMana',true);setAdminFlag('noCooldown',true);
    equipped.bow={...findItemById('bow_wood')};activeWeaponSlot='bow';skills.learnedBow=true;syncActiveWeapon();recalcAllStats();mp=0;skills.cooldowns.e=999;
    castSkill('e');const cast=mp>0&&skills.cooldowns.e>0;stepGame(false);const after={mp:mp===maxMp,cd:skills.cooldowns.e};
    setAdminFlag('invincible',false);const hpBefore=hp;applyPlayerDamage(1,'적');return {protectedHp,cast,after,damage:hpBefore-hp};
  });
  assert.equal(result.protectedHp,true);assert.equal(result.cast,true);assert.deepEqual(result.after,{mp:true,cd:0});assert.equal(result.damage,1);
},options));

test('AI freeze preserves enemy positions, projectiles and zone timers; unfreezing resumes them',()=>run(async page=>{
  await enter(page);
  const result=await page.evaluate(()=>{
    enterDungeonStage('slime',2,true,false);const boss=enemies[0];boss.state='cooldown';boss.stateTimer=90;
    projectiles=[{x:10,y:10,vx:1,vy:0,r:5,dmg:1,life:100,color:'#fff'}];slimeZones=[{x:10,y:10,r:5,dmg:1,timer:20,totalTimer:20}];
    ctx.clearRect(0,0,800,900);setAdminFlag('freezeAI',true);updateSlimeBossAI(boss);updateAndDrawProjectiles();tickZoneArray(slimeZones);
    const frozen={boss:boss.stateTimer,x:projectiles[0].x,life:projectiles[0].life,zone:slimeZones[0].timer,visible:ctx.getImageData(10,10,1,1).data[3]>0};
    setAdminFlag('freezeAI',false);updateSlimeBossAI(boss);updateAndDrawProjectiles();
    return {frozen,resumed:{boss:boss.stateTimer,x:projectiles[0].x,zone:slimeZones[0].timer}};
  });
  assert.deepEqual(result,{frozen:{boss:90,x:10,life:100,zone:20,visible:true},resumed:{boss:89,x:11,zone:19}});
},options));

for(const kind of ['sword','bow','staff','tower','dungeon'])test(`${kind} test encounter creates the requested fight without contaminating normal progression`,()=>run(async page=>{
  await startNewAdventure(page);const original=await page.evaluate(()=>JSON.stringify(dungeonProgress));await enter(page);
  await page.locator('#admin-encounter').selectOption(kind);await page.locator('#admin-dungeon-stage').selectOption('boss');await page.locator('#admin-awakened-duel').check();await page.locator('#admin-floor').fill('30');
  const result=await page.evaluate(()=>{adminStartEncounter();return {state:gameState,enemy:enemies[0]?.name,awakened:enemies[0]?.awakened,floor:towerFloor};});
  assert.equal(result.state,({sword:'minje_duel',bow:'elf_duel',staff:'mage_duel',tower:'tower',dungeon:'dungeon'})[kind]);assert.ok(result.enemy);
  if(['sword','bow','staff'].includes(kind))assert.equal(result.awakened,true);if(kind==='tower')assert.equal(result.floor,30);
  await page.evaluate(()=>exitAdminMode());assert.equal(await page.evaluate(()=>JSON.stringify(dungeonProgress)),original);
},options));

test('skill/awakening and quest tools set consistent test states without awarding rewards',()=>run(async page=>{
  await enter(page);await page.locator('#admin-skill-weapon').selectOption('staff');await page.locator('#admin-skill-stage').selectOption('ready');await page.locator('#admin-quest-stage').selectOption('completed');
  const result=await page.evaluate(()=>{adminSetProgress();const before=gold;adminSetQuest();const quest=questDefs[0];return {stage:awakenState.staff.stage,learned:skills.learnedStaff,defeated:archmageDefeated,task:awakenTaskDone('staff'),mats:awakenState.staff.mats,required:AWAKEN_DEFS.staff.matNeed,goldSame:gold===before,quest:activeQuests[quest.id].status};});
  assert.equal(result.stage,'ready');assert.equal(result.learned,true);assert.equal(result.defeated,true);assert.equal(result.task,true);assert.equal(result.mats,result.required);assert.equal(result.goldSame,true);assert.equal(result.quest,'completed');
},options));

for(const preset of ['early','mid','awakened','tower'])test(`${preset} preset uses working gear and can be resumed`,()=>run(async page=>{
  await enter(page);
  const result=await page.evaluate(preset=>{adminPreset(preset);resumeAdminPlay();stepGame(false);return {level,state:gameState,active:adminMode.active,paused:gameplayPaused(),weapons:['sword','bow','staff'].every(s=>!!equipped[s]),hp:hp>0};},preset);
  assert.equal(result.level,({early:5,mid:40,awakened:80,tower:100})[preset]);assert.equal(result.active,true);assert.equal(result.paused,false);assert.equal(result.weapons,true);assert.equal(result.hp,true);
},options));

test('dedicated test save restores test flags and data without replacing the return checkpoint',()=>run(async page=>{
  await startNewAdventure(page);await page.evaluate(()=>gold=78);await enter(page);
  const result=await page.evaluate(()=>{
    gold=10000;adminMode.freezeAI=true;adminSaveTest();const checkpoint=localStorage.getItem(ADMIN_RETURN_KEY);
    gold=1;adminMode.freezeAI=false;adminLoadTest();const loaded={gold,freeze:adminMode.freezeAI,checkpoint:checkpoint===localStorage.getItem(ADMIN_RETURN_KEY)};
    exitAdminMode();return {loaded,gold};
  });
  assert.deepEqual(result,{loaded:{gold:10000,freeze:true,checkpoint:true},gold:78});
},options));

test('damage metrics count actual damage, exclude overkill and clear on request',()=>run(async page=>{
  await enter(page);const result=await page.evaluate(()=>{
    enterDungeonStage('slime',0,false,false);const enemy=enemies[0];enemy.hp=2;enemy.maxHp=2;damageEnemy(enemy,99999,false);refreshAdminPanel();
    const measured={damage:adminMode.damageTotal,hits:adminMode.damageHits,text:document.getElementById('admin-metrics').textContent};resetAdminMetrics();return {measured,cleared:adminMode.damageTotal};
  });
  assert.equal(result.measured.damage,2);assert.equal(result.measured.hits,1);assert.match(result.measured.text,/DPS/);assert.equal(result.cleared,0);
},options));

test('admin panel pauses time, traps focus and Escape returns to pause; tools close stale shops',()=>run(async page=>{
  await enter(page);const frame=await page.evaluate(()=>frameCount);await page.keyboard.press('w');assert.equal(await page.evaluate(()=>frameCount),frame);
  await page.locator('#admin-resume').focus();await page.keyboard.press('Shift+Tab');assert.notEqual(await page.evaluate(()=>document.activeElement.closest('#admin-panel')===null),true);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#pause-menu').isVisible(),true);
  await page.evaluate(()=>{document.getElementById('guild-ui').classList.remove('hidden');openAdminPanel();resumeAdminPlay();});assert.equal(await page.evaluate(()=>gameplayPaused()),false);
},options));

test('admin preview and expanded tools remain usable at 320x360 with large text',()=>run(async page=>{
  await page.evaluate(()=>{accessibility.uiScale=1.3;applyAccessibilityPresentation();});await enter(page);
  await page.locator('#admin-panel details').last().evaluate(el=>el.open=true);
  const result=await page.locator('#admin-panel').evaluate(el=>{const box=el.getBoundingClientRect(),stage=document.getElementById('game-stage').getBoundingClientRect();return {fits:box.left>=stage.left&&box.right<=stage.right+1,scroll:el.scrollHeight>el.clientHeight,readable:document.getElementById('admin-preview').getBoundingClientRect().width===500,pixels:document.getElementById('admin-preview').getContext('2d').getImageData(0,0,500,120).data.some((v,i)=>i%4===3&&v>0)};});
  assert.deepEqual(result,{fits:true,scroll:true,readable:true,pixels:true});await page.locator('#admin-resume').click();assert.equal(await page.locator('#admin-badge').isVisible(),true);
},{...options,viewport:{width:320,height:360}}));

test('failure to store a return checkpoint refuses admin entry and preserves the normal session',()=>run(async page=>{
  await startNewAdventure(page);await page.evaluate(()=>{gold=61;const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===ADMIN_RETURN_KEY)throw new Error('blocked');return original.call(this,k,v);};});await enter(page);
  assert.deepEqual(await page.evaluate(()=>({gold,active:adminMode.active,settings:overlayVisible('settings-modal')})),{gold:61,active:false,settings:true});assert.match(await page.locator('#admin-auth-status').textContent(),/열지 못했습니다/);
},options));

test('failure to clear checkpoint keeps normal saves blocked until recovery can finish',()=>run(async page=>{
  await startNewAdventure(page);await page.evaluate(()=>gold=45);await enter(page);
  const result=await page.evaluate(()=>{
    gold=999;const original=Storage.prototype.removeItem;Storage.prototype.removeItem=function(k){if(k===ADMIN_RETURN_KEY)throw new Error('blocked');return original.call(this,k);};
    const first=exitAdminMode(),protectedState=adminMode.active&&saveToSlot(1,false)===false;
    Storage.prototype.removeItem=original;const second=exitAdminMode();return {first,protectedState,second,gold,active:adminMode.active};
  });assert.deepEqual(result,{first:false,protectedState:true,second:true,gold:45,active:false});
},options));

test('malformed test save is rejected atomically and corrupt return data does not overwrite normal saves',()=>run(async page=>{
  await enter(page);
  const result=await page.evaluate(()=>{gold=123;localStorage.setItem(ADMIN_SAVE_KEY,'{"kind":"mangiworld-admin","version":1,"data":{}}');adminLoadTest();return {gold,active:adminMode.active};});
  assert.deepEqual(result,{gold:123,active:true});await page.evaluate(()=>{exitAdminMode();localStorage.setItem(ADMIN_RETURN_KEY,'{broken');});await page.reload();
  assert.deepEqual(await page.evaluate(()=>({active:adminMode.active,raw:localStorage.getItem(ADMIN_RETURN_KEY+'_corrupt'),record:localStorage.getItem(ADMIN_RETURN_KEY)})),{active:false,raw:'{broken',record:null});
},options));

test('reload recovery with blocked checkpoint deletion exposes retry tools and keeps normal writes protected',()=>run(async page=>{
  await startNewAdventure(page);await page.evaluate(()=>gold=142);await enter(page);await page.evaluate(()=>gold=99999);
  await page.context().addInitScript(()=>{
    const original=Storage.prototype.removeItem;
    Storage.prototype.removeItem=function(k){if(k==='mangiworld_admin_return')throw new Error('blocked cleanup');return original.call(this,k);};
    window.allowAdminCleanup=()=>{Storage.prototype.removeItem=original;};
  });
  await page.reload();
  assert.deepEqual(await page.evaluate(()=>({active:adminMode.active,tools:overlayVisible('admin-panel'),blocked:saveToSlot(1,true)===false,gold})),{active:true,tools:true,blocked:true,gold:142});
  assert.match(await page.locator('#admin-status').textContent(),/복귀하지 못했습니다/);
  assert.equal(await page.evaluate(()=>{allowAdminCleanup();return exitAdminMode();}),true);
  assert.deepEqual(await page.evaluate(()=>({active:adminMode.active,gold,record:localStorage.getItem(ADMIN_RETURN_KEY)})),{active:false,gold:142,record:null});
},options));

test('admin controls remain available during ending scenes and safely stop the story before test play',()=>run(async page=>{
  await enter(page);
  const result=await page.evaluate(()=>{
    let completed=0;beginStory(endingScripts,()=>completed++);openAdminPanel();resumeAdminPlay();
    return {active:adminMode.active,playing:isPlaying,state:gameState,running:storyAnimRunning,script:currentScript,completed,paused:gameplayPaused(),hud:overlayVisible('status-hud')};
  });
  assert.deepEqual(result,{active:true,playing:true,state:'village',running:false,script:null,completed:0,paused:false,hud:true});
},options));

test('infinite mana can cast an ultimate above maximum mana without negative or invalid saved MP',()=>run(async page=>{
  await enter(page);
  const result=await page.evaluate(()=>{
    equipped.sword={...findItemById('sword_iron')};activeWeaponSlot='sword';skills.learnedSword=true;awakenState.sword.stage='awakened';
    gameState='training';setupTraining();setAdminFlag('infiniteMana',true);mp=0;
    const cost=awakenUltDefs.sword.mp;castAwakenUltimate();adminSaveTest();
    return {cost,maxMp,mp,cast:ultCooldown.sword>0,stored:JSON.parse(localStorage.getItem(ADMIN_SAVE_KEY)).data.mp};
  });
  assert.ok(result.cost>result.maxMp);assert.equal(result.cast,true);assert.equal(result.mp,result.maxMp);assert.equal(result.stored,result.maxMp);
},options));

test('watching endings in admin mode does not mark normal story progress as completed',()=>run(async page=>{
  await enter(page);
  const result=await page.evaluate(()=>{
    const before=localStorage.getItem('mangiworld_seen_stories');let completions=0;
    beginStory(endingScripts,()=>completions++);while(storyAnimRunning)advanceStory();
    const after=localStorage.getItem('mangiworld_seen_stories');exitAdminMode();return {same:before===after,completions,active:adminMode.active};
  });
  assert.deepEqual(result,{same:true,completions:1,active:false});
},options));
