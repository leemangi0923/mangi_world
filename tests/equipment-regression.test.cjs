const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {createBrowserHarness,startNewAdventure}=require('./helpers/browser.cjs');
const {run}=createBrowserHarness({before,after});

for(const [kind,oldId,newId] of [['sword','sword_iron','sword_steel'],['bow','bow_wood','bow_hunter'],['staff','staff_apprentice','staff_arcane']]){
  test(`${kind} comparison uses its own slot, stays pure and predicts actual equip stats`,()=>run(async page=>{
    await startNewAdventure(page);
    const result=await page.evaluate(({kind,oldId,newId})=>{
      equipped.sword={...findItemById('sword_legend')};equipped[kind]={...findItemById(oldId)};
      activeWeaponSlot='sword';syncActiveWeapon();recalcAllStats();statStr=20;recalcAllStats();
      const snapshot=JSON.stringify(getSaveData(),(key,value)=>key==='savedAt'?0:value);
      const candidate=findItemById(newId),comparison=compareEquipment(candidate);
      const pure=activeWeaponSlot==='sword'&&snapshot===JSON.stringify(getSaveData(),(key,value)=>key==='savedAt'?0:value);
      activeWeaponSlot=kind;syncActiveWeapon();recalcAllStats();
      const before=getPlayerAttackPower();inventory[0]={...candidate};handleItemClick(0,{});
      return {slot:comparison.slot,reference:comparison.reference.id,pure,before,expectedBefore:comparison.before.attackPower,
        after:getPlayerAttackPower(),expectedAfter:comparison.after.attackPower,active:activeWeaponSlot};
    },{kind,oldId,newId});
    assert.equal(result.slot,kind);assert.equal(result.reference,oldId);assert.equal(result.pure,true);
    assert.equal(result.before,result.expectedBefore);assert.equal(result.after,result.expectedAfter);assert.equal(result.active,kind);
    const known={sword:[8.964,9.545],bow:[9.13,9.794],staff:[9.13,9.877]}[kind];
    assert.ok(Math.abs(result.before-known[0])<1e-9);assert.ok(Math.abs(result.after-known[1])<1e-9);
  }));
}

test('armor comparison reflects percentage bonuses, rounded HP, buffs and stat caps',()=>run(async page=>{
  await startNewAdventure(page);
  const result=await page.evaluate(()=>{
    statVit=21;statCrit=19;statCritDmg=70;activeBuffs={def:{val:75,timeLeft:100}};
    equipped.armor={...findItemById('armor_novice_top')};syncActiveWeapon();recalcAllStats();
    const item=findItemById('armor_legend_top'),comparison=compareEquipment(item);
    inventory[0]={...item};handleItemClick(0,{});
    return {expected:comparison.after,actual:{hp:maxHp,defense:equipBonusDef,crit:critChance,critDmg:critDamage},changes:comparison.changes};
  });
  assert.equal(result.actual.hp,result.expected.maxHp);assert.equal(result.actual.hp,481);assert.equal(result.actual.defense,75);
  assert.equal(result.actual.crit,100);assert.equal(result.actual.critDmg,500);
  assert.ok(result.changes.some(row=>row.key==='maxHp'&&row.delta>0&&row.bonusDelta>0));
  assert.ok(result.changes.some(row=>row.key==='defense'&&row.delta===0&&row.bonusDelta>0));
}));

test('empty and identical-slot comparisons explain no reference and no change',()=>run(async page=>{
  await startNewAdventure(page);
  assert.deepEqual(await page.evaluate(()=>{
    const item=findItemById('sword_iron'),empty=compareEquipment(item);
    equipped.sword={...item};const same=compareEquipment({...item});
    return {empty:empty.reference,same:same.changes.length,consumable:compareEquipment(potionItems[0])};
  }),{empty:null,same:0,consumable:null});
}));

test('bag lock follows equip, locked-equipment swap and unequip, then survives reload',()=>run(async page=>{
  await startNewAdventure(page);
  assert.deepEqual(await page.evaluate(()=>{
    inventory[0]={...findItemById('sword_iron')};lockedSlots[0]=true;handleItemClick(0,{});
    const first={equipped:lockedEquipment.sword,empty:inventory[0]===null,bag:!!lockedSlots[0]};
    inventory[0]={...findItemById('sword_steel')};handleItemClick(0,{});
    const swap={equipped:!!lockedEquipment.sword,old:inventory[0].id,oldLocked:lockedSlots[0]};
    toggleEquipmentLock('sword');unequipItem('sword');
    saveToSlot(1,false);doLoadSlot(1);
    return {first,swap,unequipped:inventory[1].id,locked:lockedSlots[1],gear:equipped.sword};
  }),{first:{equipped:true,empty:true,bag:false},swap:{equipped:false,old:'sword_iron',oldLocked:true},unequipped:'sword_steel',locked:true,gear:null});
}));

test('full-bag swaps conserve items and failed unequip preserves gear and lock',()=>run(async page=>{
  await startNewAdventure(page);
  assert.deepEqual(await page.evaluate(()=>{
    inventory=Array.from({length:27},()=>({...findItemById('sword_iron')}));equipped.sword={...findItemById('sword_steel')};lockedEquipment.sword=true;
    const failed=unequipItem('sword');handleItemClick(0,{});
    return {failed,count:inventory.filter(Boolean).length+Number(!!equipped.sword),bag:inventory[0].id,bagLock:lockedSlots[0],gear:equipped.sword.id};
  }),{failed:false,count:28,bag:'sword_steel',bagLock:true,gear:'sword_iron'});
}));

test('removing active weapon selects another equipped kind; inactive removal preserves current kind',()=>run(async page=>{
  await startNewAdventure(page);
  assert.deepEqual(await page.evaluate(()=>{
    equipped.sword={...findItemById('sword_iron')};equipped.bow={...findItemById('bow_wood')};equipped.staff={...findItemById('staff_arcane')};
    activeWeaponSlot='sword';unequipItem('staff');const inactive=activeWeaponSlot;unequipItem('sword');
    return {inactive,active:activeWeaponSlot,weapon:equipped.weapon.id};
  }),{inactive:'sword',active:'bow',weapon:'bow_wood'});
}));

test('locked potion cannot heal or register; unlocked stack consumes one and transfers only available capacity',()=>run(async page=>{
  await startNewAdventure(page);
  assert.deepEqual(await page.evaluate(()=>{
    const item=potionItems[0];inventory[0]={...item,count:10};lockedSlots[0]=true;hp=50;
    handleItemClick(0,{});hoveredSlot={area:'bag',index:0};assignToHotbar(0);
    const protectedState={hp,count:inventory[0].count,bar:hotbar[0]};
    delete lockedSlots[0];handleItemClick(0,{});const afterUse=inventory[0].count;
    hotbar[0]={...item,count:63};hoveredSlot={area:'bag',index:0};assignToHotbar(0);
    const partial={bag:inventory[0].count,bar:hotbar[0].count};
    hoveredSlot={area:'bag',index:0};assignToHotbar(0);
    return {protectedState,afterUse,partial,full:{bag:inventory[0].count,bar:hotbar[0].count}};
  }),{protectedState:{hp:50,count:10,bar:null},afterUse:9,partial:{bag:8,bar:64},full:{bag:8,bar:64}});
}));

test('hotbar moves and swaps conserve quantity, and unlike target rejects bag registration',()=>run(async page=>{
  await startNewAdventure(page);
  assert.deepEqual(await page.evaluate(()=>{
    hotbar[0]={...potionItems[0],count:20};hotbar[1]={...potionItems[1],count:30};
    hoveredSlot={area:'hotbar',index:0};assignToHotbar(2);
    hoveredSlot={area:'hotbar',index:2};assignToHotbar(1);
    inventory[0]={...potionItems[1],count:5};hoveredSlot={area:'bag',index:0};assignToHotbar(1);
    return {counts:hotbar.map(item=>item?.count||0),bag:inventory[0].count,total:hotbar.reduce((n,item)=>n+(item?.count||0),0)+inventory[0].count};
  }),{counts:[0,20,30,0,0,0,0,0,0],bag:5,total:55});
}));

test('locked items cannot be sold or consumed by forging even with a full bag',()=>run(async page=>{
  await startNewAdventure(page);
  assert.deepEqual(await page.evaluate(()=>{
    autoSaveEnabled=false;const materials=demonLordItems();inventory=Array.from({length:27},()=>({...findItemById('sword_iron')}));
    inventory[0]={...materials[0]};lockedSlots[0]=true;const money=gold;handleItemClick(0,{shiftKey:true});
    forgeDemonLordItem(materials[1].id);const protectedItem=inventory[0].id;
    inventory[1]={...materials[0]};inventory[2]={...materials[0]};inventory[3]={...materials[0]};
    forgeDemonLordItem(materials[1].id);
    return {goldSame:gold===money,protectedItem,locked:lockedSlots[0],result:inventory[1].id,count:inventory.filter(Boolean).length,target:materials[1].id,source:materials[0].id};
  }),{goldSame:true,protectedItem:await page.evaluate(()=>demonLordItems()[0].id),locked:true,result:await page.evaluate(()=>demonLordItems()[1].id),count:25,target:await page.evaluate(()=>demonLordItems()[1].id),source:await page.evaluate(()=>demonLordItems()[0].id)});
}));

test('bag tooltip identifies inactive weapon reference and shop preview does not buy or equip',()=>run(async page=>{
  await startNewAdventure(page);
  await page.evaluate(()=>{
    equipped.sword={...findItemById('sword_legend')};equipped.bow={...findItemById('bow_wood')};activeWeaponSlot='sword';
    inventory[0]={...findItemById('bow_hunter')};syncActiveWeapon();recalcAllStats();setupInventory();
  });
  await page.locator('#inv-main-grid .inv-slot').first().hover();
  assert.ok((await page.locator('.comparison-reference').innerText()).includes('활 슬롯 기준 · 나무활'));
  assert.ok((await page.locator('#item-tooltip').innerText()).includes('현재 사용: 검'));
  assert.ok(Number(await page.locator('.comparison-row[data-stat="attackPower"]').getAttribute('data-delta'))>0);
  await page.evaluate(()=>{updateBlacksmithUI();document.getElementById('blacksmith-ui').classList.remove('hidden');});
  const before=await page.evaluate(()=>({gold,active:activeWeaponSlot,sword:equipped.sword.id}));
  await page.locator('#blacksmith-shop-list .shop-item-card').filter({hasText:'철검'}).first().hover();
  assert.ok(Number(await page.locator('.comparison-row[data-stat="attackPower"]').getAttribute('data-delta'))<0);
  assert.ok((await page.locator('#item-tooltip').innerText()).includes('상점 미리보기'));
  assert.deepEqual(await page.evaluate(()=>({gold,active:activeWeaponSlot,sword:equipped.sword.id})),before);
}));

test('hotbar quantities and key labels remain accurate after browser-key registration',()=>run(async page=>{
  await startNewAdventure(page);
  await page.evaluate(()=>{inventory[0]={...potionItems[0],count:12};setupInventory();});
  await page.locator('#inv-main-grid .inv-slot').first().hover();
  await page.keyboard.press('Shift+3');
  assert.equal(await page.locator('#inv-hotbar .inv-slot').nth(2).locator('.slot-key').innerText(),'3');
  assert.equal(await page.locator('#inv-hotbar .inv-slot').nth(2).locator('.slot-quantity').innerText(),'12');
  assert.equal(await page.evaluate(()=>inventory[0]),null);
  await page.keyboard.press('3');
  assert.equal(await page.locator('#inv-hotbar .inv-slot').nth(2).locator('.slot-quantity').innerText(),'11');
}));

test('equipped state and lock are visible, including keyboard inspection in compact panel',()=>run(async page=>{
  await startNewAdventure(page);
  await page.evaluate(()=>{
    equipped.sword={...findItemById('sword_iron')};equipped.bow={...findItemById('bow_wood')};activeWeaponSlot='sword';
    lockedEquipment.bow=true;syncActiveWeapon();setupInventory();
  });
  await page.getByRole('button',{name:'가방·장비',exact:true}).click();
  assert.equal(await page.locator('#inv-sword-slot .slot-state').innerText(),'사용');
  assert.equal(await page.locator('#inv-bow-slot .slot-state').innerText(),'대기');
  assert.equal(await page.locator('#inv-bow-slot .slot-lock').innerText(),'🔒');
  await page.locator('#inv-bow-slot').focus();
  assert.ok((await page.locator('#item-tooltip').innerText()).includes('잠금'));
  assert.ok((await page.locator('#item-tooltip').innerText()).includes('장착 중 · 대기'));
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>equipped.bow),null);
  assert.equal(await page.evaluate(()=>lockedSlots[0]),true);
},{viewport:{width:320,height:360}}));

test('long armor comparison fits the small viewport with full content accessible',()=>run(async page=>{
  await startNewAdventure(page);
  const geometry=await page.evaluate(()=>{
    statVit=1000;statCrit=19;activeBuffs={def:{val:75,timeLeft:100}};equipped.armor={...findItemById('armor_novice_top')};
    showItemTooltip({clientX:319,clientY:359},findItemById('armor_legend_top'),0);
    const el=document.getElementById('item-tooltip'),r=el.getBoundingClientRect();
    return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,scroll:el.scrollHeight,client:el.clientHeight};
  });
  assert.ok(geometry.left>=0&&geometry.top>=0&&geometry.right<=320&&geometry.bottom<=360,JSON.stringify(geometry));
  assert.ok(geometry.scroll<=geometry.client,JSON.stringify(geometry));
},{viewport:{width:320,height:360}}));

test('schema 5 preserves equipment locks and migrates version 4 without changing tracked goals',()=>run(async page=>{
  await startNewAdventure(page);
  assert.deepEqual(await page.evaluate(()=>{
    equipped.sword={...findItemById('sword_iron')};lockedEquipment.sword=true;trackedObjective='dungeon:wolf';syncActiveWeapon();
    const data=getSaveData();applySaveData(data);const restored=lockedEquipment.sword;
    const old={...getSaveData(),version:4};delete old.lockedEquipment;applySaveData(old);
    const bad=getSaveData();bad.lockedEquipment={weapon:true};let rejected=false;try{applySaveData(bad);}catch{rejected=true;}
    return {version:data.version,restored,migrated:lockedEquipment,tracking:trackedObjective,rejected};
  }),{version:5,restored:true,migrated:{},tracking:'dungeon:wolf',rejected:true});
}));

test('visible comparison updates when a buff expires instead of showing stale capped values',()=>run(async page=>{
  await startNewAdventure(page);
  await page.evaluate(()=>{
    equipped.armor={...findItemById('armor_novice_top')};activeBuffs={def:{val:75,timeLeft:100}};recalcAllStats();
    showItemTooltip({clientX:900,clientY:300},findItemById('armor_legend_top'),0);
  });
  assert.equal(Number(await page.locator('[data-stat="defense"]').getAttribute('data-delta')),0);
  await page.evaluate(()=>{delete activeBuffs.def;recalcAllStats();});
  assert.ok(Number(await page.locator('[data-stat="defense"]').getAttribute('data-delta'))>0);
}));

test('compact bag allows explicit Shift registration while blocking combat and plain potion hotkeys',()=>run(async page=>{
  await startNewAdventure(page);
  await page.evaluate(()=>{inventory[0]={...potionItems[0],count:7};setupInventory();});
  await page.getByRole('button',{name:'가방·장비',exact:true}).click();
  await page.locator('#inv-main-grid .inv-slot').first().hover();await page.keyboard.press('Shift+4');
  assert.equal(await page.evaluate(()=>hotbar[3]?.count),7);
  await page.keyboard.press('4');assert.equal(await page.evaluate(()=>hotbar[3]?.count),7);
  await page.locator('#inv-hotbar .inv-slot').nth(3).hover();await page.keyboard.press('Shift+5');
  assert.deepEqual(await page.evaluate(()=>[hotbar[3],hotbar[4].count]),[null,7]);
},{viewport:{width:320,height:568}}));
