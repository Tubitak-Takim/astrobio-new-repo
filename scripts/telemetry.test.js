// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { mountTelemetryPanel } from '../frontend/js/telemetry.js';
let dispose;
afterEach(()=>{dispose?.();vi.restoreAllMocks();document.body.replaceChildren();});
const bundle={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',mission:'mars',day:60,delivered:false,rowCount:100,compressedBytes:2048,sha256:'a'.repeat(64),crewIds:['C1'],createdAt:'2026-11-15T12:00:00Z',delayMinutes:16};
function boot(role='crew') {
  const api=vi.fn(async(path,options)=>options?{bundle}:{bundles:[bundle]}),download=vi.fn(async()=>{});
  window.confirm=vi.fn(()=>true);
  dispose=mountTelemetryPanel(document.body,api,download,{day:60,mission:'mars',role});return {api,download};
}
it('keeps CSV download separate from transmission and hides history details initially',async()=>{
  const {api,download}=boot();
  expect(document.querySelector('details').open).toBe(false);
  expect(api.mock.calls.some(([,options])=>options?.method==='POST')).toBe(false);
  document.querySelector('[data-telemetry=export]').click();
  await vi.waitFor(()=>expect(download).toHaveBeenCalledWith('/api/telemetry/export.csv?day=60&mission=mars'));
  expect(document.querySelector('[data-telemetry-status]').textContent).toContain('not sent to Earth');
});
it('requires confirmation and queues one authorized snapshot with a duplicate-safe request ID',async()=>{
  const {api}=boot();window.confirm.mockReturnValue(false);
  document.querySelector('[data-telemetry=queue]').click();expect(api.mock.calls.some(([,o])=>o?.method==='POST')).toBe(false);
  window.confirm.mockReturnValue(true);document.querySelector('[data-telemetry=queue]').click();
  await vi.waitFor(()=>expect(document.querySelector('[data-telemetry-status]').textContent).toContain('Queued for Earth (demo)'));
  const [,options]=api.mock.calls.find(([,o])=>o?.method==='POST');
  expect(JSON.parse(options.body)).toMatchObject({day:60,mission:'mars',requestId:expect.stringMatching(/^[0-9a-f-]{36}$/)});
  expect(document.body.textContent).toContain('No physical transmission');
});
it('gives Earth only delivered-download controls, never live export or send controls',async()=>{
  const {download}=boot('surgeon');
  expect(document.querySelector('[data-telemetry=export]')).toBeNull();expect(document.querySelector('[data-telemetry=queue]')).toBeNull();
  await vi.waitFor(()=>expect(document.querySelector('[data-telemetry=bundle]')).not.toBeNull());
  document.querySelector('[data-telemetry=bundle]').click();
  await vi.waitFor(()=>expect(download).toHaveBeenCalledWith(`/api/telemetry/bundles/${bundle.id}/csv`));
});
it('reuses the request ID after an uncertain queue failure',async()=>{
  const {api}=boot();let failed=false;
  api.mockImplementation(async(path,options)=>{if(!options)return {bundles:[]};if(!failed){failed=true;throw new Error('Network interrupted');}return {bundle};});
  document.querySelector('[data-telemetry=queue]').click();
  await vi.waitFor(()=>expect(document.querySelector('[data-telemetry-error]').textContent).toContain('Network interrupted'));
  document.querySelector('[data-telemetry=queue]').click();
  await vi.waitFor(()=>expect(document.querySelector('[data-telemetry-status]').textContent).toContain('Queued for Earth'));
  const writes=api.mock.calls.filter(([,o])=>o?.method==='POST');expect(JSON.parse(writes[0][1].body).requestId).toBe(JSON.parse(writes[1][1].body).requestId);
});
