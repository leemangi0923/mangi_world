// Browser-side input only: react to visible gates/weapon/locked hand after 12 ticks.
function installLichEvasion(){
 window.walkLichEvasion=(en,a,state)=>{
  let token,goal,leg;
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
