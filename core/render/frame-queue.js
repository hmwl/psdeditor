



export function createFrameQueue({ submit, isCurrent = () => true, onError = () => {}, maxInFlight = 2,
  schedule = cb => requestAnimationFrame(cb), unschedule = id => cancelAnimationFrame(id), now = () => performance.now() }) {
  const limit = Math.max(1, maxInFlight | 0), waiters = [], latencies = [];
  const counts = { requested: 0, submitted: 0, completed: 0, coalesced: 0, discarded: 0, skipped: 0, backgroundSubmitted: 0, backgroundCompleted: 0, maxObservedInFlight: 0, lastSubmitted: 0, lastCompleted: 0 };
  let active = 0, pending = null, scheduled = null, running = false, disposed = false, failure = null, epoch = 0, submittedEpoch = -1;
  const idle = () => !active && !pending && scheduled === null;
  function notify(){
    if (!idle() && !failure && !disposed) return;
    for (const w of waiters.splice(0)) { if (failure) w.reject(failure); else w.resolve(); }
  }
  function cancel(){
    if (pending) { pending.payload = null; pending = null; counts.discarded++; }
    if (scheduled !== null) { unschedule(scheduled); scheduled = null; }
    notify();
  }
  function fail(error){
    if (failure || disposed) { notify(); return; }
    failure = error instanceof Error ? error : new Error(String(error));
    cancel(); onError(failure); notify();
  }
  function reserve(){ active++; counts.maxObservedInFlight = Math.max(counts.maxObservedInFlight, active); }
  function scheduleNext(){
    if (disposed || failure || !pending || scheduled !== null || running) return;
    
    
    scheduled = schedule(() => { scheduled = null; epoch++; drain(true); });
  }
  function drain(deferred, force = false){
    if (disposed || failure || running || !pending || active >= limit) return false;
    if (!force && submittedEpoch === epoch) { scheduleNext(); return false; }
    if (scheduled !== null) { unschedule(scheduled); scheduled = null; }
    const item = pending; pending = null;
    let current;
    try { current = isCurrent(item.payload); } catch (e) { item.payload = null; fail(e); return false; }
    if (!current) { item.payload = null; counts.discarded++; notify(); return false; }
    running = true; reserve();
    let result, started = now();
    try { result = submit(item.payload, deferred); }
    catch (e) { active--; item.payload = null; running = false; fail(e); return false; }
    item.payload = null; running = false;
    if (result === false) { active--; counts.discarded++; scheduleNext(); notify(); return false; }
    if (result === null) { active--; counts.skipped++; scheduleNext(); notify(); return true; }
    counts.submitted++; counts.lastSubmitted = item.id;
    submittedEpoch = epoch;
    Promise.resolve(result).then(() => {
      active--; counts.completed++; counts.lastCompleted = Math.max(counts.lastCompleted, item.id);
      const completedAt = now();
      latencies.push({ id: item.id, completedAt, waitMs: started - item.time, gpuMs: completedAt - started, totalMs: completedAt - item.time });
      if (latencies.length > 1024) latencies.shift();
      
      
      drain(true, !!waiters.length); notify();
    }, e => { active--; fail(e); });
    scheduleNext();
    return true;
  }
  return {
    get busy(){ return !idle(); },
    get stats(){ return { ...counts, inFlight: active, pending: !!pending, scheduled: scheduled !== null, limit, disposed, failed: !!failure, latencies: latencies.slice() }; },
    request(payload){
      if (disposed || failure) return false;
      if (pending) { pending.payload = null; counts.coalesced++; }
      pending = { payload, id: ++counts.requested, time: now() };
      if (!active && !running && submittedEpoch !== epoch) return drain(false);
      scheduleNext(); return true;
    },
    
    
    
    background(task){
      if (disposed || failure || !idle() || running) return null;
      reserve(); counts.backgroundSubmitted++;
      let result;
      try { result = task(); } catch (e) { result = Promise.reject(e); }
      return Promise.resolve(result).finally(() => { active--; counts.backgroundCompleted++; drain(true, !!waiters.length); notify(); });
    },
    flush(){
      if (failure) return Promise.reject(failure);
      if (disposed) return Promise.resolve();
      drain(true, true);
      if (idle()) return Promise.resolve();
      return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
    },
    cancel,
    dispose(){ disposed = true; cancel(); notify(); },
  };
}
