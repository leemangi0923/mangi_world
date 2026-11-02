function setupJournalBoss({category='slime',arena='dungeon',mode='normal',floor=5}={}){
  applySaveData({...INITIAL_GAME_SAVE,level:100,nextExp:expForLevel(100),difficulty:mode},true);
  adminMode=freshAdminState();autoSaveEnabled=false;accessibility.hitStop=false;sfxMuted=true;shakeEnabled=false;
  for(const slot of ['sword','bow','staff'])equipped[slot]={...findItemById({sword:'sword_iron',bow:'bow_wood',staff:'staff_apprentice'}[slot])};
  activeWeaponSlot='sword';syncActiveWeapon();recalcAllStats();setupInventory();hp=maxHp=100000;mp=maxMp=500;
  for(const c of TOWER_CATS)dungeonProgress[c].progress=dungeonDefs[c].tiers.map(t=>t.target);
  if(arena==='tower')enterTowerAt(floor);else enterDungeonStage(category,2,true,false);
  const boss=enemies.find(e=>e.isBoss);boss.stateTimer=100000;boss.hp=boss.maxHp=10000;boss.x=400;boss.y=400;player.x=505;player.y=455;portalCooldown=99999;
  updateHUD();return {id:activeBossRun.id,category:boss.category};
}
module.exports={setupJournalBoss};
