const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const period=slot=>`Day ${slot.start.day} ${slot.start.time} → Day ${slot.end.day} ${slot.end.time}`;

export function mountLightPlan(host,api,context) {
  const {crewId,day,mission,userId}=context;
  let disposed=false,pending=false,reading=false,initialized=false,requestVersion=0,lastReview='';
  const root=document.createElement('div');root.className='light-workspace';host.append(root);
  root.innerHTML=`<p class="crew-notice">Circadian planning demo · No light device connected · No treatment is started by this page. Calendar windows are illustrative, not light-exposure doses. Mission-local clock, not your browser clock or planetary daylight.</p>
    <div class="light-science-grid"><article class="card card-padding light-day"><h2>Daytime alertness</h2><p>Daytime lighting may support circadian timing and alertness. Actual timing and equipment require a mission-approved plan; this is not a blue-light prescription.</p></article><article class="card card-padding light-warm"><h2>Wind down before sleep</h2><p>Blue-enriched light can suppress melatonin and delay sleep. Plan dim, warm-toned ambient light before bed and darkness during sleep; blue light is not a bedtime relaxation therapy.</p></article><article class="card card-padding light-red"><h2>Red-light research</h2><p>Photobiomodulation evidence depends on the condition and device. Astronaut cell regeneration or stress treatment is not established here. Research review only: no dosing, clinical approval or exposure control.</p><button class="btn" type="button" data-light-kind="red_review" data-light-action="requested">Request CMO / research review</button></article></div>
    <p id="light-error" role="alert" class="backend-error"></p><p id="light-receipt" role="status"></p>
    <section id="light-review" role="status" aria-label="Automatic review recommendation"></section>
    <div id="light-metrics" class="vitals"></div>
    <div class="light-settings-grid"><form id="light-preferences" class="card card-padding"><h2>Personal mission-clock schedule</h2><label>Wake time<input class="field" name="wakeTime" type="time" required></label><label>Bed time<input class="field" name="bedTime" type="time" required></label><label><input name="autoReview" type="checkbox"> Automatically suggest a CMO review for stress / fatigue signals</label><p class="backend-info">Demo guard: plan a 7–10 hour sleep opportunity. This does not prove adequate sleep or authorize a light treatment. Urgent/symptom warnings remain active when automatic review is off.</p><button class="btn primary">Save schedule preferences</button></form>
    ${crewId===userId?'<form id="light-stress" class="card card-padding"><h2>How stressed do you feel?</h2><label>Self-reported stress (0–10)<input name="score" class="field" type="number" min="0" max="10" step="1" required></label><p class="backend-info">A personal report, not a sensor measurement or diagnosis. A score of 7 or more triggers the demo review rule when enabled. No light exposure is started.</p><button class="btn primary">Save my stress report</button></form>':'<article class="card card-padding"><h2>Stress self-report</h2><p>Only the signed-in astronaut can submit their own stress score. Viewing a colleague does not let you report their stress as your own.</p></article>'}</div>
    <section><h2>Selected-day reminders</h2><div id="light-reminders" class="backend-toolbar"></div><p class="backend-info">Acknowledgments record reminders, not treatment completion, exposure or clinical benefit.</p></section>
    <h2>Seven-day planning calendar</h2><div id="light-calendar" class="light-calendar"></div>
    <h2>Saved actions and automatic review history</h2><div id="light-history" class="backend-messages"></div>
    <details><summary>Evidence, safety and prototype limits</summary><div id="light-sources"></div></details>`;
  const $=s=>root.querySelector(s);
  const reportError=e=>{if(!disposed)$('#light-error').textContent=e.message;};
  function render(data) {
    if(disposed)return;
    const r=data.review,m=r.metrics,stress=m.selfReportedStress;
    const review=`<article class="light-review ${esc(r.status)}"><div class="eyebrow">AUTOMATIC REVIEW · ${esc(r.status.toUpperCase())}</div><h2>${r.status==='review'?'Review suggested — not a treatment order':r.status==='urgent'?'Medical assessment takes priority':r.status==='caution'?'Symptoms need medical review':'Circadian planning status'}</h2><p>${esc(r.action)}</p><ul>${r.reasons.map(reason=>`<li>${esc(reason)}</li>`).join('')}</ul><p>Rules are demo heuristics, not validated stress detection. No measured stress level is available.</p>${r.status==='urgent'||r.status==='caution'?'<a class="btn" href="health-check.html">Open Health Check</a>':r.status==='review'?'<button class="btn" data-light-kind="auto_review" data-light-action="acknowledged">Acknowledge review reminder</button>':''}</article>`;
    if(lastReview!==review) {
      lastReview=review;
      $('#light-review').innerHTML=review;
      const healthLink=$('#light-review a');
      if(healthLink)healthLink.href=`health-check.html?crewId=${encodeURIComponent(crewId)}&day=${day}&mission=${mission}`;
    }
    $('#light-metrics').innerHTML=`<article class="card card-padding"><h3>7-day sleep average</h3><strong>${esc(m.sleepHours7d)} hours</strong></article><article class="card card-padding"><h3>7-day mood average</h3><strong>${esc(m.moodAvg7d)} / 5</strong></article><article class="card card-padding"><h3>Self-reported stress</h3><strong>${stress?`${esc(stress.score)} / 10`:'No report for this day'}</strong><p>${esc(stress?.at||'No sensor-derived stress score')}</p></article><article class="card card-padding"><h3>Data provenance</h3><p>Base: ${esc(m.baseOrigin)} · ${m.savedUpdates} saved health updates</p><p>Schedule: ${esc(data.origin)} · ${esc(data.version)}</p></article>`;
    if(!initialized) {
      const form=$('#light-preferences');form.elements.wakeTime.value=data.preferences.wakeTime;form.elements.bedTime.value=data.preferences.bedTime;form.elements.autoReview.checked=data.preferences.autoReview;
      if(stress && $('#light-stress'))$('#light-stress').elements.score.value=stress.score;
      initialized=true;
    }
    const held=['urgent','caution'].includes(r.status);
    $('#light-reminders').innerHTML=['wake_cue','wind_down','sleep'].map(kind=>`<button class="btn" data-light-kind="${kind}" data-light-action="acknowledged" ${held?'disabled':''}>Acknowledge ${kind.replaceAll('_',' ')} reminder</button>`).join('')+(held?'<p>Routine reminder actions are held while medical review takes priority.</p>':'');
    $('#light-calendar').innerHTML=data.schedule.map(d=>`<article class="card card-padding"><h3>Mission day ${d.day}</h3><ol>${d.slots.map(slot=>`<li class="light-slot ${esc(slot.mode)}"><strong>${esc(slot.title)}</strong><span>${esc(period(slot))}</span><p>${esc(slot.description)}</p></li>`).join('')}</ol></article>`).join('');
    $('#light-history').innerHTML=data.events.map(e=>`<article class="backend-message"><strong>#${e.id} · ${esc(e.kind)} · ${esc(e.action)}</strong><p>${esc(e.at)} · ${esc(e.by_user||'Server rules')}</p><p>${esc(e.detail)}</p></article>`).join('')||'<p>No saved actions for this person, mission and day.</p>';
    $('#light-sources').innerHTML=`<p>${esc(data.limitations)}</p><ul>${data.sources.map(s=>`<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a><p>${esc(s.note)}</p></li>`).join('')}</ul>`;
  }
  async function load(){
    if(disposed||reading||pending)return;reading=true;const version=++requestVersion;
    try{const data=await api(`/api/light-plan?crewId=${encodeURIComponent(crewId)}&day=${day}&mission=${mission}`);if(version===requestVersion)render(data);}catch(e){if(version===requestVersion)reportError(e);}finally{reading=false;}
  }
  async function save(path,body,method='POST'){
    if(pending||disposed)return;pending=true;++requestVersion;
    try {
      const data=await api(path,{method,body:JSON.stringify({crewId,day,mission,...body})});
      if(disposed)return;
      render(data.plan);$('#light-error').textContent='';$('#light-receipt').textContent=`Saved #${data.receipt.id} · ${crewId} · Day ${day} · ${mission} · ${data.receipt.at}. No device command was sent.`;
    }catch(e){reportError(e);}finally{pending=false;}
  }
  root.addEventListener('submit',e=>{
    if(!['light-preferences','light-stress'].includes(e.target.id))return;e.preventDefault();
    const form=e.target;
    if(form.id==='light-preferences')save('/api/light-plan/preferences',{preferences:{wakeTime:form.elements.wakeTime.value,bedTime:form.elements.bedTime.value,autoReview:form.elements.autoReview.checked}},'PUT');
    else if(form.elements.score.value!=='')save('/api/light-plan/stress',{score:Number(form.elements.score.value)});
  });
  root.addEventListener('click',e=>{const button=e.target.closest('[data-light-action]');if(button&&!button.disabled)save('/api/light-plan/actions',{kind:button.dataset.lightKind,action:button.dataset.lightAction});});
  load();const timer=setInterval(load,5000);
  return ()=>{disposed=true;clearInterval(timer);};
}
