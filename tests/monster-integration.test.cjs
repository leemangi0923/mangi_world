const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {createBrowserHarness,startNewAdventure}=require('./helpers/browser.cjs');
const {manualAnimationClock}=require('./helpers/manual-clock.cjs');
const {installLichEvasion}=require('./helpers/lich-evasion.cjs');
const {run}=createBrowserHarness({before,after}),options={init:manualAnimationClock};
for(const cat of ['zombie','ghost','demon'])test(cat+' all weapons can punish recovery in all three difficulties using actual basic attack input',()=>run(async page=>{
 await startNewAdventure(page);const samples=await page.evaluate(cat=>{const reports=[],random=Math.random;Math.random=()=>.99;ctx.save();ctx.beginPath();ctx.rect(0,0,0,0);ctx.clip();try{
 for(const mode of ['easy','normal','hard'])for(const slot of ['sword','bow','staff']){
  clearBattleRuntime();difficulty=mode;level=dungeonDefs[cat].boss.level;statStr=50;statVit=40;statAtk=30;statAgi=10;activeWeaponSlot=slot;
  equipped[slot]={...findItemById({sword:'sword_legend',bow:'bow_dragon',staff:'staff_archmage'}[slot])};syncActiveWeapon();recalcAllStats();hp=maxHp;mp=maxMp;
  enterDungeonStage(cat,2,true,false);const en=enemies[0];en.x=350;en.y=400;player.x=440;player.y=400;
  const key={zombie:'scythe',ghost:'fan',demon:'combo'}[cat];beginEncounterAttack(en,key);enterAttackPhase(en,en.encounterAttack,'recovery',200,'encounter');
  const before=en.hp,health=hp,mana=mp;const rect=canvas.getBoundingClientRect();
  for(let i=0;i<120;i++){frameCount++;canvas.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true,clientX:rect.left+en.x*rect.width/800,clientY:rect.top+en.y*rect.height/900}));tickEncounterActor(en);updateAndDrawProjectiles();}
  for(let i=0;i<30;i++){frameCount++;updateAndDrawProjectiles();}
  reports.push({mode,slot,damage:+(before-en.hp).toFixed(2),safe:hp===health,mana:mp===mana});
 }
 }finally{ctx.restore();Math.random=random;}return reports;},cat);
 for(const sample of samples){assert.ok(sample.damage>100,JSON.stringify(sample));assert.equal(sample.safe,true);assert.equal(sample.mana,true);}console.log(cat+' two-second recovery samples '+JSON.stringify(samples));
},options));
for(const cat of ['zombie','demon'])for(const slot of ['sword','bow','staff'])test(cat+' '+slot+' destroys the interruption object using ordinary attacks before its cast expires',()=>run(async page=>{
 await startNewAdventure(page);const r=await page.evaluate(({cat,slot})=>{level=100;statStr=50;statAtk=30;activeWeaponSlot=slot;equipped[slot]={...findItemById({sword:'sword_legend',bow:'bow_dragon',staff:'staff_archmage'}[slot])};syncActiveWeapon();recalcAllStats();enterDungeonStage(cat,2,true,false);const en=enemies[0];en.x=350;en.y=400;player.x=480;player.y=400;beginEncounterAttack(en,cat==='zombie'?'ritual':'judgment');const a=en.encounterAttack,seal=a.seal,budget=a.left;player.x=seal.x-70;player.y=seal.y;const rect=canvas.getBoundingClientRect(),g=gold,xp=exp;let ticks=0;
 for(;ticks<budget&&!a.interrupted;ticks++){frameCount++;canvas.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true,clientX:rect.left+seal.x*rect.width/800,clientY:rect.top+seal.y*rect.height/900}));updateAndDrawProjectiles();tickEncounterActor(en);}
 return {interrupted:!!a.interrupted,within:ticks<budget,sealRemoved:!enemies.includes(seal),noReward:g===gold&&xp===exp,noMana:mp===maxMp};},{cat,slot});assert.deepEqual(r,{interrupted:true,within:true,sealRemoved:true,noReward:true,noMana:true});
},options));
for(const cat of ['zombie','ghost','demon'])test(cat+' every damaging boss pattern has a reachable escape at its movement threshold without a movement skill',()=>run(async page=>{
 await startNewAdventure(page);if(cat==='zombie')await page.evaluate(installLichEvasion);const samples=await page.evaluate(cat=>{
 const results=[];accessibility.hitStop=false;ctx.save();ctx.beginPath();ctx.rect(0,0,0,0);ctx.clip();
 try{for(const [key,def] of Object.entries(ENCOUNTER_ATTACKS[cat])){
  if(['bonecut','shieldmarch','grasp','grab','slash','crush','guard','touch','bite','ember','cleave','bulwark','blink','mirror','summon'].includes(key))continue;
  clearBattleRuntime();difficulty='normal';statAgi=cat==='demon'?30:cat==='zombie'?20:10;recalcAllStats();hp=maxHp=5000;enterDungeonStage(cat,2,true,false);const en=enemies[0];en.x=350;en.y=400;player.x=480;player.y=400;portalCooldown=99999;beginEncounterAttack(en,key);const a=en.encounterAttack;
  if(cat==='zombie'&&def.shape==='lich'){
   const before=hp,state={};let ticks=0;while(a.phase!=='recovery'&&ticks++<1200){walkLichEvasion(en,a,state);stepGame(false);}keys={};results.push({key,reachable:a.phase==='recovery',safe:hp===before,loss:before-hp,walkingAgility:statAgi,ticks});continue;
  }
  const dangerous=(x,y)=>{
   if(def.shape==='choreo'){
    if(key==='blades'&&a.bladePoints.some(p=>Math.hypot(x-p.x,y-p.y)<55))return true;
    if(key==='wall'&&Math.abs(y-a.wallY)<50&&Math.abs(x-a.gapX)>a.gapWidth/2-30)return true;
    if(key==='descent'&&Math.hypot(x-a.x,y-a.y)<80)return true;
    for(let t=0;t<def.active;t+=3)for(const part of demonSegments(en,a,t)){
     if(!part.hot)continue;
     if(part.kind==='iron'){if(Math.hypot(x-part.x,y-part.y)<part.r+30)return true;}
     else if(encounterContains({shape:'line',fromX:part.start.x,fromY:part.start.y,angle:Math.atan2(part.end.y-part.start.y,part.end.x-part.start.x),length:Math.hypot(part.end.x-part.start.x,part.end.y-part.start.y),width:part.r+14},x,y))return true;
    }return false;
   }
   if(def.shape==='safe'||def.shape==='corridor'||def.shape==='beam'||def.shape==='cone'||def.shape==='line'){
    if(encounterContains(encounterShape(en,a),x,y))return true;
    if(key==='scythe')return encounterContains({...a,shape:'line',length:650,width:12},x,y);
    return false;
   }
   if(def.shape==='combo')return encounterContains({...a,shape:'cone',radius:a.radius+28,arc:1.3},x,y);
   if(def.shape==='sequence')return a.points.some(p=>encounterContains({shape:'circle',...p,radius:a.radius},x,y));
   if(def.shape==='fan'){const offsets=cat==='ghost'?[-.56,-.28,0,.28,.56]:[-.9,-.6,-.3,0,.3,.6,.9];return offsets.some(off=>encounterContains({...a,shape:'line',angle:a.angle+off,length:650,width:10},x,y));}
   return false;
  };
  const targets=[];for(let x=100;x<=700;x+=30)for(let y=170;y<=740;y+=30)if(![-14,0,14].some(dx=>[-14,0,14].some(dy=>dangerous(x+dx,y+dy))))targets.push({x,y,d:Math.hypot(x-player.x,y-player.y)});targets.sort((a,b)=>a.d-b.d);const target=targets.find(p=>p.d<player.runSpeed*(a.left-12));
  if(!target){results.push({key,reachable:false,safe:false});continue;}
  const before=hp;let stopped=false;
  for(let i=0;i<430;i++){
   if(!stopped){const dx=target.x-player.x,dy=target.y-player.y;if(Math.hypot(dx,dy)<10){keys={};player.vx=player.vy=0;stopped=true;}else keys={ShiftLeft:true,...(Math.abs(dx)>6?{[dx>0?'KeyD':'KeyA']:true}:{}),...(Math.abs(dy)>6?{[dy>0?'KeyS':'KeyW']:true}:{})};}
   if(!en.encounterAttack)en.encounterIdle=99999;stepGame(false);
  }
  results.push({key,reachable:true,safe:before===hp,loss:before-hp,target,final:{x:player.x,y:player.y},hits:damageLog.map(h=>({tick:h.tick,attack:h.attack}))});
 }}finally{ctx.restore();keys={};}return results;
 },cat);console.log(cat+' escape samples '+JSON.stringify(samples));for(const s of samples){assert.equal(s.reachable,true,JSON.stringify(s));assert.equal(s.safe,true,JSON.stringify(s));}
},options));
for(const cat of ['zombie','demon'])test(cat+' attack timings agree at 30, 60 and 144Hz',()=>run(async page=>{
 await startNewAdventure(page);const samples=await page.evaluate(cat=>[30,60,144].map(rate=>{restoreSessionState(prepareSavedSession(INITIAL_GAME_SAVE));isPlaying=true;isPaused=false;enterDungeonStage(cat,2,true,false);const en=enemies[0];en.x=350;en.y=400;player.x=480;player.y=400;hp=maxHp=5000;accessibility.hitStop=false;beginEncounterAttack(en,cat==='zombie'?'drain':'combo');lastFrameTime=null;frameAccum=0;ensureGameLoopStarted();advanceAnimationFrame(0);for(let i=1;i<=rate*2;i++)advanceAnimationFrame(i*1000/rate);return {ticks:frameCount,left:en.encounterAttack.left,phase:en.encounterAttack.phase,hits:damageLog.length,hp};}),cat);for(const s of samples)assert.deepEqual(s,samples[0]);assert.equal(samples[0].ticks,120);
},options));
