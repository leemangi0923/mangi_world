// Deterministic browser RAF delivery. Simulation still executes the actual game code.
function manualAnimationClock() {
  let nextId=1;
  const pending=new Map();
  window.requestAnimationFrame=callback=>{const id=nextId++;pending.set(id,callback);return id;};
  window.cancelAnimationFrame=id=>pending.delete(id);
  window.advanceAnimationFrame=time=>{
    const callbacks=[...pending.values()];pending.clear();
    for(const callback of callbacks)callback(time);
  };
}
module.exports={manualAnimationClock};
