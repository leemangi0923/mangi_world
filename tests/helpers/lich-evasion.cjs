// Browser-side input only: react to visible gates/weapon/locked hand after 12 ticks.
function installLichEvasion(){
 window.walkLichEvasion=(en,a,state)=>{
  let token,goal,leg;
  if(a.key==='scales'){
   token='scales';goal=Math.hypot(player.x-a.scaleOrigin.x,player.y-a.scaleOrigin.y)>a.scaleReach+35?{x:player.x,y:player.y}:{x:slimeClamp(a.scaleOrigin.x-Math.cos(a.angle)*120,85,715),y:slimeClamp(a.scaleOrigin.y-Math.sin(a.angle)*120,170,770)};
  }else if(a.key==='dragon'){
   token='dragon';const path=a.dragonPath,points=Array.from({length:31},(_,i)=>lichBezier(path.from,path.control,path.to,i/30)),choices=[[-170,0],[170,0],[0,-170],[0,170],[-150,-150],[-150,150],[150,-150],[150,150]].map(([x,y])=>({x:slimeClamp(player.x+x,85,715),y:slimeClamp(player.y+y,170,770)})),score=p=>Math.min(...points.map(q=>Math.hypot(p.x-q.x,p.y-q.y)));choices.sort((p,q)=>score(q)-score(p));goal=choices[0];
  }else if(a.key==='reassemble'){
   const i=a.armLocks[1]?1:a.armLocks[0]?0:-1;if(i>=0){token='arm'+i;const root=a.heapSites[i],angle=a.armLocks[i].angle,d=Math.hypot(player.x-root.x,player.y-root.y);goal=d>215?{x:player.x,y:player.y}:d<65?{x:slimeClamp(root.x-Math.cos(angle)*100,85,715),y:slimeClamp(root.y-Math.sin(angle)*100,170,770)}:{x:slimeClamp(player.x+Math.cos(angle)*150,85,715),y:slimeClamp(player.y+Math.sin(angle)*150,170,770)};}
  }else if(a.key==='bonecut'){
   if(a.cutAngleReady){token='bonecut';const d=Math.hypot(player.x-en.x,player.y-en.y),angle=a.cutAngle;goal=d<65?{x:slimeClamp(en.x-Math.cos(angle)*110,85,715),y:slimeClamp(en.y-Math.sin(angle)*110,170,770)}:{x:slimeClamp(player.x+Math.cos(angle)*120,85,715),y:slimeClamp(player.y+Math.sin(angle)*120,170,770)};}
  }else if(a.key==='shieldmarch'){
   if(a.slamTarget){token='axe';const angle=Math.atan2(a.slamTarget.y-en.y,a.slamTarget.x-en.x),points=[-1,1].map(side=>({x:slimeClamp(player.x-Math.sin(angle)*120*side,85,715),y:slimeClamp(player.y+Math.cos(angle)*120*side,170,770)}));points.sort((p,q)=>Math.hypot(q.x-a.slamTarget.x,q.y-a.slamTarget.y)-Math.hypot(p.x-a.slamTarget.x,p.y-a.slamTarget.y));goal=points[0];}
  }else
  if(a.key==='cathedral'){
   const pose=lichRibPose(a,a.phase==='windup'?0:a.elapsed),index=pose.part>75&&pose.index<2?pose.index+1:pose.index;
   token='gate'+index;goal={x:a.gaps[index],y:player.y};
  }else if(a.key==='reap'){
   const behind={x:slimeClamp(en.x-Math.cos(a.angle)*110,85,715),y:slimeClamp(en.y-Math.sin(a.angle)*110,170,770)};
   if(a.phase==='active'&&a.elapsed>=70&&state.goal&&Math.hypot(player.x-behind.x,player.y-behind.y)<320){token='return';goal=behind;}
   else{token=state.token==='return'?'return':'out';if(token==='return')goal=state.goal;else{
    const choices=[[-170,0],[170,0],[0,-170],[0,170],[-150,-150],[-150,150],[150,-150],[150,150]].map(([x,y])=>({x:slimeClamp(player.x+x,85,715),y:slimeClamp(player.y+y,170,770)}));
    const points=[];for(let i=0;i<=20;i++){points.push(lichBezier(a.hand,a.outControl,a.reapEnd,i/20),lichBezier(a.reapEnd,a.backControl,a.hand,i/20));}
    const score=p=>Math.min(...points.map(q=>Math.hypot(p.x-q.x,p.y-q.y)));choices.sort((p,q)=>score(q)-score(p));goal=choices[0];
   }}
  }else if(a.key==='coffin'){if(a.coffinEnd){leg={from:a.coffinStart,angle:a.angle};token='coffin';}}
  else if(a.key==='grasp'){if(a.handTarget){const p=lichGraspPose(en,a,a.elapsed);leg={from:p.shoulder,angle:a.angle};token='hand';}}
  if(!goal&&!leg){keys={};return;}
  if(state.token!==token){state.token=token;state.at=frameCount;
   if(!goal){const distance=a.key==='grasp'?110:150,points=[-1,1].map(side=>({x:slimeClamp(player.x-Math.sin(leg.angle)*distance*side,85,715),y:slimeClamp(player.y+Math.cos(leg.angle)*distance*side,170,770)})),score=p=>Math.abs(-(p.x-leg.from.x)*Math.sin(leg.angle)+(p.y-leg.from.y)*Math.cos(leg.angle));points.sort((p,q)=>score(q)-score(p));goal=points[0];}state.goal=goal;
  }
  if(frameCount-state.at<12){keys={};return;}
  const dx=state.goal.x-player.x,dy=state.goal.y-player.y;keys={...(Math.abs(dx)>5?{[dx>0?'KeyD':'KeyA']:true}:{}),...(Math.abs(dy)>5?{[dy>0?'KeyS':'KeyW']:true}:{})};
 };
}
module.exports={installLichEvasion};
