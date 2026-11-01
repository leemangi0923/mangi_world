const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {createBrowserHarness,startNewAdventure}=require('./helpers/browser.cjs');
const {run}=createBrowserHarness({before,after});

for(const [width,height] of [[1920,1080],[1600,900],[1366,768],[1280,720],[1024,768],[800,600],[320,568],[844,390],[320,360]]) {
  test(`${width}x${height}: game fits without distortion and main menu remains reachable`,()=>run(async page=>{
    const geometry=await page.evaluate(()=>{
      const c=canvas.getBoundingClientRect(),s=document.getElementById('game-stage').getBoundingClientRect();
      return {canvas:{x:c.x,y:c.y,w:c.width,h:c.height},stage:{x:s.x,y:s.y,w:s.width,h:s.height},
        scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight};
    });
    assert.ok(Math.abs(geometry.canvas.w/geometry.canvas.h-800/900)<.0001);
    assert.ok(geometry.stage.x>=-1 && geometry.stage.y>=-1);
    assert.ok(geometry.stage.x+geometry.stage.w<=width+1 && geometry.stage.y+geometry.stage.h<=height+1);
    assert.ok(geometry.scrollW<=width && geometry.scrollH<=height);
    await page.getByRole('button',{name:'도움말',exact:true}).click();
    assert.ok((await page.locator('#help-screen').innerText()).includes('정예 3마리'));
    assert.ok(!(await page.locator('#help-screen').innerText()).includes('**'));
    await page.getByRole('button',{name:'확인',exact:true}).click();
    await startNewAdventure(page);
    if(width<1280) {
      await page.getByRole('button',{name:'가방·장비',exact:true}).click();
      const panel=await page.locator('#right-ui-panel').evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth}));
      assert.ok(panel.scroll<=panel.client,JSON.stringify(panel));
      await page.getByRole('button',{name:'가방·장비 닫기',exact:true}).click();
    }
  },{viewport:{width,height}}));
}

test('compact panels pause combat, allow their own actions, trap focus and close one layer at a time',()=>run(async page=>{
  await startNewAdventure(page);
  await page.evaluate(()=>{statPoints=2;hotbar[0]={...potionItems[0],count:3};hp=50;setupInventory();updateHUD();});
  await page.getByRole('button',{name:'가방·장비',exact:true}).click();
  const frame=await page.evaluate(()=>frameCount);
  await page.keyboard.press('1');await page.keyboard.press('q');await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>frameCount),frame);
  assert.equal(await page.evaluate(()=>hotbar[0].count),3);
  await page.locator('#inv-hotbar .inv-slot').first().click();
  assert.equal(await page.evaluate(()=>hotbar[0].count),2);
  await page.keyboard.press('Escape');await page.waitForFunction(value=>frameCount>value,frame);
  await page.getByRole('button',{name:'캐릭터 정보',exact:true}).click();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.textContent.trim()),'↺ 스탯 초기화');
  assert.equal(await page.evaluate(()=>!!document.activeElement.closest('#left-ui-panel')),true);
  await page.locator('#left-ui-panel .stat-btn').first().click();assert.equal(await page.evaluate(()=>statPoints),1);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>isPaused),true);
  await page.getByRole('button',{name:'가방·장비',exact:true}).click();
  await page.locator('#inv-hotbar .inv-slot').first().click();
  assert.equal(await page.evaluate(()=>hotbar[0].count),2); // An underlying explicit pause still blocks item use.
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>isPaused),true);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>isPaused),false);
},{viewport:{width:800,height:600}}));

test('aim and attack direction follow canvas coordinates before and after resizing',()=>run(async page=>{
  await startNewAdventure(page);
  for(const viewport of [{width:1366,height:768},{width:800,height:600},{width:1600,height:1000}]){
    await page.setViewportSize(viewport);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const rect=await page.locator('#gameCanvas').boundingBox();
    await page.mouse.move(rect.x+rect.width*.75,rect.y+rect.height*.4);
    const aim=await page.evaluate(()=>({x:mouseX,y:mouseY}));
    assert.ok(Math.abs(aim.x-600)*rect.width/800<=1 && Math.abs(aim.y-360)*rect.height/900<=1,JSON.stringify({aim,viewport}));
    await page.evaluate(()=>{player.x=400;player.y=500;player.lastAttackTime=null;});
    // A click without a preceding mousemove must also update the aim using the new rectangle.
    await page.locator('#gameCanvas').dispatchEvent('mousedown',{button:0,clientX:rect.x+rect.width*.7,clientY:rect.y+rect.height*.6});
    const angle=await page.evaluate(()=>player.attackAngle);
    const expected=Math.atan2((Math.trunc(rect.y+rect.height*.6)-rect.y)*900/rect.height-500,(Math.trunc(rect.x+rect.width*.7)-rect.x)*800/rect.width-400);
    assert.ok(Math.abs(angle-expected)<.001,JSON.stringify({angle,expected,viewport}));
  }
}));

test('tooltip stays within viewport near every edge and is outside the scaled game',()=>run(async page=>{
  await startNewAdventure(page);
  for(const [x,y] of [[1,1],[319,1],[1,359],[319,359]]) {
    const result=await page.evaluate(({x,y})=>{
      showItemTooltip({clientX:x,clientY:y},findItemById('sword_legend'),0);
      const r=document.getElementById('item-tooltip').getBoundingClientRect();
      return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,body:document.getElementById('item-tooltip').parentElement===document.body};
    },{x,y});
    assert.ok(result.x>=0 && result.y>=0 && result.right<=320 && result.bottom<=360,JSON.stringify(result));assert.equal(result.body,true);
  }
},{viewport:{width:320,height:360}}));

test('favicon is a valid served ICO and optional font failure does not block startup',()=>run(async page=>{
  const href=await page.locator('link[rel="icon"]').getAttribute('href');assert.equal(href,'favicon.ico');
  const response=await page.request.get(new URL(href,page.url()).href);assert.equal(response.status(),200);
  assert.deepEqual([...(await response.body()).subarray(0,4)],[0,0,1,0]);
  await startNewAdventure(page);
  assert.equal(await page.evaluate(()=>gameState),'village');
}));

test('small-screen shops and NPC dialogs fit their stage and keep close controls reachable',()=>run(async page=>{
  await startNewAdventure(page);
  for(const [id,close] of [['guild-ui','guild-close'],['blacksmith-ui','blacksmith-close'],['potion-ui','potion-close'],['npc-modal','npc-close']]) {
    await page.evaluate(id=>{
      if(id==='guild-ui')updateGuildUI();if(id==='blacksmith-ui')updateBlacksmithUI();if(id==='potion-ui')updatePotionUI();
      if(id==='npc-modal')openNpcModal('archmage');else document.getElementById(id).classList.remove('hidden');
    },id);
    const size=await page.locator('#'+id+' .modal-box').evaluate(el=>{
      const r=el.getBoundingClientRect(),s=document.getElementById('game-stage').getBoundingClientRect();
      return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,sx:s.x,sy:s.y,sr:s.right,sb:s.bottom,client:el.clientWidth,scroll:el.scrollWidth};
    });
    assert.ok(size.x>=size.sx && size.y>=size.sy && size.right<=size.sr+1 && size.bottom<=size.sb+1,JSON.stringify({id,size}));
    assert.ok(size.scroll<=size.client,JSON.stringify({id,size}));
    await page.locator('#'+close).click();
    assert.equal(await page.evaluate(id=>overlayVisible(id),id),false);
  }
},{viewport:{width:320,height:360}}));

test('all save records and the return control remain reachable in a short viewport',()=>run(async page=>{
  await startNewAdventure(page);
  await page.evaluate(()=>{
    for(let i=1;i<=3;i++){saveToSlot(i,false);saveToSlot(i,false);saveToSlot(i,true);saveToSlot(i,true);}
  });
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'불러오기',exact:true}).click();
  await page.getByRole('button',{name:'불러오기',exact:true}).last().click();
  assert.equal(await page.evaluate(()=>currentSaveSlot),3);
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'불러오기',exact:true}).click();
  await page.getByRole('button',{name:'돌아가기',exact:true}).click();
  assert.equal(await page.evaluate(()=>overlayVisible('pause-menu')),true);
},{viewport:{width:320,height:360}}));

test('small-screen progress remains available in the info panel after loading a save',()=>run(async page=>{
  await startNewAdventure(page);
  await page.evaluate(()=>{acceptQuest('q_slime_novice');saveToSlot(1,false);doLoadSlot(1);});
  await page.getByRole('button',{name:'캐릭터 정보',exact:true}).click();
  assert.equal(await page.locator('#compact-progress #quest-hud').isVisible(),true);
  assert.ok((await page.locator('#quest-hud-text').innerText()).includes('슬라임 소탕'));
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'가방·장비',exact:true}).click();
  await page.setViewportSize({width:1600,height:1000});
  await page.waitForFunction(()=>openSidePanel===null && !document.getElementById('panel-backdrop').offsetWidth);
  assert.equal(await page.locator('#right-ui-panel').isVisible(),true);
  assert.equal(await page.locator('#game-stage #quest-hud').isVisible(),true);
},{viewport:{width:320,height:568}}));
