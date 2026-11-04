// React to visible doors, palms, fixed floor gaps and recorded footprints after 12 ticks.
function installGhostEvasion(){
 window.walkGhostEvasion=(en,a,state)=>{
  let token,goal;
  const clamp=(x,y)=>({x:slimeClamp(x,85,715),y:slimeClamp(y,170,770)});
  const perpendicular=(from,to,reach)=>{const angle=Math.atan2(to.y-from.y,to.x-from.x),choices=[-1,1].map(side=>clamp(player.x-Math.sin(angle)*reach*side,player.y+Math.cos(angle)*reach*side));choices.sort((p,q)=>lichDistance(q,from,to)-lichDistance(p,from,to));return choices[0];};
  const clapGoal=data=>{const low=Math.min(data.fromY-30,data.clapCenter.y)-140,high=Math.max(data.fromY,data.clapCenter.y)+140,choices=[];if(low>=170)choices.push(clamp(player.x,low));if(high<=770)choices.push(clamp(player.x,high));if(!choices.length)choices.push(clamp(90,player.y),clamp(710,player.y));choices.sort((p,q)=>Math.hypot(p.x-player.x,p.y-player.y)-Math.hypot(q.x-player.x,q.y-player.y));return choices[0];};
  if(a.key==='theatre'){
   const p=ghostTheatrePose(a,a.phase==='windup'?1:a.elapsed+1);if(p){token='exit'+p.i;goal=perpendicular(p.from,p.to,150);}
  }else if(a.key==='clasp'){token='clasp';goal=clapGoal(a);}
  else if(a.key==='threshold'){token='threshold';goal=perpendicular(a.doors[0],a.doors[1],150);}
  else if(a.key==='echo'){
   const i=a.phase==='active'&&a.elapsed>=a.echoSpan?1:0,data=a.echoes[i].data;token='echo'+i;goal=data.key==='clasp'?clapGoal(data):perpendicular(data.doors[0],data.doors[1],150);
  }else if(a.key==='fold'){
   const p=ghostFoldPose(a,a.phase==='windup'?1:a.elapsed+1),i=p.part>90&&p.index<2?p.index+1:p.index;token='floor'+i;goal=clamp(a.foldGaps[i],player.y);
  }else if(a.key==='footprints'){
   if(a.phase==='windup'){keys={};return;}
   if(!a.recordClosed){const i=Math.min(2,Math.floor(a.elapsed/40));token='record'+i;goal=[clamp(650,player.y),clamp(player.x,700),clamp(150,player.y)][i];}
   else{token='record-exit';const points=a.footPath,choices=[[-180,0],[180,0],[0,-180],[0,180],[-160,-160],[-160,160],[160,-160],[160,160]].map(([x,y])=>clamp(player.x+x,player.y+y)),score=p=>Math.min(...points.map(q=>Math.hypot(p.x-q.x,p.y-q.y)));choices.sort((p,q)=>score(q)-score(p));goal=choices[0];}
  }else if(a.key==='spectralreach'){
   if(a.reachTo){token='reach';goal=perpendicular(a.reachFrom,a.reachTo,110);}
  }else if(a.key==='glasslunge'){token='lunge';goal=perpendicular(a.lungeFrom,a.lungeTo,130);}
  else if(a.key==='aftertouch'){
   const i=a.phase==='active'&&a.elapsed>=100?1:0,p=a.smallHands[i];token='small'+i;goal=perpendicular(p.from,p.to,110);
  }
  if(!goal){keys={};return;}
  if(state.token!==token){state.token=token;state.at=frameCount;state.goal=goal;}
  if(frameCount-state.at<12){keys={};return;}
  const dx=state.goal.x-player.x,dy=state.goal.y-player.y;keys={...(Math.abs(dx)>5?{[dx>0?'KeyD':'KeyA']:true}:{}),...(Math.abs(dy)>5?{[dy>0?'KeyS':'KeyW']:true}:{})};
 };
}
module.exports={installGhostEvasion};
