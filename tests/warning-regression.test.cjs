const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {createBrowserHarness,startNewAdventure}=require('./helpers/browser.cjs');
const {manualAnimationClock}=require('./helpers/manual-clock.cjs');
const {setupJournalBoss}=require('./helpers/journal-scene.cjs');
const {run}=createBrowserHarness({before,after}),options={init:manualAnimationClock};

test('real dungeon exit removes winding mobs, shots and hazards and cannot respawn the departed room later in that tick',()=>run(async page=>{
 const cases=[];for(const category of ['slime','wolf','zombie','ghost','demon'])for(const boss of [false,true]){
  await page.evaluate(setupJournalBoss,{category});cases.push(await page.evaluate(({category,boss})=>{
   difficulty='easy';if(!boss)enterDungeonStage(category,0,false,false);const old=enemies[0];
   if(category==='slime')beginSlimeAttack(old,boss?'leap':'dash');else if(category==='wolf')beginWolfAttack(old,boss?'leap':'bite');else beginEncounterAttack(old,boss?{zombie:'ritual',ghost:'corridor',demon:'judgment'}[category]:Object.keys(ENCOUNTER_ATTACKS[category])[0]);
   const oldAttack=old.slimeAttack||old.wolfAttack||old.encounterAttack;dungeonProgress[category].bossDefeated=true;bossRespawnCooldown[category]=0;periodicSpawnTimer=999;respawnTimer=69;pendingSpawns.push(createDungeonMob(category,0));
   projectiles.push({owner:'enemy',x:50,y:150,vx:0,vy:0,life:20,r:4,dmg:1});slimeZones.push({slimeAcid:true,x:80,y:150,r:25,timer:100,totalTimer:100,activeLeft:100,tick:30});
   player.x=400;player.y=850;portalCooldown=0;skills.cooldowns.q=80;const hpBefore=hp,mpBefore=mp;stepGame(true);
   const clean=enemies.length===0&&projectiles.length===0&&pendingSpawns.length===0&&slimeZones.length===0&&ghostZones.length===0&&demonZones.length===0&&encounterHazards.length===0&&encounterShots.length===0;
   // A retained callback must also be harmless even if it still owns the old attack object.
   if(category==='slime')old.slimeAttack=oldAttack;else if(category==='wolf')old.wolfAttack=oldAttack;else old.encounterAttack=oldAttack;
   let strokes=0,texts=0;const stroke=ctx.stroke,text=ctx.fillText;ctx.stroke=function(...args){strokes++;return stroke.apply(this,args);};ctx.fillText=function(...args){texts++;return text.apply(this,args);};
   try{drawCombatWarnings();if(category==='slime')drawSlimeAttackGuide(old);else if(category==='wolf')drawWolfGuide(old);else drawEncounterGuide(old);}finally{ctx.stroke=stroke;ctx.fillText=text;}
   for(let i=0;i<4;i++)stepGame(true);return {category,boss,clean,map:gameState,strokes,texts,enemies:enemies.length,hp:hp===hpBefore,mp:mp===mpBefore,cooldown:skills.cooldowns.q,current:currentDungeon.category};
  },{category,boss}));
 }for(const r of cases){assert.equal(r.clean,true,JSON.stringify(r));assert.equal(r.enemies,0);assert.equal(r.strokes,0);assert.equal(r.texts,0);assert.equal(r.hp,true);assert.equal(r.mp,true);assert.equal(r.cooldown,75);assert.equal(r.current,null);assert.equal(r.map,categoryMap(r.category));}
 function categoryMap(c){return c==='demon'?'demon_entrance':'portal_room';}
},options));

test('actual return to a previous dungeon replaces every caster and keeps only the destination grade',()=>run(async page=>{
 await page.evaluate(setupJournalBoss,{category:'zombie'});const r=await page.evaluate(()=>{enterDungeonStage('zombie',0,false,false);const source=enemies[0];beginEncounterAttack(source,'grab');enterDungeonStage('zombie',1,false,true);beginEncounterAttack(enemies[0],'slash');const departed=enemies.slice();player.x=400;player.y=850;portalCooldown=0;stepGame(true);return {map:gameState,stage:currentDungeon.stage,count:enemies.length,correct:enemies.every(e=>e.stageIndex===0&&!e.encounterAttack),departed:departed.every(e=>e.encounterAttack===null),fresh:enemies.every(e=>!departed.includes(e))};});assert.deepEqual(r,{map:'dungeon',stage:0,count:5,correct:true,departed:true,fresh:true});
},options));

test('tower exits cancel pack/boss attacks and preserve floor progression, resources and one journal escape',()=>run(async page=>{
 for(const floor of [1,5,15,20,25]){await page.evaluate(setupJournalBoss);const r=await page.evaluate(floor=>{clearBattleRuntime();gameState='portal_room';returnStack=[];enterTowerAt(floor);const old=enemies[0];if(old.category==='slime')beginSlimeAttack(old,'leap');else if(old.category==='wolf')beginWolfAttack(old,'leap');else beginEncounterAttack(old,old.category==='zombie'?'ritual':old.category==='ghost'?'corridor':'judgment');const best=towerBestFloor,h=hp,m=mp;player.x=400;player.y=850;portalCooldown=0;stepGame(true);return {map:gameState,empty:!enemies.length&&!projectiles.length&&!encounterShots.length&&!encounterHazards.length,floor:towerFloor,best:towerBestFloor===best,hp:hp===h,mp:mp===m,active:activeBossRun,escapes:adventureJournal.totals.filter(t=>t.arena==='tower').reduce((n,t)=>n+t.escapes,0)};},floor);assert.equal(r.map,'portal_room');assert.equal(r.escapes,floor%5===0?1:0);assert.equal(r.empty,true);assert.equal(r.floor,floor);assert.equal(r.best,true);assert.equal(r.hp,true);assert.equal(r.mp,true);assert.equal(r.active,null);}
},options));

test('only easy renders ordinary melee/rush/fan telegraphs and names/timers across all five families',()=>run(async page=>{
 const ordinary={slime:'sweep',wolf:'claw',zombie:'scythe',ghost:'fan',demon:'combo'};
 for(const mode of ['easy','normal','hard'])for(const [category,key]of Object.entries(ordinary)){
  await page.evaluate(setupJournalBoss,{category,mode});const r=await page.evaluate(({category,key})=>{const en=enemies[0];if(category==='slime')beginSlimeAttack(en,key);else if(category==='wolf')beginWolfAttack(en,key);else beginEncounterAttack(en,key);let strokes=0;const labels=[],stroke=ctx.stroke,text=ctx.fillText;ctx.stroke=function(...args){strokes++;return stroke.apply(this,args);};ctx.fillText=function(value,...args){labels.push(String(value));return text.call(this,value,...args);};try{drawCombatWarnings();}finally{ctx.stroke=stroke;ctx.fillText=text;}return {strokes,labels};},{category,key});assert.equal(r.strokes>0,mode==='easy',category+' '+mode);assert.equal(r.labels.some(t=>/초/.test(t)),mode==='easy',category+' '+mode);assert.equal(r.labels.length>0,mode==='easy',category+' '+mode);
 }
},options));

test('critical landings, acid/ground hazards, drain and room safety stay visible at all difficulties even at effects zero',()=>run(async page=>{
 const important={slime:['leap','acid'],wolf:['leap'],zombie:['drain','ritual'],ghost:['hands','corridor'],demon:['fissure','brand','judgment']};
 for(const mode of ['easy','normal','hard'])for(const [category,keys]of Object.entries(important))for(const key of keys){
  await page.evaluate(setupJournalBoss,{category,mode});const r=await page.evaluate(({category,key})=>{accessibility.effects=0;const en=enemies[0];if(category==='slime')beginSlimeAttack(en,key);else if(category==='wolf')beginWolfAttack(en,key);else beginEncounterAttack(en,key);let strokes=0;const labels=[],stroke=ctx.stroke,text=ctx.fillText;ctx.stroke=function(...args){strokes++;return stroke.apply(this,args);};ctx.fillText=function(value,...args){labels.push(String(value));return text.call(this,value,...args);};try{drawCombatWarnings();}finally{ctx.stroke=stroke;ctx.fillText=text;}return {strokes,labels};},{category,key});assert.ok(r.strokes>0,category+' '+key+' '+mode);if(mode!=='easy')assert.deepEqual(r.labels,[],category+' '+key+' '+mode);
 }
},options));

test('recovery names/timers, countdown helpers and drain text follow the easy-only policy',()=>run(async page=>{
 for(const mode of ['easy','normal','hard']){await page.evaluate(setupJournalBoss,{category:'zombie',mode});const r=await page.evaluate(()=>{const en=enemies[0];beginEncounterAttack(en,'drain');enterAttackPhase(en,en.encounterAttack,'active',45,'encounter');const labels=[],text=ctx.fillText;ctx.fillText=function(value,...args){labels.push(String(value));return text.call(this,value,...args);};try{drawCombatWarnings();drawBattleReadability();refreshCombatFeedback();enterAttackPhase(en,en.encounterAttack,'recovery',60,'encounter');drawCombatWarnings();}finally{ctx.fillText=text;}return {labels,summary:document.getElementById('battle-summary').textContent};});assert.equal(r.labels.some(t=>/생명력 흡수|초|빈틈/.test(t)),mode==='easy');if(mode!=='easy')assert.doesNotMatch(r.summary,/시전 예고/);}
},options));

test('acid pools retain their boundary but hide names/countdowns on normal and hard; all hazard layers are silent outside combat',()=>run(async page=>{
 await page.evaluate(setupJournalBoss);const r=await page.evaluate(()=>{slimeZones=[{slimeAcid:true,x:400,y:500,r:50,timer:30,totalTimer:60,activeLeft:120}];const results=[];for(const mode of ['easy','normal','hard']){difficulty=mode;let strokes=0;const labels=[],stroke=ctx.stroke,text=ctx.fillText;ctx.stroke=function(...args){strokes++;return stroke.apply(this,args);};ctx.fillText=function(v,...args){labels.push(String(v));return text.call(this,v,...args);};try{drawSlimeGround();}finally{ctx.stroke=stroke;ctx.fillText=text;}results.push({mode,strokes,labels});}gameState='portal_room';let strokes=0;const stroke=ctx.stroke;ctx.stroke=function(...a){strokes++;return stroke.apply(this,a);};try{drawSlimeGround();drawZoneArray([{x:400,y:400,r:50,timer:30,totalTimer:60}],'red','red');drawCombatWarnings();drawEncounterRuntime();drawWolfEffects();}finally{ctx.stroke=stroke;}return {results,strokes};});for(const s of r.results){assert.ok(s.strokes>0);assert.equal(s.labels.length>0,s.mode==='easy');}assert.equal(r.strokes,0);
},options));

test('actual enemy projectiles remain visible independently of attack guides, difficulty and effects settings',()=>run(async page=>{
 await page.evaluate(setupJournalBoss,{category:'ghost'});const r=await page.evaluate(()=>{const owner=enemies[0];encounterShots=[{owner,x:100,y:200,r:9,vx:1,vy:1,color:'#aabbff',life:180}];const before=JSON.stringify(encounterShots),visible=[];for(const difficultyValue of ['easy','normal','hard']){difficulty=difficultyValue;accessibility.effects=0;ctx.clearRect(0,0,800,900);drawEncounterRuntime();visible.push(ctx.getImageData(88,188,24,24).data.some((v,i)=>i%4===3&&v>0));}return {visible,pure:before===JSON.stringify(encounterShots)};});assert.ok(r.visible.every(Boolean));assert.equal(r.pure,true);
},options));

test('folding the objective HUD preserves tracking, keeps hidden progress fresh and does not pause or attack',()=>run(async page=>{
 await page.evaluate(setupJournalBoss);const before=await page.evaluate(()=>({frame:frameCount,hits:weaponTraitState.procs,tracked:trackedObjective,playing:gameplayPaused()}));await page.locator('#objective-hud-toggle').click();assert.equal(await page.locator('#objective-hud-toggle').getAttribute('aria-expanded'),'false');assert.equal(await page.locator('#objective-hud-body').isVisible(),false);await page.evaluate(()=>{trackedObjective='dungeon:wolf';refreshObjectiveUI(true);});await page.locator('#objective-hud-toggle').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#objective-hud-body').isVisible(),true);assert.match(await page.locator('#quest-hud-text').textContent(),/늑대/);const after=await page.evaluate(()=>({frame:frameCount,hits:weaponTraitState.procs,paused:gameplayPaused()}));assert.equal(after.frame,before.frame);assert.equal(after.hits,before.hits);assert.equal(after.paused,false);
},options));

test('objective collapse is remembered across reload and session changes and stays usable if preference storage fails',()=>run(async page=>{
 await startNewAdventure(page);await page.locator('#objective-hud-toggle').click();await page.reload();await startNewAdventure(page);assert.equal(await page.locator('#objective-hud-toggle').getAttribute('aria-expanded'),'false');const r=await page.evaluate(()=>{const schema=getSaveData().version;applySaveData(getSaveData(),true);const still=objectiveHudCollapsed,write=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new Error('quota');};try{toggleObjectiveHUD();}finally{Storage.prototype.setItem=write;}return {schema,still,expanded:!objectiveHudCollapsed,aria:document.getElementById('objective-hud-toggle').getAttribute('aria-expanded'),inSave:'objectiveHudCollapsed' in getSaveData()};});assert.deepEqual(r,{schema:8,still:true,expanded:true,aria:'true',inSave:false});
},options));

test('compact and large-text objective folding remains inside the side panel and preserves keyboard focus',()=>run(async page=>{
 await startNewAdventure(page);await page.evaluate(()=>{accessibility.uiScale=1.3;applyAccessibilityPresentation();});await page.getByRole('button',{name:'캐릭터 정보',exact:true}).click();const toggle=page.locator('#objective-hud-toggle');await toggle.focus();await page.keyboard.press('Space');assert.equal(await toggle.getAttribute('aria-expanded'),'false');assert.equal(await toggle.evaluate(el=>el===document.activeElement),true);const r=await page.evaluate(()=>{const h=document.getElementById('quest-hud').getBoundingClientRect(),b=document.getElementById('objective-hud-toggle').getBoundingClientRect(),p=document.getElementById('left-ui-panel').getBoundingClientRect();return {inside:b.left>=h.left&&b.right<=h.right+1&&h.right<=p.right+1,parent:document.getElementById('quest-hud').parentElement.id};});assert.equal(r.inside,true);assert.equal(r.parent,'compact-progress');await page.keyboard.press('Space');assert.equal(await page.locator('#objective-hud-body').isVisible(),true);
},{...options,viewport:{width:320,height:360}}));

test('ordinary slime and wolf leaps do not inherit the boss-only landing guides on normal or hard',()=>run(async page=>{
 for(const category of ['slime','wolf'])for(const mode of ['easy','normal','hard']){await page.evaluate(setupJournalBoss,{category,mode});const r=await page.evaluate(category=>{enterDungeonStage(category,0,false,false);const en=enemies[0];if(category==='slime')beginSlimeAttack(en,'leap');else beginWolfAttack(en,'leap');let count=0;const stroke=ctx.stroke;ctx.stroke=function(...a){count++;return stroke.apply(this,a);};try{drawCombatWarnings();}finally{ctx.stroke=stroke;}return count;},category);assert.equal(r>0,mode==='easy');}
},options));

test('ordinary active sweep and claw range overlays are also hidden outside easy',()=>run(async page=>{
 for(const category of ['slime','wolf'])for(const mode of ['easy','normal','hard']){await page.evaluate(setupJournalBoss,{category,mode});const r=await page.evaluate(category=>{const en=enemies[0];if(category==='slime'){beginSlimeAttack(en,'sweep');enterAttackPhase(en,en.slimeAttack,'active',12,'slime');}else{beginWolfAttack(en,'claw');enterAttackPhase(en,en.wolfAttack,'active',44,'wolf');en.wolfAttack.flash=5;}let count=0;const stroke=ctx.stroke;ctx.stroke=function(...a){count++;return stroke.apply(this,a);};try{drawCombatWarnings();}finally{ctx.stroke=stroke;}return count;},category);assert.equal(r>0,mode==='easy');}
},options));
