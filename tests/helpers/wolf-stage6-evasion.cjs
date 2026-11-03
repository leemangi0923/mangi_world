// Browser-side input driver. It reads only visible geometry and waits 12 ticks.
function installWolfStage6Evasion(){
 window.walkWolfStage6=(en,a,state)=>{
  if(!['snare','pincer','guard'].includes(a.key)){walkWolfEvasion(en,a,state);return;}
  let leg,token,goal;
  if(a.key==='snare'){
   token='opening';const dx=player.x-a.snareCenter.x,dy=player.y-a.snareCenter.y;
   goal=Math.hypot(dx,dy)>225?{x:player.x,y:player.y}:{x:slimeClamp(a.snareCenter.x+Math.cos(a.gapAngle)*250,85,715),y:slimeClamp(a.snareCenter.y+Math.sin(a.gapAngle)*250,170,770)};
  }else if(a.key==='pincer'){leg=a.bossLeg||(enemies.includes(a.partner)?a.partnerLeg:null);token=a.bossLeg?'leader':'partner';}
  else{leg=a.counterLeg;token='counter';}
  if(!goal&&!leg){keys={};return;}
  if(state.token!==token){
   state.token=token;state.at=frameCount;
   if(!goal){const points=[-1,1].map(side=>({x:slimeClamp(player.x-Math.sin(leg.angle)*135*side,85,715),y:slimeClamp(player.y+Math.cos(leg.angle)*135*side,170,770)}));points.sort((p,q)=>Math.abs(-(q.x-leg.from.x)*Math.sin(leg.angle)+(q.y-leg.from.y)*Math.cos(leg.angle))-Math.abs(-(p.x-leg.from.x)*Math.sin(leg.angle)+(p.y-leg.from.y)*Math.cos(leg.angle)));goal=points[0];}
   state.goal=goal;
  }
  if(frameCount-state.at<12){keys={};return;}
  const dx=state.goal.x-player.x,dy=state.goal.y-player.y;keys={...(Math.abs(dx)>6?{[dx>0?'KeyD':'KeyA']:true}:{}),...(Math.abs(dy)>6?{[dy>0?'KeyS':'KeyW']:true}:{})};
 };
}
module.exports={installWolfStage6Evasion};
