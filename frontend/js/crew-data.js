// Display only server-authorized time series. No clinical scores or inferred BIS.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=v=>Number(v).toLocaleString('en-US',{maximumFractionDigits:2});
const label={sleepHours7d:'Sleep (7-day average)',restingHrBpm:'Resting heart rate',moodAvg7d:'Mood (7-day average)',bodyMassKg:'Body mass',urineLitersDay:'Urine output',co2MmHg:'Cabin CO₂',hematocritPct:'Hematocrit',cumulativeDoseMSv:'Cumulative radiation dose'};
const unit={sleepHours7d:'hours',restingHrBpm:'bpm',moodAvg7d:'1–5',bodyMassKg:'kg',urineLitersDay:'L/day',co2MmHg:'mmHg',hematocritPct:'%',cumulativeDoseMSv:'mSv'};
const value=(p,key)=>key==='co2MmHg'||key==='cumulativeDoseMSv'?p.cabin[key]:p.reading[key];
const origin=p=>p.observations?.length?`${p.origin} + saved field updates (${p.observations.map(o=>o.source).join(', ')})`:p.origin;
const fieldOrigin=(p,key)=>{const o=p.observations?.filter(o=>Object.hasOwn(o.values,key)).at(-1);return o?`${o.source} · ${o.measuredAt}`:p.origin;};

function chart(series,key) {
  const values=series.map(p=>value(p,key)),min=Math.min(...values),max=Math.max(...values),pad=Math.max((max-min)*.15,.1);
  const lo=min-pad,hi=max+pad,x=i=>45+i*390/Math.max(1,series.length-1),y=v=>18+130-(v-lo)/(hi-lo)*130;
  return `<svg class="crew-chart" viewBox="0 0 460 185" role="img" aria-label="${label[key]} from mission day ${series[0].day} to ${series.at(-1).day}"><line x1="45" y1="148" x2="440" y2="148" stroke="#56758a"/><text x="2" y="25">${number(hi)}</text><text x="2" y="148">${number(lo)}</text><polyline fill="none" stroke="#24d9f6" stroke-width="2" points="${values.map((v,i)=>`${x(i)},${y(v)}`).join(' ')}"/>${series.map((p,i)=>`<circle cx="${x(i)}" cy="${y(values[i])}" r="${p.origin==='manual_checkin'?3.8:2}" fill="${p.origin==='manual_checkin'?'#ffb842':'#24d9f6'}"><title>Snapshot day ${p.day}; measured day ${p.measurementDays?.[key]??p.day}: ${number(values[i])} ${unit[key]} · ${p.origin}</title></circle>`).join('')}<text x="45" y="176">Day ${series[0].day}</text><text x="370" y="176">Day ${series.at(-1).day}</text></svg>`;
}
const pairs={
  'sleep-heart':{x:p=>p.reading.sleepHours7d,y:p=>p.reading.restingHrBpm,xLabel:'Sleep (hours)',yLabel:'Resting heart rate (bpm)'},
  'sleep-mood':{x:p=>p.reading.sleepHours7d,y:p=>p.reading.moodAvg7d,xLabel:'Sleep (hours)',yLabel:'Mood (1–5)'},
  'urine-heart':{x:p=>p.reading.urineLitersDay,y:p=>p.reading.restingHrBpm,xLabel:'Urine (L/day)',yLabel:'Resting heart rate (bpm)'},
  'co2-headache':{x:p=>p.cabin.co2MmHg,y:p=>Number(p.reading.headache),xLabel:'Cabin CO₂ (mmHg)',yLabel:'Headache (0=no, 1=yes)'},
  'exercise-mass':{x:p=>p.reading.resistanceSessions7d,y:p=>p.reading.bodyMassKg,xLabel:'Exercise sessions / 7 days',yLabel:'Body mass (kg)'},
  'day-vitamin':{x:p=>p.day,y:p=>p.reading.vitaminDNgMl,xLabel:'Mission day',yLabel:'Vitamin D (ng/mL)'},
};
function scatter(series,id) {
  const pair=pairs[id]||pairs['sleep-heart'],xs=series.map(pair.x),ys=series.map(pair.y);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const x=v=>55+(v-minX)/Math.max(maxX-minX,.01)*365,y=v=>175-(v-minY)/Math.max(maxY-minY,.01)*135;
  return `<p class="backend-info">${pair.yLabel} vs ${pair.xLabel}. Each point is one mission day.</p><svg class="crew-chart" viewBox="0 0 460 220" role="img" aria-label="${pair.yLabel} versus ${pair.xLabel}"><path d="M55 25 V175 H430" fill="none" stroke="#56758a"/><text x="2" y="40">${number(maxY)}</text><text x="2" y="175">${number(minY)}</text><text x="55" y="195">${number(minX)}</text><text x="390" y="195">${number(maxX)}</text><text x="100" y="215">${pair.xLabel}</text>${series.map(p=>`<circle cx="${x(pair.x(p))}" cy="${y(pair.y(p))}" r="4" fill="${p.origin==='manual_checkin'?'#ffb842':'#24d9f6'}" opacity=".75"><title>Day ${p.day}: ${number(pair.x(p))}, ${number(pair.y(p))} · ${p.origin}</title></circle>`).join('')}</svg>`;
}

export function renderCrewData(host,data,selectedId,relationshipId='sleep-heart') {
  const selected=data.crew.find(c=>c.id===selectedId)||data.crew[0];
  if(!selected) {host.insertAdjacentHTML('beforeend','<p>No authorized crew data is available.</p>');return;}
  const series=selected.series,latest=series.at(-1);
  const relationship=selected.relationships.find(r=>r.id===relationshipId)||selected.relationships[0];
  host.insertAdjacentHTML('beforeend',`
    <div class="backend-toolbar"><label>Mission<select class="field" id="crew-mission">${[['iss','LEO / Space station'],['moon','Moon surface'],['mars','Mars transit']].map(([id,title])=>`<option value="${id}" ${data.mission===id?'selected':''}>${title}</option>`).join('')}</select></label><span class="badge cyan">${esc(data.version)} · ${series.length} days</span><button class="btn" data-backend="crew-csv">Download selected crew CSV</button></div>
    <h2>${esc(selected.name)} · ${esc(selected.profile.title)}</h2><p>${esc(selected.profile.description)}</p>
    <p class="crew-notice">Fictional NASA-inspired scenario, not NASA medical records. All coupling coefficients are demo parameters. Blue/orange indicates the base reading (synthetic/manual); saved live and chat field updates can overlay either base. Only supplied fields change. Scheduled labs/body-mass samples are held between measurement days.</p>
    <p class="crew-notice">${esc(origin(latest))} · ${series.filter(p=>p.observations?.length).length} snapshot days include saved field updates. <a href="live-monitoring.html">Open Live Monitoring</a></p>
    <div class="vitals">${['sleepHours7d','restingHrBpm','moodAvg7d','bodyMassKg','urineLitersDay','co2MmHg','hematocritPct','cumulativeDoseMSv'].map(key=>`<article class="card vital"><div class="vital-title">${label[key]}</div><strong>${number(value(latest,key))} <small>${unit[key]}</small></strong><small>Measured day ${latest.measurementDays?.[key]??latest.day} · ${esc(key==='co2MmHg'||key==='cumulativeDoseMSv'?'synthetic cabin exposure':fieldOrigin(latest,key))}</small></article>`).join('')}</div>
    <div class="section-title"><h2>Within-person time series</h2><span>Day ${data.fromDay}–${data.day}</span></div>
    <div class="subgrid crew-charts">${['sleepHours7d','restingHrBpm','moodAvg7d','bodyMassKg','urineLitersDay','co2MmHg'].map(key=>`<article class="card card-padding"><h3>${label[key]} · ${unit[key]}</h3>${chart(series,key)}</article>`).join('')}</div>
    <div class="section-title"><h2>Exploratory associations</h2></div>
    <p class="crew-notice">Pearson r describes these selected records, not a causal effect or clinical risk. Shared mission-time trends, repeated samples and programmed drivers can create correlations. N/A means fewer than eight points or no variation. Manual data change the results.</p>
    <div class="subgrid"><div class="crew-relations">${selected.relationships.map(r=>`<article class="card card-padding"><h3>${esc(r.label)}</h3><strong class="crew-r">${r.r===null?'N/A':`r = ${r.r.toFixed(3)}`}</strong><small>n = ${r.n} · manual points = ${r.manualPoints}</small><p>${esc(r.note)}</p><small>Research-theme references: ${r.sourceIds.map(esc).join(', ')}. Coefficient: synthetic/demo.</small></article>`).join('')}</div><article class="card card-padding"><label>Plot relationship<select class="field" id="crew-relationship">${selected.relationships.map(r=>`<option value="${esc(r.id)}" ${r.id===relationship.id?'selected':''}>${esc(r.label)}</option>`).join('')}</select></label>${scatter(series,relationship.id)}</article></div>
    <div class="section-title"><h2>Recent records</h2><span>Latest ${Math.min(14,series.length)} shown; CSV includes the complete selected window</span></div>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Day</th><th>Origin</th><th>Heart rate</th><th>Sleep</th><th>Mood</th><th>Urine</th><th>Mass</th><th>Headache</th></tr></thead><tbody>${series.slice(-14).reverse().map(p=>`<tr><td>${p.day}</td><td>${esc(origin(p))}</td><td>${p.reading.restingHrBpm}</td><td>${p.reading.sleepHours7d}</td><td>${p.reading.moodAvg7d}</td><td>${p.reading.urineLitersDay}</td><td>${p.reading.bodyMassKg}</td><td>${p.reading.headache?'Yes':'No'}</td></tr>`).join('')}</tbody></table></div>
    <details><summary>Research themes, source status and limitations</summary><p>${esc(data.limitations)}</p><ul>${selected.profile.sources.map(s=>`<li>${esc(s.id)} · ${esc(s.status)} · ${s.url?.startsWith('https://')?`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`:esc(s.title)}<p>${esc(s.says)}</p></li>`).join('')}</ul></details>`);
}

export function crewCsv(data,selectedId) {
  const selected=data.crew.find(c=>c.id===selectedId)||data.crew[0];
  const keys=['restingHrBpm','spo2Pct','sleepHours7d','moodAvg7d','urineLitersDay','bodyMassKg','vitaminDNgMl','headache','hematocritPct','onsdMm','visionChange','ijvFlow','ijvClotSeen','resistanceSessions7d','bodyTempC','systolicBp','diastolicBp','glucoseMgDl','wbcK','lymphK','co2MmHg','cumulativeDoseMSv'];
  const dates=['hematocritPct','onsdMm','wbcK','vitaminDNgMl','bodyMassKg'];
  return ['crewId,mission,day,origin,'+keys.join(',')+','+dates.map(k=>`${k}MeasuredDay`).join(',')+',savedFieldUpdates,latestUpdateSource,latestUpdateMeasuredAt',...selected.series.map(p=>[selected.id,data.mission,p.day,p.origin,...keys.map(key=>value(p,key)),...dates.map(key=>p.measurementDays?.[key]??p.day),p.observations?.length??0,p.observations?.at(-1)?.source??'',p.observations?.at(-1)?.measuredAt??''].join(','))].join('\n');
}
