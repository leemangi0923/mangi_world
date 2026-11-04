// Shared deterministic scenario used for the v5.5.0 reference and current presentation checks.
function runPresentationScene({category,mode,ticks=1200,effects=.65,traceMoves=false}) {
  const save={...INITIAL_GAME_SAVE,difficulty:mode,level:100};applySaveData(save,true);
  adminMode={...freshAdminState(),active:true};autoSaveEnabled=false;sfxMuted=true;shakeEnabled=false;accessibility.hitStop=false;accessibility.effects=effects;
  let seed=7654321,randomCalls=0;const random=Math.random;Math.random=()=>{randomCalls++;seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  ctx.save();ctx.beginPath();ctx.rect(0,0,0,0);ctx.clip();
  try {
    const weaponId={slime:'drop_slime_king_blade',wolf:'drop_wolf_king_fang',zombie:'drop_zombie_lich_staff',ghost:'drop_ghost_king_bow',demon:'drop_demon_lord_staff'}[category],item=findItemById(weaponId);
    equipped[item.weaponKind]={...item};activeWeaponSlot=item.weaponKind;syncActiveWeapon();statStr=30;recalcAllStats();hp=maxHp=100000;mp=maxMp=500;
    dungeonProgress[category].progress=dungeonDefs[category].tiers.map(t=>t.target);enterDungeonStage(category,2,true,false);
    const boss=enemies[0];boss.x=400;boss.y=420;boss.maxHp=1000000;boss.hp=250000;player.x=505;player.y=455;portalCooldown=99999;
    const rect=canvas.getBoundingClientRect(),moves=new Set();
    for(let tick=0;tick<ticks;tick++){
      if(tick%60===0)canvas.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true,clientX:rect.left+boss.x*rect.width/800,clientY:rect.top+boss.y*rect.height/900}));
      stepGame(false);if(traceMoves&&(boss.wolfAttack||boss.encounterAttack))moves.add((boss.wolfAttack||boss.encounterAttack).key);
    }
    const attack=a=>a?Object.fromEntries(['key','phase','left','duration','angle','x','y','fromX','fromY','elapsed'].filter(k=>a[k]!==undefined).map(k=>[k,a[k]])):null;
    const fight={hp,mp,frameCount,player:{x:player.x,y:player.y},enemies:enemies.map(en=>({x:en.x,y:en.y,hp:en.hp,state:en.state,stateTimer:en.stateTimer,category:en.category,isBoss:!!en.isBoss,slime:attack(en.slimeAttack),wolf:attack(en.wolfAttack),encounter:attack(en.encounterAttack)})),shots:[...projectiles,...encounterShots].map(p=>({x:p.x,y:p.y,vx:p.vx,vy:p.vy,life:p.life})),damageLog:JSON.parse(JSON.stringify(damageLog)),trait:{count:weaponTraitState.count,procs:weaponTraitState.procs,readyAt:weaponTraitState.readyAt},randomCalls,seed};
    if(traceMoves)fight.moves=[...moves].sort();
    damageEnemy(boss,1e9,false);
    const rewards={gold,exp,progress:JSON.parse(JSON.stringify(dungeonProgress)),inventory:inventory.map(i=>i?.id||null),archive:JSON.parse(JSON.stringify(rewardArchive)),demonDefeated};
    return {fight,rewards};
  } finally {ctx.restore();Math.random=random;}
}
module.exports={runPresentationScene};
