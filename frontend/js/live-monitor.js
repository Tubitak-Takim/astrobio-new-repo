const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function mountLiveMonitor(host,api,context) {
  const {crewId,day,mission}=context;
  let disposed=false,running=false,sending=false,reading=false,samples=0;
  const root=document.createElement('div');host.append(root);
  root.innerHTML=`<p class="crew-notice">Live ingestion demonstration · No physical sensor is connected. Demo values are generated in this browser and saved through the same authenticated API as manual entries. Only supplied fields change; older labs and images are preserved. Observations apply to the selected mission and day.</p>
    <div class="backend-toolbar"><button class="btn primary" id="live-start">Start demo stream</button><button class="btn" id="live-stop" disabled>Stop stream</button><span id="live-status" role="status">Stream stopped · Monitoring API every 2 seconds</span></div>
    <p id="live-error" role="alert"></p><p id="live-save" role="status"></p>
    <h2>Send a live measurement</h2><form id="live-entry"><div class="backend-checkin">
    ${[['restingHrBpm','Resting heart rate (bpm)',20,220,1],['spo2Pct','SpO₂ (%)',50,100,1],['bodyTempC','Temperature (°C)',30,43,.1],['systolicBp','Systolic pressure (mmHg)',50,260,1],['diastolicBp','Diastolic pressure (mmHg)',30,160,1]].map(([key,label,min,max,step])=>`<label>${label}<input class="field" name="${key}" type="number" min="${min}" max="${max}" step="${step}"></label>`).join('')}
    <label>Reported headache<select class="field" name="headache"><option value="">Unchanged</option><option value="true">Yes</option><option value="false">No</option></select></label></div><button class="btn primary">Save supplied fields</button></form>
    <h2>Incoming measurements</h2><p id="live-summary" aria-live="polite">Waiting for server…</p><div id="live-values" class="vitals"></div><div id="live-events" class="backend-messages"></div>
    <details><summary>Authenticated ingestion API</summary><p>POST /api/observations · Authorization: Bearer &lt;session token&gt;. GET the same endpoint with crewId, day and mission to read recent samples. Use external_api as source for an external sender; this is sender-declared metadata, not proof of hardware connectivity. Never put tokens on screen or in URLs.</p><pre>${esc(JSON.stringify({crewId,day,mission,source:'external_api',values:{restingHrBpm:78,spo2Pct:98}},null,2))}</pre></details>`;
  const $=s=>root.querySelector(s),error=e=>{if(!disposed)$('#live-error').textContent=e.message;};
  const query=`crewId=${encodeURIComponent(crewId)}&day=${day}&mission=${mission}`;
  async function update() {
    if(disposed || reading)return;reading=true;
    try {
      const [data,assessment]=await Promise.all([api('/api/observations?'+query),api(`/api/assessment?day=${day}&mission=${mission}&mode=space`)]);
      if(disposed)return;
      $('#live-summary').textContent=`${data.total} saved samples · Server checked ${data.serverTime} · Showing latest 50`;
      $('#live-events').innerHTML=data.observations.map(o=>`<article class="backend-message"><strong>#${o.id} · ${esc(o.source)}</strong><p>Measured: ${esc(o.measuredAt)} · Received: ${esc(o.receivedAt)}</p><p>${esc(JSON.stringify(o.values))}</p></article>`).join('')||'<p>No live samples yet. Start the demo or send a measurement.</p>';
      const subject=assessment.subjects.find(s=>s.id===crewId);
      $('#live-values').innerHTML=(subject?.space||[]).filter(f=>['vitals','basics','headache'].includes(f.id)).map(f=>`<article class="card card-padding"><strong>${esc(f.title)} · ${esc(f.level.toUpperCase())}</strong><p>${esc(f.measured)}</p><small>${esc(subject.info[f.id]?.source)}</small></article>`).join('');
    } catch(e){error(e);}finally{reading=false;}
  }
  async function send(values,source) {
    if(disposed||sending)return;sending=true;
    try {
      const result=await api('/api/observations',{method:'POST',body:JSON.stringify({crewId,day,mission,source,values})});
      if(disposed)return;
      $('#live-save').textContent=`Saved #${result.observation.id} to ${crewId} · Day ${day} · ${result.observation.receivedAt}`;
      $('#live-error').textContent='';await update();
    }catch(e){error(e);if(source==='demo_stream')stop();}finally{sending=false;}
  }
  function stop(){running=false;$('#live-start').disabled=false;$('#live-stop').disabled=true;$('#live-status').textContent='Stream stopped · Monitoring API every 2 seconds. An in-flight sample may still finish.';}
  $('#live-start').onclick=()=>{running=true;$('#live-start').disabled=true;$('#live-stop').disabled=false;$('#live-status').textContent='DEMO STREAM RUNNING · Synthetic samples every 3 seconds';tick();};
  $('#live-stop').onclick=stop;
  function tick(){if(!running||disposed)return;samples++;send({restingHrBpm:Math.round(74+5*Math.sin(samples/3)),spo2Pct:97+samples%2,bodyTempC:36.7},'demo_stream');}
  $('#live-entry').onsubmit=async e=>{e.preventDefault();const values={};for(const [key,value] of new FormData(e.target))if(value!=='')values[key]=key==='headache'?value==='true':Number(value);if(!Object.keys(values).length){error(new Error('Enter at least one measurement.'));return;}await send(values,'manual_entry');};
  const poll=setInterval(update,2000),demo=setInterval(tick,3000);update();
  return ()=>{disposed=true;running=false;clearInterval(poll);clearInterval(demo);};
}
