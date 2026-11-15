// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { mountLiveMonitor } from '../frontend/js/live-monitor.js';
let dispose;
afterEach(()=>{dispose?.();vi.useRealTimers();document.body.replaceChildren();});
function boot(){
  const api=vi.fn(async(path,options)=>{
    if(options)return {observation:{id:7,receivedAt:'2026-11-15T12:00:00Z'}};
    if(path.startsWith('/api/assessment'))return {subjects:[]};
    return {total:1,serverTime:'2026-11-15T12:00:00Z',observations:[{id:7,source:'demo_stream',measuredAt:'2026-11-15T12:00:00Z',receivedAt:'2026-11-15T12:00:00Z',values:{restingHrBpm:77}}]};
  });
  dispose=mountLiveMonitor(document.body,api,{crewId:'C1',day:60,mission:'mars'});return api;
}
it('shows source, timestamps and receipts and stops demo writes on stop/dispose',async()=>{
  vi.useFakeTimers();const api=boot();await vi.advanceTimersByTimeAsync(1);
  expect(document.body.textContent).toContain('No physical sensor');
  expect(document.body.textContent).toContain('Measured: 2026-11-15');
  document.querySelector('#live-start').click();await vi.advanceTimersByTimeAsync(6000);
  const writes=()=>api.mock.calls.filter(([,options])=>options?.method==='POST');
  expect(writes().length).toBeGreaterThanOrEqual(2);
  expect(JSON.parse(writes()[0][1].body)).toMatchObject({crewId:'C1',source:'demo_stream',day:60,mission:'mars'});
  expect(document.body.textContent).toContain('Saved #7');
  document.querySelector('#live-stop').click();const count=writes().length;
  await vi.advanceTimersByTimeAsync(6000);expect(writes()).toHaveLength(count);
  dispose();const calls=api.mock.calls.length;await vi.advanceTimersByTimeAsync(6000);expect(api).toHaveBeenCalledTimes(calls);
});
it('sends only supplied manual fields and leaves empty fields unchanged',async()=>{
  const api=boot();document.querySelector('[name=restingHrBpm]').value='99';
  document.querySelector('#live-entry').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  await vi.waitFor(()=>expect(api.mock.calls.some(([,options])=>options?.method==='POST')).toBe(true));
  const [,options]=api.mock.calls.find(([,options])=>options?.method==='POST');
  expect(JSON.parse(options.body)).toMatchObject({source:'manual_entry',values:{restingHrBpm:99}});
  expect(Object.keys(JSON.parse(options.body).values)).toEqual(['restingHrBpm']);
});
