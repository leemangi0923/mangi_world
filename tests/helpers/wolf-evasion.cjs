// Browser-side test driver: react to a visible direction lock after 12 simulation ticks.
function installWolfEvasion(){
 window.walkWolfEvasion=(en,a,state)=>{
  let leg,token;
  if(a.key==='hunt'){leg=a.huntLegs[a.legIndex||0];token='hunt'+a.legIndex;}
  else if(a.key==='stalk'||a.key==='prowl'){leg=a.biteLeg;token='bite';}
  else if(a.key==='rake'){leg={angle:a.initialAngle,from:{x:a.fromX,y:a.fromY}};token='rake';}
  if(!leg){keys={};return;}
  if(state.token!==token){state.token=token;state.at=frameCount;const distance=a.key==='rake'?160:125,candidates=[-1,1].map(side=>({x:slimeClamp(player.x-Math.sin(leg.angle)*distance*side,85,715),y:slimeClamp(player.y+Math.cos(leg.angle)*distance*side,170,770)}));candidates.sort((p,q)=>Math.abs(-(q.x-leg.from.x)*Math.sin(leg.angle)+(q.y-leg.from.y)*Math.cos(leg.angle))-Math.abs(-(p.x-leg.from.x)*Math.sin(leg.angle)+(p.y-leg.from.y)*Math.cos(leg.angle)));state.goal=candidates[0];}
  if(frameCount-state.at<12){keys={};return;}
  const dx=state.goal.x-player.x,dy=state.goal.y-player.y;keys={...(Math.abs(dx)>6?{[dx>0?'KeyD':'KeyA']:true}:{}),...(Math.abs(dy)>6?{[dy>0?'KeyS':'KeyW']:true}:{})};
 };
}
module.exports={installWolfEvasion};
