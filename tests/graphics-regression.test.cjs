const {test,before,after}=require('node:test');const assert=require('node:assert/strict');
const {createBrowserHarness,startNewAdventure}=require('./helpers/browser.cjs');const {manualAnimationClock}=require('./helpers/manual-clock.cjs');const {run}=createBrowserHarness({before,after});const options={init:manualAnimationClock};
test('intro explains return objective and guild, keyboard advances once, reward remains singular',()=>run(async page=>{
 await page.getByRole('button',{name:'게임 시작',exact:true}).click();await page.getByRole('button',{name:'새로운 모험 시작',exact:true}).first().click();
 await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>storyIndex),1);
 assert.match(await page.locator('#story-progress').textContent(),/2 \/ 14/);
 const result=await page.evaluate(()=>{const text=storyScripts.map(s=>s.text).join(' ');while(storyAnimRunning)advanceStory();advanceStory();return {text,gold,state:gameState};});
 assert.match(result.text,/귀환/);assert.match(result.text,/길드/);assert.match(result.text,/에녹/);assert.equal(result.gold,150);assert.equal(result.state,'village');
},options));
test('all NPC portraits render from shared appearances without changing player or equipment',()=>run(async page=>{
 await startNewAdventure(page);
 for(const id of ['minje','elfqueen','archmage']){
  const r=await page.evaluate(id=>{const before=JSON.stringify({player,equipped});openNpcModal(id);const c=document.querySelector('#npc-portrait canvas');return {same:before===JSON.stringify({player,equipped}),pixels:c.getContext('2d').getImageData(0,0,100,110).data.some((v,i)=>i%4===3&&v),label:c.getAttribute('aria-label')};},id);
  assert.equal(r.same,true);assert.equal(r.pixels,true);assert.match(r.label,/초상화/);await page.evaluate(()=>closeNpcModal());
 }
},options));
test('NPC gallery supports directions and poses with distinct role silhouettes and pure game state',()=>run(async page=>{
 const r=await page.evaluate(()=>{const before=JSON.stringify(getSaveData(),(k,v)=>k==='savedAt'?0:v),images=[];for(const role of ['resident','knight','elf','mage','guard']){const c=document.createElement('canvas');c.width=120;c.height=140;drawStoryFigure(60,85,{role,hairLong:true,walk:3},c.getContext('2d'));images.push(c.toDataURL());}return {distinct:new Set(images).size,same:before===JSON.stringify(getSaveData(),(k,v)=>k==='savedAt'?0:v)};});assert.deepEqual(r,{distinct:5,same:true});
},options));
for(const cat of ['slime','wolf','zombie','ghost','demon'])test(cat+' scenery and mob/boss renders preserve combat data and canvas state',()=>run(async page=>{
 await startNewAdventure(page);const r=await page.evaluate(cat=>{const mobs=[createDungeonMob(cat,0),createDungeonBoss(cat)];const before=JSON.stringify(mobs);ctx.save();ctx.globalAlpha=.8;drawRegionScenery(cat,1);const alpha=ctx.globalAlpha;ctx.restore();for(const m of mobs){drawDungeonBackground(cat,0,m.isBoss,1);drawDungeonMob(m,1);}return {same:before===JSON.stringify(mobs),alpha};},cat);assert.equal(r.same,true);assert.equal(r.alpha,.8);
},options));
test('small story dialog exposes progress and next objective without horizontal page overflow',()=>run(async page=>{
 await page.evaluate(()=>{startNewGame();for(let i=0;i<13;i++)advanceStory();});assert.match(await page.locator('#story-text').textContent(),/첫 목표/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
},{...options,viewport:{width:320,height:360}}));
test('three duel teachers share NPC appearance while keeping attack telegraphs and combat state',()=>run(async page=>{
 await startNewAdventure(page);const r=await page.evaluate(()=>{const roles=[],original=drawStoryFigure;drawStoryFigure=function(x,y,opts,target){roles.push(opts.role);return original(x,y,opts,target);};const mobs=[createMinjeBoss(true),createElfQueenBoss(true),createArchmageBoss(true)];const before=JSON.stringify(mobs);[drawMinjeBoss,drawElfQueenBoss,drawArchmageBoss].forEach((draw,i)=>draw(mobs[i],1));drawStoryFigure=original;return {roles,same:before===JSON.stringify(mobs)};});assert.deepEqual(r,{roles:['knight','elf','mage'],same:true});
},options));
