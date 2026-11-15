// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';

it('renders the provided non-WebGL layouts with their original navigation and charts',()=>{
  document.body.innerHTML='';
  document.body.dataset.startRoute='overview';
  window.scrollTo=vi.fn();
  new Function(readFileSync('frontend/js/shell.js','utf8'))();
  new Function(readFileSync('frontend/js/data.js','utf8'))();
  new Function(readFileSync('frontend/js/app.js','utf8'))();
  document.dispatchEvent(new Event('DOMContentLoaded'));
  const routes=['overview','crew-data','live','ai','personal','measurements','bis','ridge','reports','calendar','sleep','recovery','load','mission-health','insights'];
  for(const route of routes) {
    window.location.hash=route;
    window.dispatchEvent(new Event('hashchange'));
    expect(document.querySelector('#main h1')?.textContent,route).toBeTruthy();
    expect(document.querySelector('.nav-link.active')?.dataset.route,route).toBe(route);
    expect(document.querySelector('#main').innerHTML,route).not.toMatch(/NaN|undefined/);
    expect(document.querySelector('#main').textContent,route).not.toMatch(/[çğıöşüÇĞİÖŞÜ]|Görev|Simülasyon|Veri kalitesi/);
  }
  expect(document.querySelector('.nav-group-label').textContent).toBe('DAILY INDICATORS');
  window.location.hash='';
});
