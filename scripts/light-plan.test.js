// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { mountLightPlan } from '../frontend/js/light-plan.js';
import { lightPlanFixture } from './light-plan.fixture.js';
let dispose;
afterEach(()=>{dispose?.();vi.useRealTimers();document.body.replaceChildren();});
function boot(userId='C1') {
  const api=vi.fn(async(path,options)=>{
    if(!options)return structuredClone(lightPlanFixture);
    const body=JSON.parse(options.body),plan=structuredClone(lightPlanFixture);
    if(path.endsWith('/stress')){plan.review.status='review';plan.review.action='Review sleep and ambient lighting, not treatment.';plan.review.reasons=['Self-reported stress 8/10 meets the demo rule.'];plan.review.metrics.selfReportedStress={score:body.score,at:'2026-11-15T12:00:00Z'};}
    return {persisted:true,receipt:{id:7,at:'2026-11-15T12:00:00Z'},plan};
  });
  dispose=mountLightPlan(document.body,api,{crewId:'C1',day:60,mission:'mars',userId});return api;
}
it('renders a seven-day calendar with the blue-light correction and research-only red panel',async()=>{
  boot();await vi.waitFor(()=>expect(document.querySelectorAll('#light-calendar article')).toHaveLength(7));
  expect(document.body.textContent).toContain('blue light is not a bedtime relaxation therapy');
  expect(document.body.textContent).toContain('No light device connected');
  expect(document.body.textContent).toContain('Research review only');
  expect(document.querySelector('[data-light-action=started]')).toBeNull();
  expect(document.querySelector('[name=wakeTime]').value).toBe('06:30');
});
it('saves a self-reported stress score and displays an automatic review without starting treatment',async()=>{
  const api=boot();await vi.waitFor(()=>expect(document.querySelector('#light-calendar').textContent).toContain('Mission day 60'));
  document.querySelector('#light-stress [name=score]').value='8';
  document.querySelector('#light-stress').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  await vi.waitFor(()=>expect(document.querySelector('#light-review').textContent).toContain('Review suggested — not a treatment order'));
  expect(document.querySelector('#light-receipt').textContent).toContain('Saved #7');
  const call=api.mock.calls.find(([path])=>path.endsWith('/stress'));
  expect(JSON.parse(call[1].body)).toEqual({crewId:'C1',day:60,mission:'mars',score:8});
});
it('allows research-review requests only and does not let a CMO self-report for a colleague',async()=>{
  const api=boot('C2');await vi.waitFor(()=>expect(document.querySelectorAll('#light-calendar article')).toHaveLength(7));
  expect(document.querySelector('#light-stress')).toBeNull();
  document.querySelector('[data-light-kind=red_review]').click();
  await vi.waitFor(()=>expect(api.mock.calls.some(([path])=>path.endsWith('/actions'))).toBe(true));
  expect(JSON.parse(api.mock.calls.find(([path])=>path.endsWith('/actions'))[1].body)).toMatchObject({kind:'red_review',action:'requested'});
});
it('polls without overwriting unsaved schedule edits and stops on disposal',async()=>{
  vi.useFakeTimers();const api=boot();await vi.advanceTimersByTimeAsync(1);
  document.querySelector('[name=wakeTime]').value='08:00';
  await vi.advanceTimersByTimeAsync(5000);
  expect(document.querySelector('[name=wakeTime]').value).toBe('08:00');
  dispose();const count=api.mock.calls.length;await vi.advanceTimersByTimeAsync(10_000);expect(api).toHaveBeenCalledTimes(count);
});
it('does not let an older in-flight poll hide a newly saved review recommendation',async()=>{
  vi.useFakeTimers();let finish;
  const updated=structuredClone(lightPlanFixture);updated.review.status='review';updated.review.action='Review the ambient plan, not treatment.';
  const api=vi.fn((path,options)=>options?Promise.resolve({plan:updated,receipt:{id:9,at:'2026-11-15T12:00:00Z'}}):new Promise(resolve=>{finish=resolve;}));
  dispose=mountLightPlan(document.body,api,{crewId:'C1',day:60,mission:'mars',userId:'C1'});
  document.querySelector('#light-stress [name=score]').value='8';
  document.querySelector('#light-stress').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  await vi.advanceTimersByTimeAsync(1);
  expect(document.querySelector('#light-review').textContent).toContain('Review suggested');
  finish(structuredClone(lightPlanFixture));await vi.advanceTimersByTimeAsync(1);
  expect(document.querySelector('#light-review').textContent).toContain('Review suggested');
});
