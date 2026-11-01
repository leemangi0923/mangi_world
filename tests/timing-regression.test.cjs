const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {createBrowserHarness}=require('./helpers/browser.cjs');
const {manualAnimationClock}=require('./helpers/manual-clock.cjs');
const harness=createBrowserHarness({before,after});
const run=fn=>harness.run(fn,{init:manualAnimationClock});

test('30, 60 and 144Hz produce the same movement over two seconds',()=>run(async page=>{
  const samples=await page.evaluate(()=>[30,60,144].map(rate=>{
    gameState='village';const save=getSaveData();save.player={x:400,y:700,facing:'up'};
    applySaveData(save);lastFrameTime=null;frameAccum=0;keys={KeyW:true};
    advanceAnimationFrame(0);
    for(let i=1;i<=rate*2;i++)advanceAnimationFrame(i*1000/rate);
    return {rate,frames:frameCount,y:player.y};
  }));
  for(const sample of samples){assert.equal(sample.frames,120,JSON.stringify(sample));assert.ok(Math.abs(sample.y-samples[0].y)<0.001);}
}));

test('two seconds of survival, skill and boss cooldowns, buff and mana regeneration agree across rates',()=>run(async page=>{
  const samples=await page.evaluate(()=>[30,60,144].map(rate=>{
    restoreSessionState(prepareSavedSession(INITIAL_GAME_SAVE));isPlaying=true;isPaused=false;
    enterDungeonStage('slime',2,false,true);enemies=[];periodicSpawnTimer=-100000;
    dungeonProgress.slime.progress[2]=TIER_SURVIVE_TARGET-120;
    skills.learnedSword=true;skills.cooldowns.q=240;bossRespawnCooldown.wolf=240;
    activeBuffs={atk:{val:10,timeLeft:120}};mp=10;
    ensureGameLoopStarted();lastFrameTime=null;frameAccum=0;advanceAnimationFrame(0);
    for(let i=1;i<=rate*2;i++)advanceAnimationFrame(i*1000/rate);
    return {rate,progress:dungeonProgress.slime.progress[2],cd:skills.cooldowns.q,boss:bossRespawnCooldown.wolf,buff:activeBuffs.atk.timeLeft,mp};
  }));
  for(const s of samples){assert.equal(s.progress,5400);assert.equal(s.cd,120);assert.equal(s.boss,120);assert.ok(Math.abs(s.buff-118)<1e-6);assert.equal(s.mp,16);}
}));

test('skill cooldowns progress even while an unlearned weapon hides the skill HUD',()=>run(async page=>{
  assert.equal(await page.evaluate(()=>{
    gameState='village';applySaveData(getSaveData());skills.cooldowns.q=100;skills.learnedSword=false;
    lastFrameTime=null;advanceAnimationFrame(0);for(let i=1;i<=60;i++)advanceAnimationFrame(i*1000/60);
    return skills.cooldowns.q;
  }),40);
}));

test('repeating floor uses one canvas fill and matches the previous tile pixels',()=>run(async page=>{
  await page.waitForFunction(()=>tileImagesReady.outdoor && tileImagesReady.indoor);
  const result=await page.evaluate(()=>{
    let imageCalls=0,fillCalls=0;
    const proto=CanvasRenderingContext2D.prototype,draw=proto.drawImage,fill=proto.fillRect;
    proto.drawImage=function(...args){if(this===ctx)imageCalls++;return draw.apply(this,args);};
    proto.fillRect=function(...args){if(this===ctx)fillCalls++;return fill.apply(this,args);};
    ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,800,900);
    const start=performance.now();for(let i=0;i<100;i++)fillOutTileArea(OT.grass[0],OT.grass[1],0,0,832,932,32);
    const ms=performance.now()-start;
    proto.drawImage=draw;proto.fillRect=fill;
    const mismatches=[],nonempty=[];
    for(const indoor of [false,true])for(const [x,y,w,h,step] of [[0,0,220,180,32],[13.3,7.8,191.2,133.4,37],[-5,-7,180,170,48]]){
      ctx.clearRect(0,0,800,900);
      const area=indoor?fillInTileArea:fillOutTileArea,tile=indoor?drawInTile:drawOutTile;
      const [col,row]=indoor?IT.table:OT.grass;
      area(col,row,x,y,w,h,step);const actual=ctx.getImageData(0,0,300,250).data;
      nonempty.push(actual.some((value,index)=>index%4===3 && value>0));
      ctx.clearRect(0,0,800,900);
      for(let ty=Math.round(y);ty<y+h;ty+=Math.round(step))for(let tx=Math.round(x);tx<x+w;tx+=Math.round(step))tile(col,row,tx,ty,Math.round(step),Math.round(step));
      const expected=ctx.getImageData(0,0,300,250).data;
      mismatches.push(actual.some((value,index)=>value!==expected[index]));
    }
    return {imageCalls,fillCalls,mismatches,nonempty,ms};
  });
  console.log('Floor rendering sample (100 calls):',result);
  assert.deepEqual(result.mismatches,Array(6).fill(false));
  assert.deepEqual(result.nonempty,Array(6).fill(true));
  assert.ok(result.imageCalls<=1);assert.equal(result.fillCalls,100);
}));

test('slow frames are capped and a long stall is discarded without queued damage or backlog',()=>run(async page=>{
  assert.deepEqual(await page.evaluate(()=>{
    gameState='village';applySaveData(getSaveData());advanceAnimationFrame(0);
    advanceAnimationFrame(200);
    const capped={frames:frameCount,max:loopStats.maxSteps,dropped:Math.round(loopStats.droppedMs)};
    advanceAnimationFrame(200+FRAME_MS);const next=frameCount;
    const beforeHp=hp;advanceAnimationFrame(2000);
    const stall={frames:frameCount,hpSame:hp===beforeHp,accum:frameAccum};
    advanceAnimationFrame(2000+FRAME_MS);
    return {capped,next,stall,after:frameCount};
  }),{capped:{frames:5,max:5,dropped:117},next:6,stall:{frames:6,hpSame:true,accum:0},after:7});
}));

test('menu pause discards partial ticks and does not catch up on resume',()=>run(async page=>{
  assert.deepEqual(await page.evaluate(()=>{
    gameState='village';applySaveData(getSaveData());advanceAnimationFrame(0);advanceAnimationFrame(10);
    togglePauseMenu();advanceAnimationFrame(1000);togglePauseMenu();advanceAnimationFrame(2000);
    const resumed=frameCount;advanceAnimationFrame(2010);const partial=frameCount;
    advanceAnimationFrame(2000+FRAME_MS);return {resumed,partial,after:frameCount};
  }),{resumed:0,partial:0,after:1});
}));

test('hitstop freezes combat time consistently while autosave still reaches its activity interval',()=>run(async page=>{
  const result=await page.evaluate(()=>{
    gameState='village';applySaveData(getSaveData());hitStop=10;skills.learnedSword=true;skills.cooldowns.q=100;
    activeBuffs={atk:{val:10,timeLeft:100}};autoSaveTimer=1790;
    advanceAnimationFrame(0);for(let i=1;i<=5;i++)advanceAnimationFrame(i*1000/30);
    const frozen={frame:frameCount,hitStop,cd:skills.cooldowns.q,buff:activeBuffs.atk.timeLeft,auto:readSaveRecord(1,'auto').status,
      timer:autoSaveTimer,draws:loopStats.presentations};
    advanceAnimationFrame(5*1000/30+FRAME_MS);
    return {frozen,after:{frame:frameCount,cd:skills.cooldowns.q,buff:activeBuffs.atk.timeLeft}};
  });
  assert.deepEqual(result.frozen,{frame:0,hitStop:0,cd:100,buff:100,auto:'valid',timer:0,draws:0});
  assert.equal(result.after.frame,1);assert.equal(result.after.cd,99);assert.ok(Math.abs(result.after.buff-(100-1/60))<1e-6);
}));

test('hitstop duration and presentation count stay bounded at 30, 60 and 144Hz',()=>run(async page=>{
  const results=await page.evaluate(()=>[30,60,144].map(rate=>{
    restoreSessionState(prepareSavedSession(INITIAL_GAME_SAVE));isPlaying=true;isPaused=false;hitStop=6;
    ensureGameLoopStarted();advanceAnimationFrame(0);
    for(let i=1;i<=rate;i++)advanceAnimationFrame(i*1000/rate);
    return {rate,frames:frameCount,steps:loopStats.steps,draws:loopStats.presentations,max:loopStats.maxSteps};
  }));
  for(const r of results){assert.equal(r.frames,54);assert.equal(r.steps,60);assert.ok(r.draws<=r.rate);assert.ok(r.max<=5);}
}));

test('normal attack cooldown uses combat time rather than wall-clock jumps or time in menus',()=>run(async page=>{
  assert.deepEqual(await page.evaluate(()=>{
    gameState='village';applySaveData(getSaveData());advanceAnimationFrame(0);
    const attack=()=>canvas.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true}));
    attack();const first=player.lastAttackTime;
    const original=Date.now;Date.now=()=>original()+1000000;
    attack();Date.now=original;const jumped=player.lastAttackTime;
    for(let i=1;i<=15;i++)advanceAnimationFrame(i*FRAME_MS);
    togglePauseMenu();advanceAnimationFrame(10000);togglePauseMenu();advanceAnimationFrame(20000);
    attack();const paused=player.lastAttackTime;
    for(let i=1;i<=15;i++)advanceAnimationFrame(20000+i*FRAME_MS);
    attack();return {first,jumped,paused,last:Math.round(player.lastAttackTime)};
  }),{first:0,jumped:0,paused:0,last:500});
}));

test('batched ticks stop immediately if a gameplay dialog opens during catch-up',()=>run(async page=>{
  assert.deepEqual(await page.evaluate(()=>{
    gameState='village';applySaveData(getSaveData());gameState='castle_inner';player.x=400;player.y=500;guildCooldown=false;
    advanceAnimationFrame(0);advanceAnimationFrame(100);
    return {steps:loopStats.steps,npc:overlayVisible('npc-modal'),frame:frameCount,accum:frameAccum};
  }),{steps:1,npc:true,frame:1,accum:0});
}));

test('batched rendering matches the visible 60Hz frame at the same simulation time',()=>run(async page=>{
  await page.waitForFunction(()=>tileImagesReady.outdoor && tileImagesReady.indoor);
  assert.equal(await page.evaluate(()=>{
    const frames=[];const random=Math.random;
    try{
      for(const rate of [30,60]){
        let seed=1;Math.random=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};
        restoreSessionState(prepareSavedSession(INITIAL_GAME_SAVE));isPlaying=true;isPaused=false;
        player.x=400;player.y=700;keys={KeyW:true};ensureGameLoopStarted();advanceAnimationFrame(0);
        for(let i=1;i<=rate;i++)advanceAnimationFrame(i*1000/rate);
        frames.push(ctx.getImageData(0,0,800,900).data);
      }
    }finally{Math.random=random;}
    return frames[0].every((value,index)=>value===frames[1][index]);
  }),true);
}));

test('floor pattern cache stays bounded and keeps the caller canvas style intact',()=>run(async page=>{
  await page.waitForFunction(()=>tileImagesReady.outdoor);
  assert.deepEqual(await page.evaluate(()=>{
    ctx.fillStyle='#123456';
    for(let step=8;step<100;step++)fillOutTileArea(OT.grass[0],OT.grass[1],0,0,100,100,step);
    return {size:floorPatternCache.size,limit:FLOOR_PATTERN_CACHE_LIMIT,style:ctx.fillStyle};
  }),{size:64,limit:64,style:'#123456'});
}));

test('representative overlapping spell battle stays bounded and runs real combat effects',()=>run(async page=>{
  await page.waitForFunction(()=>tileImagesReady.outdoor && tileImagesReady.indoor);
  const sample=await page.evaluate(()=>{
    gameState='village';applySaveData(getSaveData());autoSaveEnabled=false;
    enterDungeonStage('demon',2,false,true);
    enemies=Array.from({length:12},(_,i)=>createDungeonMob('demon',2,200+(i%4)*100,200+Math.floor(i/4)*130));
    equipped.staff={...findItemById('staff_arcane')};activeWeaponSlot='staff';skills.learnedStaff=true;awakenState.staff.stage='awakened';
    statVit=1000;statMp=37;syncActiveWeapon();recalcAllStats();hp=maxHp;mp=maxMp;
    castSkill('q');castSkill('e');castSkill('r');castAwakenUltimate();
    const effects=[meteorStorm,frostFx,voidRifts.length,sanctum].filter(Boolean).length;
    advanceAnimationFrame(0);
    const costs=[];
    for(let i=1;i<=60;i++){
      const start=performance.now();advanceAnimationFrame(i*1000/30);costs.push(performance.now()-start);
    }
    return {effects,steps:loopStats.steps,gameSteps:loopStats.gameSteps,presentations:loopStats.presentations,maxSteps:loopStats.maxSteps,
      avgMs:costs.reduce((a,b)=>a+b,0)/costs.length,worstMs:Math.max(...costs),hpFinite:Number.isFinite(hp),location:gameState};
  });
  console.log('Battle JS/canvas submission sample (12 mobs, overlapping staff spells, 30Hz):',sample);
  assert.ok(sample.effects>=3);assert.equal(sample.steps,120);assert.ok(sample.gameSteps>0);
  assert.ok(sample.presentations<=60);assert.equal(sample.maxSteps,2);assert.equal(sample.hpFinite,true);assert.equal(sample.location,'dungeon');
}));
