const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const period=slot=>`Day ${slot.start.day} ${slot.start.time} → Day ${slot.end.day} ${slot.end.time}`;

export function mountLightPlan(host,api,context) {
  const {crewId,day,mission,userId,role}=context;
  let disposed=false,pending=false,reading=false,initialized=false,requestVersion=0,lastReview='';
  const root=document.createElement('div');root.className='light-workspace';host.append(root);
  root.innerHTML=`<section id="cabin-lighting" aria-label="Cabin lighting status"><p>Loading cabin lighting…</p></section>
    <p id="light-error" role="alert" class="backend-error"></p><p id="light-receipt" role="status"></p>
    <section id="light-review" role="status" aria-label="Automatic review recommendation"></section>
    <div id="light-metrics" class="vitals light-compact-metrics" aria-label="Selected-day health summary"></div>
    <div class="light-settings-grid"><form id="light-preferences" class="card card-padding light-widget"><h3>Personal sleep schedule</h3><div class="light-time-fields"><label>Wake<input class="field" name="wakeTime" type="time" required></label><label>Bed<input class="field" name="bedTime" type="time" required></label></div><label><input name="autoReview" type="checkbox"> Automatic review reminders</label><button class="btn small">Save personal schedule</button></form>
    ${crewId===userId?'<form id="light-stress" class="card card-padding light-widget"><h3>Stress check-in</h3><label>How do you feel? (0–10)<input name="score" class="field" type="number" min="0" max="10" step="1" required></label><small>Self-report, not a sensor reading.</small><button class="btn small">Save my stress report</button></form>':'<article class="card card-padding light-widget"><h3>Stress check-in</h3><p>Only the selected astronaut can submit their own self-report.</p></article>'}
    ${role==='cmo'?'<form id="cabin-preferences" class="card card-padding light-widget"><h3>Shared cabin · UTC</h3><div class="light-time-fields"><label>Wake<input name="wakeTime" class="field" type="time" required></label><label>Bed<input name="bedTime" class="field" type="time" required></label></div><label><input name="autoEnabled" type="checkbox"> Automatic ambient lighting</label><button class="btn small">Save cabin schedule</button></form>':''}</div>
    <section aria-label="Selected-day light plan"><h3>Daily light plan · mission-local clock</h3><div id="light-calendar" class="light-calendar"></div></section>
    <div class="light-brief-grid"><article class="card card-padding light-widget"><h3>Daily reminders</h3><div id="light-reminders" class="backend-toolbar"></div><small>Reminder acknowledgments only, not treatment completion.</small></article><article class="card card-padding light-widget"><h3>Saved activity</h3><div id="light-history-summary">Loading…</div></article><article class="card card-padding light-widget light-red"><h3>Red-light research</h3><p id="light-research-summary">Review only · No treatment authorized.</p><button class="btn small" type="button" data-light-kind="red_review" data-light-action="requested">Request CMO / research review</button></article></div>
    <div class="eyebrow light-detail-heading">DETAILED EXPLANATIONS</div>
    <details><summary>How the daily light plan works</summary><div id="light-plan-explanation"></div><p>Personal times use the mission-local clock; shared cabin targets use Earth UTC. The 7–10 hour sleep-opportunity guard is a demo planning constraint, not a prescription. Stress 7/10 or fatigue signals can trigger a review, never automatic treatment. Urgent and symptom cautions remain active when automatic review is off.</p><p>Blue-enriched light can suppress melatonin and delay sleep; blue light is not a bedtime relaxation therapy. Warm wind-down and protected sleep do not override safety/task lighting or personal sleep quarters.</p></details>
    <details><summary>Action history details</summary><div id="light-history" class="backend-messages"></div></details>
    <details><summary>Research evidence & safety</summary><p>Photobiomodulation evidence depends on the condition and device. Astronaut cell regeneration or stress treatment is not established here. Research review only: no dosing, clinical approval or exposure control.</p><div id="light-sources"></div></details>`;
  const $=s=>root.querySelector(s);
  const reportError=e=>{if(!disposed)$('#light-error').textContent=e.message;};
  function render(data) {
    if(disposed)return;
    const r=data.review,m=r.metrics,stress=m.selfReportedStress;
    const cabin=data.cabinLighting;
    $('#cabin-lighting').innerHTML=cabin?`<article class="cabin-light-card ${esc(cabin.phase)}"><div><div class="eyebrow">SHARED CABIN · ${cabin.automatic?'AUTOMATIC':'OFF'} · SIMULATION</div><h2>${esc(cabin.label)}</h2><p>Warm wake-up → brighter daytime → gradual evening dimming → low night light.</p></div><div class="cabin-light-target"><strong>${cabin.targetBrightnessPct===null?'—':`${esc(cabin.targetBrightnessPct)}%`}</strong><small>Target · not measured</small></div><progress max="100" value="${cabin.targetBrightnessPct??0}" aria-label="Simulated cabin dimmer target" ${cabin.targetBrightnessPct===null?'hidden':''}></progress><p class="backend-info">Earth UTC ${esc(cabin.referenceTime.slice(11,19))} · No light device connected.</p></article>`:'<p>Cabin lighting data unavailable.</p>';
    const review=['routine','disabled'].includes(r.status)?`<p class="backend-info">Sleep-plan review: ${esc(r.status)} · No automatic treatment.</p>`:`<article class="light-review ${esc(r.status)}"><div class="eyebrow">AUTOMATIC REVIEW · ${esc(r.status.toUpperCase())}</div><h2>${r.status==='review'?'Review suggested — not a treatment order':r.status==='urgent'?'Medical assessment takes priority':'Symptoms need medical review'}</h2><p>${esc(r.action)}</p><ul>${r.reasons.map(reason=>`<li>${esc(reason)}</li>`).join('')}</ul><p>Rules are demo heuristics, not validated stress detection.</p>${r.status==='urgent'||r.status==='caution'?'<a class="btn" href="health-check.html">Open Health Check</a>':'<button class="btn" data-light-kind="auto_review" data-light-action="acknowledged">Acknowledge review reminder</button>'}</article>`;
    if(lastReview!==review) {
      lastReview=review;
      $('#light-review').innerHTML=review;
      const healthLink=$('#light-review a');
      if(healthLink)healthLink.href=`health-check.html?crewId=${encodeURIComponent(crewId)}&day=${day}&mission=${mission}`;
    }
    $('#light-metrics').innerHTML=`<article class="card card-padding light-widget"><h3>Sleep average</h3><strong>${esc(m.sleepHours7d)} h</strong><small>7-day metric on day ${day}</small></article><article class="card card-padding light-widget"><h3>Mood average</h3><strong>${esc(m.moodAvg7d)} / 5</strong><small>7-day metric on day ${day}</small></article><article class="card card-padding light-widget"><h3>Stress today</h3><strong>${stress?`${esc(stress.score)} / 10`:'Not reported'}</strong><small>${esc(stress?.at||'No sensor-derived stress score')}</small></article><article class="card card-padding light-widget"><h3>Data source</h3><p>${esc(m.baseOrigin)} · ${m.savedUpdates} saved updates</p><small>${esc(data.origin)}</small></article>`;
    if(!initialized) {
      const form=$('#light-preferences');form.elements.wakeTime.value=data.preferences.wakeTime;form.elements.bedTime.value=data.preferences.bedTime;form.elements.autoReview.checked=data.preferences.autoReview;
      if(stress && $('#light-stress'))$('#light-stress').elements.score.value=stress.score;
      const cabinForm=$('#cabin-preferences');
      if(cabinForm && cabin){cabinForm.elements.wakeTime.value=cabin.config.wakeTime;cabinForm.elements.bedTime.value=cabin.config.bedTime;cabinForm.elements.autoEnabled.checked=cabin.config.autoEnabled;}
      initialized=true;
    }
    const held=['urgent','caution'].includes(r.status);
    $('#light-reminders').innerHTML=['wake_cue','wind_down','sleep'].map(kind=>`<button class="btn small" data-light-kind="${kind}" data-light-action="acknowledged" ${held?'disabled':''}>Acknowledge ${kind.replaceAll('_',' ')}</button>`).join('')+(held?'<p>Routine reminder actions are held while medical review takes priority.</p>':'');
    const today=data.schedule.find(d=>d.day===day);
    $('#light-calendar').innerHTML=today?`<article class="card card-padding light-daily-plan"><h3>Mission day ${today.day}</h3><ol>${today.slots.map(slot=>`<li class="light-slot ${esc(slot.mode)}"><strong>${esc(slot.title)}</strong><span>${esc(period(slot))}</span></li>`).join('')}</ol></article>`:'<p>No plan available for the selected day.</p>';
    $('#light-plan-explanation').innerHTML=today?`<ul>${today.slots.map(slot=>`<li><strong>${esc(slot.title)}</strong> — ${esc(slot.description)}</li>`).join('')}</ul>`:'';
    const latest=data.events[0],research=data.events.filter(e=>e.kind==='red_review'&&e.action==='requested').length;
    $('#light-history-summary').innerHTML=`<strong>${data.events.length} recent actions</strong><p>${latest?`${esc(latest.kind)} · ${esc(latest.action)}`:'No saved actions on this day'}</p><small>${esc(latest?.at||'Selected day only')}</small>`;
    $('#light-research-summary').textContent=research?`${research} recent review request(s) · No treatment authorized.`:'Review only · No treatment authorized.';
    $('#light-history').innerHTML=data.events.map(e=>`<article class="backend-message"><strong>#${e.id} · ${esc(e.kind)} · ${esc(e.action)}</strong><p>${esc(e.at)} · ${esc(e.by_user||'Server rules')}</p><p>${esc(e.detail)}</p></article>`).join('')||'<p>No saved actions for this person, mission and day.</p>';
    $('#light-sources').innerHTML=`${cabin?`<p>${esc(cabin.summary||'Personal sleep quarters and safety/task lighting remain separate. Targets are illustrative, not measured light or a circadian dose.')} ${cabin.targetColorTemperatureK===null?'Automatic cabin targets are off.':`Illustrative color target: ${esc(cabin.targetColorTemperatureK)} K.`}</p>`:''}<p>${esc(data.limitations)}</p><ul>${data.sources.map(s=>`<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a><p>${esc(s.note)}</p></li>`).join('')}</ul>`;
  }
  async function load(){
    if(disposed||reading||pending)return;reading=true;const version=++requestVersion;
    try{const data=await api(`/api/light-plan?crewId=${encodeURIComponent(crewId)}&day=${day}&mission=${mission}`);if(version===requestVersion)render(data);}catch(e){if(version===requestVersion){reportError(e);if(!disposed)$('#cabin-lighting').textContent='Cabin lighting unavailable — live targets could not be refreshed.';}}finally{reading=false;}
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
    if(!['light-preferences','light-stress','cabin-preferences'].includes(e.target.id))return;e.preventDefault();
    const form=e.target;
    if(form.id==='light-preferences')save('/api/light-plan/preferences',{preferences:{wakeTime:form.elements.wakeTime.value,bedTime:form.elements.bedTime.value,autoReview:form.elements.autoReview.checked}},'PUT');
    else if(form.id==='cabin-preferences')save('/api/light-plan/cabin',{config:{wakeTime:form.elements.wakeTime.value,bedTime:form.elements.bedTime.value,autoEnabled:form.elements.autoEnabled.checked}},'PUT');
    else if(form.elements.score.value!=='')save('/api/light-plan/stress',{score:Number(form.elements.score.value)});
  });
  root.addEventListener('click',e=>{const button=e.target.closest('[data-light-action]');if(button&&!button.disabled)save('/api/light-plan/actions',{kind:button.dataset.lightKind,action:button.dataset.lightAction});});
  load();const timer=setInterval(load,5000);
  return ()=>{disposed=true;clearInterval(timer);};
}
