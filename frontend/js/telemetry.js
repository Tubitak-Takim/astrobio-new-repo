const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountTelemetryPanel(host,api,downloadCsv,context) {
  const {day,mission,role}=context;let disposed=false,pending=false,requestId=null;
  const root=document.createElement('section');root.className='telemetry-panel';host.append(root);
  root.innerHTML=`<h3>Mission CSV · Earth transfer</h3><p class="backend-info">${role==='surgeon'?'Delivered snapshots only.':role==='cmo'?'All four authorized crew · days 1–'+day+'.':'Your own records · days 1–'+day+'.'} Structured health, cabin and lighting data; no images, private notes or credentials. Simulation only.</p>${role==='surgeon'?'':`<div class="backend-toolbar"><button class="btn" data-telemetry="export">Download one CSV</button><button class="btn primary" data-telemetry="queue">Queue for Earth (demo)</button></div>`}<p class="backend-info" data-telemetry-status role="status">Downloading is not sending. Demo delivery follows the mission delay; use Refresh to check arrivals.</p><p class="backend-error" data-telemetry-error role="alert"></p><details><summary>Export history & integrity</summary><div data-telemetry-history></div></details>`;
  const $=s=>root.querySelector(s),error=e=>{if(!disposed)$('[data-telemetry-error]').textContent=e.message;};
  async function load() {
    const data=await api('/api/telemetry/bundles');if(disposed)return;
    $('[data-telemetry-history]').innerHTML=data.bundles.map(b=>`<article class="backend-message"><strong>${esc(b.mission.toUpperCase())} · Days 1–${b.day} · ${b.delivered?'Delivered (demo)':'Queued (demo)'}</strong><p>${b.rowCount} rows · ${Math.ceil(b.compressedBytes/1024)} KB compressed · SHA-256 ${esc(b.sha256.slice(0,12))}…</p><p>${esc(b.createdAt)} · ${esc(b.crewIds.join(', '))}</p><button class="btn small" data-telemetry="bundle" data-id="${esc(b.id)}">Download saved CSV</button></article>`).join('')||'<p>No authorized snapshots available.</p>';
  }
  root.addEventListener('click',async e=>{
    const button=e.target.closest('[data-telemetry]');if(!button||pending||disposed)return;
    if(button.dataset.telemetry==='queue'&&!window.confirm('Queue all authorized structured records through the simulated Earth link? Images, private notes and credentials are excluded. This is not a real transmission.'))return;
    pending=true;root.querySelectorAll('button').forEach(b=>{b.disabled=true;});$('[data-telemetry-error]').textContent='';
    try {
      const action=button.dataset.telemetry;
      if(action==='export') {
        await downloadCsv(`/api/telemetry/export.csv?day=${day}&mission=${mission}`);
        if(!disposed)$('[data-telemetry-status]').textContent='CSV downloaded locally — not sent to Earth.';
      }else if(action==='bundle') {
        await downloadCsv(`/api/telemetry/bundles/${encodeURIComponent(button.dataset.id)}/csv`);
        if(!disposed)$('[data-telemetry-status]').textContent='Saved CSV downloaded; server SHA-256 integrity check passed. Physical delivery is not verified.';
      }else if(action==='queue') {
        requestId ||= crypto.randomUUID();
        const data=await api('/api/telemetry/bundles',{method:'POST',body:JSON.stringify({day,mission,requestId})});requestId=null;
        if(disposed)return;
        const b=data.bundle;$('[data-telemetry-status]').textContent=`Queued for Earth (demo) · ${b.rowCount} rows · ${b.delayMinutes} min signal delay, accelerated in this prototype. No physical transmission.`;
        root.querySelector('details').open=true;await load();
      }
    }catch(e){error(e);}finally{pending=false;if(!disposed)root.querySelectorAll('button').forEach(b=>{b.disabled=false;});}
  });
  load().catch(error);return ()=>{disposed=true;};
}
