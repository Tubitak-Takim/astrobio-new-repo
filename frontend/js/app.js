/* ASTROBIO presentation layer. Synthetic design examples are not clinical scores. */
(() => {
  'use strict';
  const D = window.ASTROBIO_DATA;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', {minimumFractionDigits:d, maximumFractionDigits:d});
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const ico = name => `<iconify-icon icon="${name}" aria-hidden="true"></iconify-icon>`;
  const tag = (text, color = 'cyan') => `<span class="badge ${color}">${esc(text)}</span>`;
  const label = (title, sub = 'ASTROBIO · MISSION CONTROL', badge = '') => `<div class="section-top"><div><div class="eyebrow">${esc(sub)}</div><h1>${esc(title)}</h1></div>${badge}</div>`;
  const footer = () => `<footer class="footer"><span>ASTROBIO · NASA Space Apps Challenge · Simulation prototype. Not a medical device.</span><span><a href="https://github.com/MervinR07/open-anatomy-3d" target="_blank" rel="noopener">3D model attribution</a> · <a href="data/ASTROBIO_Project_Overview.html" target="_blank" rel="noopener">Project overview</a></span></footer>`;
  const quality = value => ({'İyi':'Good','Zayıf sinyal':'Weak signal','Sensör donması':'Sensor freeze'}[value] || value || 'Good');
  const dayLabel = value => String(value).replace(/^Gün /, 'Day ');
  const normalize = rows => rows.map(r => ({...r, day:dayLabel(r.day), quality:quality(r.quality)}));
  const S = {mode:localStorage.getItem('astrobio-mode') || 'mars', scenario:'review', route:'overview', region:'head', records:normalize(D.demo), imported:false, selectedDate:new Date(), calendarMonth:new Date(), insightPeriod:'7', loadIndex:null};
  try {
    const rows = JSON.parse(localStorage.getItem('astrobio-import-v1'));
    if (Array.isArray(rows) && rows.length >= 2 && rows.length <= 365 && rows.every(r => r && ['heart','spo2','temperature','sleep','bis','co2','radiation'].every(k => Number.isFinite(Number(r[k]))))) {
      S.records = normalize(rows); S.imported = true;
    }
  } catch { /* Keep the supplied demo if saved imports cannot be read. */ }
  const latest = () => S.records[S.records.length - 1];
  const field = (key, fallback = 0) => Number(latest()?.[key] ?? fallback);
  const mode = () => D.missionModes[S.mode] || D.missionModes.mars;
  const demoPill = () => `<span class="source-pill">${ico('mdi:flask-outline')} Synthetic data · Demo</span>`;
  const missionSwitcher = () => `<div class="delay-options" role="group" aria-label="Select LEO, Moon or Mars mission">${Object.entries(D.missionModes).map(([key,m]) => `<button class="delay-option ${key===S.mode?'active':''}" data-mode="${key}" aria-pressed="${key===S.mode}">${esc(m.name)}</button>`).join('')}</div>`;
  function toast(text) {
    const el = $('#toast'); el.textContent = text; el.classList.add('visible');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('visible'), 3200);
  }
  function updateSidebar() {
    $('#planet-title').textContent = mode().planet; $('#planet-sub').textContent = mode().report;
    $('#planet-fallback').className = `planet-fallback ${S.mode}`;
    const img = $('#planet-img'); img.onerror = () => img.classList.add('is-missing'); img.onload = () => img.classList.remove('is-missing'); img.src = mode().asset;
  }
  function vitals() {
    return `<div class="vitals">${[
      ['Heart rate',`${fmt(field('heart'))} bpm`,'Latest synthetic reading','mdi:heart-pulse','#ff795c'],
      ['SpO₂',`${fmt(field('spo2'))}%`,'Blood oxygen saturation','mdi:lungs','#18ddff'],
      ['Temperature',`${fmt(field('temperature'),1)} °C`,'Synthetic body temperature','mdi:thermometer','#18ddff'],
      ['Sleep',`${fmt(field('sleep'),1)} hours`,'Last 24 hours','mdi:weather-night','#b69aff'],
      ['Radiation',`${fmt(field('radiation'),1)} mSv`,'Example cumulative dose','mdi:radioactive','#ffb842'],
      ['Cabin CO₂',`${fmt(field('co2'))} ppm`,'Synthetic environment reading','mdi:cloud-outline','#24d5bf'],
    ].map(([title,value,sub,icon,color]) => `<div class="card vital" style="--accent:${color}"><div class="vital-title">${ico(icon)}<span>${title}</span></div><strong>${value}</strong><small>${sub}</small></div>`).join('')}</div>`;
  }
  function demoScores(offset = 0) {
    const r = S.records[clamp(S.records.length - 1 + offset, 0, S.records.length - 1)];
    return {sleep:clamp(Math.round(Number(r.sleep)/8.2*100),5,100), recovery:clamp(Math.round(80-(Number(r.heart)-80)*1.05+(Number(r.sleep)-7.2)*5),10,95), load:Number(clamp(5+(Number(r.heart)-68)*.33,0,21).toFixed(1)), quality:clamp(Math.round(100-S.records.filter(r=>quality(r.quality)!=='Good').length/S.records.length*28),45,100)};
  }
  function scoreRing(value, {color='#8cc8ff',label='',unit='%',caption='',size='large',max=100} = {}) {
    const pct = Math.round(clamp(Number(value)/max,0,1)*100);
    return `<div class="score-ring ${size==='small'?'ring-small':''}" role="img" aria-label="${esc(label)}: ${esc(value)}${esc(unit)}; demo visual indicator" style="--score:${pct}%;--ring-color:${color}"><div class="score-ring-core"><span class="ring-label">${esc(label)}</span><strong>${esc(value)}<small>${esc(unit)}</small></strong><span class="ring-caption">${esc(caption)}</span></div></div>`;
  }
  function progressLine(icon, title, value, {color='#79c6f5',sub='',text=''} = {}) {
    return `<div class="progress-row"><div class="progress-meta"><span class="progress-name">${ico(icon)} ${esc(title)}</span><strong>${esc(text || `${value}%`)}</strong></div><div class="progress-track"><span style="width:${clamp(value,0,100)}%;--bar-color:${color}"></span></div>${sub?`<small>${esc(sub)}</small>`:''}</div>`;
  }
  function scoreTile(title,value,color,href,icon,unit='%',subtitle='',max=100) {
    return `<a class="score-tile" href="${href}" aria-label="${title} details"><div class="score-tile-heading">${ico(icon)}<span>${title}</span>${ico('mdi:arrow-top-right')}</div>${scoreRing(value,{color,label:'ASTROBIO',unit,caption:'DEMO SCORE',size:'small',max})}<div class="score-tile-foot"><span>${subtitle}</span>${ico('mdi:chevron-right')}</div></a>`;
  }
  function scoreOverview() {
    const s = demoScores();
    return `<section class="wellness-overview" aria-label="Daily rhythm and example indicators"><div class="wellness-header"><div><div class="eyebrow">DAILY MISSION RHYTHM</div><h2>Trends at a glance, beyond the measurements</h2><p>Visual scores derived from example data · Not medical decision support</p></div><a class="text-link" href="gunluk-etkiler.html">Explore daily insights ${ico('mdi:arrow-right')}</a></div><div class="score-tiles">${scoreTile('Sleep',s.sleep,'#8bc9f2','uyku.html','mdi:weather-night','%','Last 24 hours')}${scoreTile('Recovery',s.recovery,'#48e6a0','toparlanma.html','mdi:heart-pulse','%','Visual demo index')}${scoreTile('Daily load',s.load,'#29bdff','gunluk-yuk.html','mdi:lightning-bolt-outline','/21','Activity load',21)}${scoreTile('Data quality',s.quality,'#8bdfc9','gorev-sagligi.html','mdi:shield-check-outline','%','Sensor records')}</div></section>`;
  }
  function chartSVG(rows, series, {min,max,unit='',ticks=5,labels=true} = {}) {
    if (!rows.length) return '<div class="data-source">No chart data.</div>';
    const W=640,H=286,L=47,R=14,T=13,B=43,w=W-L-R,h=H-T-B;
    const values=rows.map(r=>Number(r[series] || 0)), lo=min ?? Math.min(...values), hi=max ?? Math.max(...values);
    const x=i=>L+i*w/Math.max(rows.length-1,1), y=v=>T+h-(v-lo)/Math.max(hi-lo,1)*h;
    const grid=Array.from({length:ticks+1},(_,i)=>{const v=lo+(hi-lo)*i/ticks;return `<line x1="${L}" y1="${y(v)}" x2="${W-R}" y2="${y(v)}" stroke="#31516a"/><text x="${L-8}" y="${y(v)+3}" fill="#8dadc3" font-size="10" text-anchor="end">${fmt(v,hi-lo<20?1:0)}</text>`;}).join('');
    const baseline=S.records.slice(0,Math.min(5,S.records.length)).map(r=>Number(r.bis)).sort((a,b)=>a-b);
    const ref=baseline[Math.floor(baseline.length/2)] || 548;
    return `<svg class="plot" role="img" aria-label="${esc(series)} time series (${esc(unit)})" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${grid}${series==='bis'?`<line x1="${L}" y1="${y(ref)}" x2="${W-R}" y2="${y(ref)}" stroke="#b5c8d6" stroke-dasharray="7,5"/>`:''}<polyline fill="none" points="${values.map((v,i)=>`${x(i)},${y(v)}`).join(' ')}" stroke="#15d7f5" stroke-width="3"/>${rows.map((r,i)=>`<circle cx="${x(i)}" cy="${y(values[i])}" r="3.5" fill="#12d8f9"><title>${esc(r.day)}: ${fmt(values[i],1)} ${esc(unit)}</title></circle>${labels?`<text x="${x(i)}" y="${H-16}" text-anchor="middle" fill="#9fb7ca" font-size="10">${esc(r.day.replace('Day ','D'))}</text>`:''}`).join('')}</svg>`;
  }
  function sleepChart() {
    const rows=S.records.slice(-7), W=580,H=286,L=39,R=43,T=14,B=40,w=W-L-R,h=H-T-B;
    const x=i=>L+(i+.5)*w/rows.length, ys=v=>T+h-v/10*h, yh=v=>T+h-(v-60)/50*h;
    return `<svg class="plot" role="img" aria-label="Sleep bars and heart rate line" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${Array.from({length:6},(_,i)=>`<line x1="${L}" y1="${T+h-i*h/5}" x2="${W-R}" y2="${T+h-i*h/5}" stroke="#294e6b"/><text x="${L-7}" y="${T+h-i*h/5+4}" fill="#bdabec" font-size="10" text-anchor="end">${i*2}</text><text x="${W-R+8}" y="${T+h-i*h/5+4}" fill="#ff937e" font-size="10">${60+i*10}</text>`).join('')}${rows.map((r,i)=>`<rect x="${x(i)-w/rows.length*.29}" y="${ys(r.sleep)}" width="${w/rows.length*.58}" height="${Math.max(0,T+h-ys(r.sleep))}" rx="3" fill="#9577d2"><title>${esc(r.day)}: ${fmt(r.sleep,1)} hours</title></rect><text x="${x(i)}" y="${H-16}" fill="#9bb1c3" text-anchor="middle" font-size="10">${esc(r.day.replace('Day ','D'))}</text>`).join('')}<polyline fill="none" stroke="#ff856e" stroke-width="3" points="${rows.map((r,i)=>`${x(i)},${yh(r.heart)}`).join(' ')}"/></svg>`;
  }
  const bisCard = () => `<article class="card chart-card"><div class="card-head"><h3>BIS impedance (R₀) and personal baseline</h3><small>Simulation data</small></div>${chartSVG(S.records,'bis',{min:480,max:580,unit:'Ω'})}<div class="chart-legend"><span><i class="legend-line"></i>R₀ (Ω)</span><span><i class="legend-line dash"></i>Early-day baseline (Ω)</span></div></article>`;
  const sleepCard = () => `<article class="card chart-card"><div class="card-head"><h3>Sleep and heart rate trends</h3><small>Last 7 days</small></div>${sleepChart()}<div class="chart-legend"><span><i class="legend-line purple"></i>Sleep (hours, left)</span><span><i class="legend-line red"></i>Heart rate (bpm, right)</span></div></article>`;
  const scenarios = {
    normal:{title:'Normal',desc:'Indicators are close to the example personal reference range.',points:['No persistent deviation shown','Monitoring continues']},
    watch:{title:'Monitor',desc:'An example BIS impedance trend has changed.',points:['R₀ decreases over multiple measurements','Other indicators should be reviewed together']},
    review:{title:'Review',desc:'Impedance is below the example baseline, heart rate is rising and sleep duration is falling.',points:['BIS: a sustained decrease over several readings','Heart rate: gradual increase','Sleep: gradual decrease']},
    freeze:{title:'Data quality',desc:'An example sensor freeze is flagged. These readings are not interpreted as a health change.',points:['Repeated unchanged readings','Sensor verification needed']},
    urgent:{title:'Urgent · Demo',desc:'This is a visual design scenario, not a clinical emergency determination.',points:['Simulated multiple alerts','Review according to mission protocols']},
  };
  function alertCard() {
    const a=scenarios[S.scenario];
    return `<aside class="card alert-card"><div class="alert-head">${ico('mdi:alert-outline')}<span>${a.title}</span></div><div class="alert-inner"><div class="eyebrow orange">DEMO SCENARIO</div><h3>Why this alert?</h3><p>${a.desc}</p><ul class="alert-points">${a.points.map(t=>`<li>${t}</li>`).join('')}</ul><details><summary>View details</summary><p>These messages use synthetic data. They are not medical assessments; the system has not been clinically validated.</p></details></div></aside>`;
  }
  function ridgeCards() {
    return `<div class="ridge-grid">${D.categories.map(item=>{
      const value=item.key==='D'?mode().delay:item.key==='R'?`${fmt(field('radiation'),1)} mSv`:item.key==='I'?`${fmt(field('sleep'),1)} hours`:item.key==='E'?`${fmt(field('co2'))} ppm`:scenarios[S.scenario].title;
      return `<article class="card ridge-card" style="--accent:${item.color}"><div class="ridge-title">${ico(item.icon)}<b>${item.key} – ${esc(item.en)}</b></div><div class="ridge-tr">${esc(item.desc)}</div><div class="ridge-value">${esc(value)}</div><div class="ridge-sub">${esc(item.key==='D'?mode().report:item.text)}</div><div class="ridge-bottom"><div class="ridge-slim"><span style="width:${{R:48,I:63,D:100,G:76,E:54}[item.key]}%"></span></div><div class="mini muted">${esc(item.tr)} · Demo indicator</div></div></article>`;
    }).join('')}</div>`;
  }
  function reportInner() {
    return `<div class="report-entry warn">${ico('mdi:alert-circle-outline')}<div>Example alert: <strong>${esc(scenarios[S.scenario].title)}</strong></div></div><div class="report-entry">${ico('mdi:chart-line')}<div>R₀: ${fmt(field('bis'))} Ω · Example baseline: 548 Ω</div></div><div class="report-entry">${ico('mdi:heart-pulse')}<div>Heart rate: ${fmt(field('heart'))} bpm · Sleep: ${fmt(field('sleep'),1)} hours</div></div><div class="report-entry">${ico('mdi:satellite-uplink')}<div>Mission: ${esc(mode().name)} · Delay: ${esc(mode().delay)}</div></div><div class="report-entry">${ico('mdi:database-check-outline')}<div>${S.imported?'Locally imported example data':'Local simulation dataset'} · ${S.records.length} records</div></div>`;
  }
  function overview() {
    return `${label('Mission Control Center','OVERVIEW',tag('● Simulation active','green'))}<div class="scenario-strip"><span class="mini muted">DEMO SCENARIO</span><div class="scenario-buttons">${Object.entries(scenarios).map(([key,a])=>`<button class="btn small ${S.scenario===key?'selected':''}" data-scenario="${key}">${a.title}</button>`).join('')}</div></div><div class="summary-grid"><article class="card summary-card astronaut"><div class="astronaut-icon">${ico('game-icons:astronaut-helmet')}</div><div><div class="label">ASTRONAUT INFORMATION</div><h2>A-01</h2><p>Mission: ${esc(mode().name)} simulation</p><p>Mission day: 12</p></div></article><article class="card summary-card mode"><div class="label">OPERATING MODE</div><h2>${esc(mode().work)}</h2><p>${esc(mode().report)}</p><div class="small-green">● Active · Simulation</div></article><article class="card summary-card delay"><div class="label">COMMUNICATION DELAY</div><h2>${esc(mode().delay)}</h2><p>One-way delay (simulation)</p>${missionSwitcher()}</article></div><div class="section-title"><h2>Astronaut health overview</h2><span class="mini muted">A-01 · Mission day 12 · Synthetic design demo</span></div>${scoreOverview()}${vitals()}<div class="monitor-grid">${bisCard()}${sleepCard()}${alertCard()}</div><div class="section-title"><h2>${ico('mdi:shield-outline')} RIDGE – Spaceflight risks</h2><a href="ridge.html">Full RIDGE analysis</a></div>${ridgeCards()}<div class="lower-grid"><article class="card card-padding"><div class="card-head"><h3>Sensor and data quality</h3>${tag('Demo')}</div><div class="status-row"><span>Vital sensors</span><span class="green">● Simulation active</span></div><div class="status-row"><span>BIS measurements</span><span class="green">● Example data available</span></div><div class="status-row"><span>Data quality</span><span class="orange">${S.scenario==='freeze'?'● Sensor freeze (demo)':'● Monitoring'}</span></div><div class="panel-foot">Design indicators are separate from authenticated server findings in Interactive Health Check.</div></article><article class="card report-card"><div class="card-head"><h3>Ground team report preview</h3>${tag('Synthetic preview')}</div>${reportInner()}<div class="actions"><button class="btn primary" data-action="report-json">Download demo JSON</button><a href="raporlar.html" class="btn ghost">Open reports</a></div><div class="panel-foot">This preview is not sent automatically. Use Reports for authenticated server reports and messages.</div></article></div>${footer()}`;
  }
  function sleepPage() {
    const s=demoScores();
    return `${label('Sleep Analysis','DAILY RHYTHM',demoPill())}<div class="feature-intro"><div><div class="eyebrow">SLEEP · MISSION DAY 12</div><h2>Explore your sleep pattern</h2><p>A visual summary of example sleep records, not a clinical sleep assessment.</p></div>${ico('mdi:weather-night')}</div><div class="focus-grid"><article class="focus-card">${scoreRing(s.sleep,{label:'SLEEP INDICATOR',caption:'DEMO · NOT CLINICAL'})}<div class="focus-foot"><span>Latest record: <strong>${fmt(field('sleep'),1)} hours</strong></span><a class="btn ghost" href="olcumler.html">View raw measurements</a></div></article><article class="card detail-card"><div class="card-head"><h3>Sleep components</h3>${tag('Record summary')}</div>${progressLine('mdi:clock-time-four-outline','Duration / example reference',s.sleep,{sub:'8.2 hours is used only for this demo indicator'})}${progressLine('mdi:calendar-clock','Recording consistency',63,{color:'#f5b44d',sub:'Example scenario'})}${progressLine('mdi:check-circle-outline','Data completeness',s.quality,{color:'#4ee5b5',sub:'Technical quality of recorded measurements'})}<div class="advisory"><strong>What does this indicator mean?</strong><p>It summarizes sleep duration visually. It does not assess individual health, sleep needs or performance.</p></div></article></div><div class="analysis-grid"><article class="card chart-card"><div class="card-head"><h3>Last 7 days · Sleep trend</h3><small>Synthetic records</small></div>${chartSVG(S.records.slice(-7),'sleep',{min:0,max:10,unit:'hours'})}</article><article class="card card-padding"><h3>Mission note</h3><p class="muted">Sleep duration should be reviewed alongside other indicators and data quality, not used alone to determine an alert.</p><a class="btn primary" href="toparlanma.html">Explore recovery</a></article></div>${footer()}`;
  }
  function recoveryPage() {
    const s=demoScores();
    return `${label('Recovery Overview','DAILY RHYTHM',demoPill())}<div class="feature-intro"><div><div class="eyebrow">RECOVERY · EXAMPLE INDICATOR</div><h2>See daily changes in one place</h2><p>A visual demo index based on heart rate, sleep and sensor quality.</p></div>${ico('mdi:heart-pulse')}</div><div class="focus-grid"><article class="focus-card">${scoreRing(s.recovery,{color:'#4ce5a2',label:'RECOVERY',caption:'EXAMPLE INDEX'})}<div class="focus-foot"><span>Not a diagnostic measurement</span><a class="btn ghost" href="bis-analizi.html">Open BIS analysis</a></div></article><article class="card detail-card"><div class="card-head"><h3>Indicator contributions</h3>${tag('Visual summary','green')}</div>${progressLine('mdi:heart-pulse','Heart rate trend',clamp(100-Math.round((field('heart')-65)*1.2),0,100),{color:'#5fe4ae',sub:`Latest synthetic heart rate: ${fmt(field('heart'))} bpm`})}${progressLine('mdi:weather-night','Sleep record',s.sleep,{sub:'Last 24 hours'})}${progressLine('mdi:signal','Sensor reliability',s.quality,{color:'#48d6c8',sub:'Technical recording status only'})}<div class="advisory"><strong>Interpretation limits</strong><p>Real recovery analysis requires individual baselines, reliable sensors and validated algorithms. This percentage is an example.</p></div></article></div><div class="analysis-grid"><article class="card chart-card"><div class="card-head"><h3>Heart rate trend</h3><small>12-day demo</small></div>${chartSVG(S.records,'heart',{min:60,max:110,unit:'bpm'})}</article><article class="card card-padding"><h3>Explanation</h3><p class="muted">This presentation combines changing indicators. It does not automatically make emergency, clinical or performance decisions.</p><a href="gunluk-etkiler.html" class="btn primary">Explore daily insights</a></article></div>${footer()}`;
  }
  function loadPage() {
    const index=clamp(S.loadIndex ?? S.records.length-1,0,S.records.length-1), r=S.records[index], s=demoScores(index-S.records.length+1);
    return `${label('Daily Load','MISSION ACTIVITY',demoPill())}<div class="feature-intro"><div><div class="eyebrow">MISSION WORKLOAD</div><h2>Daily activity overview</h2><p>Select a mission day to explore an example load index. This is not an exercise target or medical interpretation.</p></div>${ico('mdi:lightning-bolt-outline')}</div><div class="focus-grid"><article class="focus-card">${scoreRing(s.load,{color:'#28baf6',label:'DAILY LOAD',unit:'/21',caption:r.day.toUpperCase(),max:21})}<div class="focus-foot"><span>${esc(r.day)} · Example workload</span>${tag('Educational simulation')}</div></article><article class="card detail-card"><div class="card-head"><h3>Change day</h3><small>${esc(r.day)}</small></div><div class="day-pills" role="group" aria-label="Select mission day">${S.records.slice(-7).map((r,i)=>{const n=Math.max(0,S.records.length-7)+i;return `<button class="day-pill ${index===n?'active':''}" data-load-index="${n}">${esc(r.day.replace('Day ','D'))}</button>`;}).join('')}</div>${progressLine('mdi:heart-pulse','Heart rate record',clamp(Math.round((r.heart-55)/70*100),0,100),{text:`${fmt(r.heart)} bpm`})}${progressLine('mdi:weather-night','Sleep record',clamp(Math.round(r.sleep/10*100),0,100),{color:'#9877e4',text:`${fmt(r.sleep,1)} hours`})}${progressLine('mdi:clipboard-check','Recording completeness',r.quality==='Good'?92:52,{color:'#49e5b0',text:r.quality})}<div class="advisory"><strong>What is daily load?</strong><p>A sample 0–21 scale for visualization in this prototype, not a validated physiological measurement.</p></div></article></div><div class="analysis-grid"><article class="card chart-card"><h3>Heart rate · Mission days</h3>${chartSVG(S.records,'heart',{min:60,max:110,unit:'bpm'})}</article>${sleepCard()}</div>${footer()}`;
  }
  function missionHealthPage() {
    const s=demoScores();
    return `${label('Mission Health Summary','LONG-TERM OVERVIEW',demoPill())}<div class="healthspan-grid"><article class="card healthspan-hero"><div class="eyebrow">ASTROBIO · MISSION CONTINUITY</div><h2>Mission health horizon</h2><p>A visual overview of example recording completeness and monitoring continuity.</p><div class="cosmos-wrap"><div class="cosmos-particles" aria-hidden="true"></div>${scoreRing(s.quality,{color:'#40deb4',label:'DATA COMPLETENESS',caption:'VISUAL DEMO'})}</div>${tag(`${S.records.length} mission days recorded`,'green')}</article><article class="card detail-card"><div class="card-head"><h3>System and monitoring indicators</h3>${tag('Demo','green')}</div>${progressLine('mdi:check-decagram-outline','Recording completeness',s.quality,{color:'#45e5b8'})}${progressLine('mdi:calendar-check','Mission observation period',clamp(S.records.length/14*100,0,100),{text:`${S.records.length} days`})}${progressLine('mdi:shield-check-outline','Example data quality',s.quality,{color:'#54e0ab'})}<div class="advisory"><strong>Important clarification</strong><p>This page does not estimate biological age, life expectancy or health risk. It illustrates monitoring continuity.</p></div><a href="gunluk-etkiler.html" class="btn primary">Explore daily insights</a></article></div><div class="card card-padding" style="margin-top:17px"><div class="card-head"><h3>Technical status of recent records</h3><small>Synthetic measurements</small></div><div class="quality-timeline">${S.records.slice(-12).map(r=>`<div class="quality-day"><span style="height:${r.quality==='Good'?'90':'52'}%;background:${r.quality==='Good'?'#48dcb4':'#ffb45b'}"></span><small>${esc(r.day.replace('Day ','D'))}</small></div>`).join('')}</div></div>${footer()}`;
  }
  function insightsPage() {
    const recent=S.insightPeriod==='7';
    const impacts=[['Routine check-ins',recent?72:84,'#5ee9ad','Example association with timely records'],['Sleep timing',recent?59:67,'#89c9f2','Synthetic sleep consistency observation'],['Sensor checks',recent?87:77,'#40cfbd','Recording quality and check frequency'],['Mission workload',recent?43:38,'#f4ad61','Example association with task load'],['Rest breaks',recent?65:70,'#b69aff','Scheduled rest-break records']];
    return `${label('Daily Insights','MISSION INSIGHTS',demoPill())}<div class="feature-intro"><div><div class="eyebrow">MONITORING HABITS</div><h2>Explore how records change together</h2><p>These percentages are hypothetical design examples, not measured personal effects or evidence of causation.</p></div>${ico('mdi:chart-box-outline')}</div><div class="insights-grid"><article class="card card-padding"><div class="card-head"><h3>Example comparisons</h3><small>Mission demo chart</small></div><div class="period-buttons" role="group" aria-label="Select example period"><button data-insight-days="7" class="period-btn ${recent?'active':''}">Last 7 days</button><button data-insight-days="30" class="period-btn ${recent?'':'active'}">Last 30 days (demo)</button></div><div class="impact-list">${impacts.map(([name,value,color,about])=>`<div class="impact-row"><div class="impact-top"><span>${name}</span><strong>${value}%</strong></div><div class="impact-line"><span style="width:${value}%;--impact-color:${color}"></span></div><small>${about}</small></div>`).join('')}</div><div class="advisory"><strong>Statistical limitation</strong><p>These illustrative values do not measure individual health or the effects of habits.</p></div></article><article class="card card-padding"><div class="card-head"><h3>Daily recording approach</h3>${tag('Monitoring guide')}</div><div class="insight-explainer">${[['Record the measurement','Keep its timestamp, sensor source and quality flag together.'],['Review the personal baseline','Compare with earlier records rather than relying on a single reading.'],['Show the reasoning','Explain which indicators changed together when an example alert appears.']].map(([title,text],i)=>`<div><span class="num-tag">0${i+1}</span><h4>${title}</h4><p>${text}</p></div>`).join('')}</div><a href="takvim.html" class="btn primary">Open mission calendar</a></article></div>${footer()}`;
  }
  function measurements() {
    return `${label('Health Measurements','PAST AND CURRENT DATA',tag(S.imported?'Loaded from file':'Synthetic demo'))}${vitals()}<div class="section-title"><h2>Time series</h2><span class="mini muted">${S.records.length} daily records</span></div><div class="subgrid">${bisCard()}${sleepCard()}</div><div class="section-title"><h2>Measurement records</h2></div><div class="toolbar"><button class="btn" data-action="csv">Export CSV</button><label class="btn" for="import-data">Import JSON</label><input type="file" id="import-data" accept="application/json,.json" hidden><button class="btn ghost" data-action="reset-data">Restore demo data</button><a class="btn primary" href="health-check.html">Open authenticated health check</a></div><div class="card card-padding"><div class="table-wrap"><table class="data-table"><thead><tr>${['Day','BIS R₀ (Ω)','Heart rate (bpm)','SpO₂ (%)','Sleep (hours)','Temperature (°C)','CO₂ (ppm)','Quality'].map(t=>`<th>${t}</th>`).join('')}</tr></thead><tbody>${S.records.slice().reverse().map(r=>`<tr><td>${esc(r.day)}</td><td>${fmt(r.bis)}</td><td>${fmt(r.heart)}</td><td>${fmt(r.spo2)}</td><td>${fmt(r.sleep,1)}</td><td>${fmt(r.temperature,1)}</td><td>${fmt(r.co2)}</td><td><span class="dot ${r.quality==='Good'?'':'warning'}"></span>${esc(r.quality)}</td></tr>`).join('')}</tbody></table></div><div class="panel-foot">Imported example JSON stays in this browser and is not a server check-in. Do not import sensitive records.</div></div>${footer()}`;
  }
  function calcCole(fHz,R0=548,Rinf=320,tau=.00005,alpha=.75) {
    const t=Math.pow(2*Math.PI*fHz*tau,alpha), angle=alpha*Math.PI/2,a=1+t*Math.cos(angle),b=t*Math.sin(angle),den=a*a+b*b;
    return Math.hypot(Rinf+(R0-Rinf)*a/den,-(R0-Rinf)*b/den);
  }
  function colePlot(R0=548,alpha=.75) {
    return chartSVG([1e3,2e3,3e3,5e3,8e3,12e3,20e3,35e3,50e3,75e3,1e5,2e5,3e5,5e5].map(f=>({day:`${fmt(f/1000)}k`,imp:calcCole(f,R0,320,.00005,alpha)})),'imp',{min:320,max:575,ticks:5,unit:'Ω'});
  }
  function bisPage() {
    const early=S.records.slice(0,5).map(r=>r.bis).sort((a,b)=>a-b), ref=early[Math.floor(early.length/2)], cur=field('bis'), change=(cur-ref)/ref*100;
    return `${label('BIS Analysis','COLE MODEL · FLUID SHIFT',tag('Scientific validation required','orange'))}<div class="metric-stack">${[['Example baseline (R₀)',`${fmt(ref)} Ω`,'Median of the early records'],['Latest BIS reading',`${fmt(cur)} Ω`,'Simulation data'],['Relative change',`${fmt(change,1)}%`,'No medical conclusion can be drawn']].map(([title,value,sub])=>`<div class="card metric-tile"><small>${title}</small><b>${value}</b><span class="mini muted">${sub}</span></div>`).join('')}</div><div class="subgrid" style="margin-top:16px">${bisCard()}<article class="card card-padding"><div class="card-head"><h3>Cole model · Frequency curve</h3>${tag('Model simulation')}</div><div class="input-group"><label class="form-label" for="cole-r0">R₀ = <strong id="cole-r0-val">548</strong> Ω</label><input id="cole-r0" type="range" min="430" max="590" step="2" value="548"></div><div class="input-group"><label class="form-label" for="cole-alpha">α = <strong id="cole-alpha-val">0.75</strong></label><input id="cole-alpha" type="range" min="0.50" max="0.95" step="0.05" value="0.75"></div><div id="cole-plot">${colePlot()}</div><div class="panel-foot">Z(ω)=R∞+(R₀−R∞)/(1+(jωτ)^α) · R∞=320 Ω, τ=50 µs. Example parameters, not clinical data.</div></article></div><article class="card card-padding" style="margin-top:16px"><h3>Personal baseline and analysis notes</h3><p class="muted">Personal early measurements can provide context for later changes. This page displays example model parameters and charts only; it does not infer a fluid balance diagnosis.</p></article>${footer()}`;
  }
  function ridgePage() {
    return `${label('RIDGE – Spaceflight Risks','NASA RISK CATEGORIES',tag('Five risk categories'))}<div class="card card-padding" style="margin-bottom:16px"><p class="muted">Radiation, Isolation and Confinement, Distance from Earth, Gravity Fields, and Extreme / Hostile Closed Environments. The displayed levels are synthetic examples.</p></div>${ridgeCards()}<div class="subgrid" style="margin-top:16px"><article class="card card-padding"><h3>D – Mission communication delay</h3><div class="stat-big orange">${esc(mode().delay)}</div><div class="muted mini">One-way communication · ${esc(mode().work)}</div>${missionSwitcher()}<p class="inline-note">A local design demo, not a connection to a real ground station.</p></article><article class="card chart-card"><div class="card-head"><h3>G – BIS trend</h3>${tag('Review','orange')}</div>${chartSVG(S.records,'bis',{min:480,max:580,unit:'Ω'})}<p class="inline-note">Not intended to diagnose fluid distribution changes.</p></article></div>${footer()}`;
  }
  function missionCycleStrip() {
    const colors=['#75b8ec','#65dac0','#c393e0','#f5aa66'];
    return `<section class="cycle-panel" aria-label="Mission timeline"><div class="cycle-head"><div><div class="eyebrow">MISSION TIMELINE</div><h3>14-day monitoring plan</h3></div>${tag('Example mission periods')}</div><div class="cycle-track">${Array.from({length:14},(_,i)=>`<div class="cycle-cell ${i===11?'today':''}" style="--cycle-color:${colors[Math.floor(i/4)%4]}"><span>D${i+1}</span><i></i></div>`).join('')}</div><div class="cycle-legend">${['Preparation','Monitoring','Analysis','Reporting'].map((t,i)=>`<span><i style="background:${colors[i]}"></i> ${t}</span>`).join('')}</div><p class="mini muted">A mission planning illustration, not biological cycle tracking or a personal medical record.</p></section>`;
  }
  const toDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  function readNotes() { try { return JSON.parse(localStorage.getItem('astrobio-notes-v1')) || {}; } catch { return {}; } }
  const setNotes = obj => localStorage.setItem('astrobio-notes-v1',JSON.stringify(obj));
  function calendar() {
    const m=S.calendarMonth,year=m.getFullYear(),month=m.getMonth(),first=(new Date(year,month,1).getDay()+6)%7,count=new Date(year,month+1,0).getDate(),notes=readNotes(),selected=toDate(S.selectedDate);
    const cells=Array.from({length:Math.ceil((first+count)/7)*7},(_,i)=>{const day=i-first+1,date=new Date(year,month,day),iso=toDate(date);return `<button type="button" class="calendar-cell ${day>=1&&day<=count?'':'muted'} ${iso===toDate(new Date())?'today':''} ${notes[iso]?'has-note':''} ${iso===selected?'selected':''}" data-date="${iso}"><span class="date-label">${date.getDate()}</span>${notes[iso]?`<small>${esc(notes[iso].slice(0,12))}</small>`:''}</button>`;}).join('');
    return `${label('Health Calendar','DAILY CHECK-IN',tag('Local design calendar'))}${missionCycleStrip()}<div class="subgrid"><article class="card card-padding"><div class="calendar-head"><div><h2>${new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric'}).format(m)}</h2><span class="muted mini">Select a day to add a local example note</span></div><div class="actions"><button class="btn small" data-action="month-prev" aria-label="Previous month">${ico('mdi:chevron-left')}</button><button class="btn small" data-action="month-next" aria-label="Next month">${ico('mdi:chevron-right')}</button></div></div><div class="calendar-grid">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(t=>`<div class="calendar-day-label">${t}</div>`).join('')}${cells}</div></article><article class="card card-padding"><div class="card-head"><h3>Local daily note</h3>${tag('Stored in this browser')}</div><div class="label">${selected}</div><form id="calendar-form"><div class="input-group"><label class="form-label" for="calendar-note">Example check-in / mission note</label><textarea class="field" id="calendar-note" rows="7" style="width:100%" placeholder="Example: sensor check or sleep log" maxlength="500"></textarea></div><button class="btn primary">Save local note</button><button class="btn ghost" data-action="calendar-clear" type="button">Delete local note</button></form><div class="panel-foot">These localStorage notes are separate from server mission-day notes. Do not enter sensitive data.</div></article></div>${footer()}`;
  }
  function health() {
    const r=D.anatomyRegions[S.region];
    return `${label('Astronaut Body Map','INTERACTIVE HEALTH CHECK',tag('3D anatomy prototype'))}<div class="anatomy-grid"><article class="card card-padding"><div class="card-head"><h3>3D anatomical model</h3><small>ASTRONAUT A-01 · DESIGN DEMO</small></div><div class="anatomy-layer-controls" id="layer-controls">${[['skin','Skin','#8cc6d9'],['skeleton','Skeleton','#f0e8dc'],['muscles','Muscles','#db777a'],['organs','Organs','#ea967b'],['vessels','Blood vessels','#ff646b'],['nerves','Nerves','#f6c364']].map(([key,text,color])=>`<button class="layer-btn active" data-layer="${key}" aria-pressed="true" style="--layer:${color}"><span class="layer-dot"></span>${text}</button>`).join('')}</div><div class="anatomy-stage" id="three-container"><div class="anatomy-loader" id="anatomy-loader">${ico('mdi:cube-outline')}<strong>Loading 3D human model…</strong><span>An internet connection or local model file is required</span></div></div><div class="anatomy-controls"><button class="btn small" data-action="zoom-in">Zoom in</button><button class="btn small" data-action="zoom-out">Zoom out</button><button class="btn small" data-action="reset-camera">Reset view</button><span class="mini muted">Drag to rotate · Scroll to zoom · Click to select</span></div><div class="anatomy-note">3D anatomy: Open Anatomy 3D (BodyParts3D © DBCLS, HuBMAP, MakeHuman), CC BY 4.0. <a href="https://github.com/MervinR07/open-anatomy-3d/blob/main/ATTRIBUTION.md" target="_blank" rel="noopener">Attribution and license</a></div></article><article class="card card-padding"><div class="card-head"><h3>Region details</h3><small>Demo measurements</small></div><div class="region-hero"><div class="eyebrow">SELECTED REGION</div><h2 id="region-name">${esc(r.name)}</h2><p id="region-desc">${esc(r.desc)}</p></div><div class="region-metrics" id="region-metrics">${regionMetrics(r)}</div><div class="region-menu">${Object.entries(D.anatomyRegions).map(([key,r])=>`<button class="region-btn ${key===S.region?'active':''}" data-region="${key}">${ico(r.icon)} ${esc(r.name)}</button>`).join('')}</div><div class="advisory"><strong>Prototype limitations</strong><p>The anatomical map is illustrative. It does not diagnose conditions or infer regional measurements from the 3D model. Authenticated server findings are shown separately.</p></div></article></div>${footer()}`;
  }
  const regionMetrics = r => r.metrics.map(([key,value])=>`<div class="region-metric"><span>${esc(key)}</span><strong>${esc(value)}</strong></div>`).join('');
  function chooseRegion(key) {
    const r=D.anatomyRegions[key]; if(!r || !$('#region-name')) return;
    S.region=key; $('#region-name').textContent=r.name; $('#region-desc').textContent=r.desc; $('#region-metrics').innerHTML=regionMetrics(r);
    $$('.region-btn').forEach(b=>b.classList.toggle('active',b.dataset.region===key));
  }
  function showFallback() {
    const c=$('#three-container'); if(!c || $('.anatomy-fallback',c)) return;
    const loader=$('#anatomy-loader'); if(loader) loader.innerHTML=`${ico('mdi:human')}<strong>3D viewer unavailable</strong><span>Use the interactive 2D region map instead</span>`;
    const shapes={head:'<ellipse cx="120" cy="65" rx="29" ry="39"/>',chest:'<path d="M80 107 Q120 89 160 107 L154 210 L86 210 Z"/>',abdomen:'<path d="M86 211 L154 211 L151 284 L89 284 Z"/>',arms:'<path d="M78 110 L59 116 L40 246 L51 261 L74 165 Z M162 110 L181 116 L200 246 L189 261 L166 165 Z"/>',legs:'<path d="M90 285 L119 285 L116 446 L99 458 L90 442 Z M122 285 L150 285 L150 442 L140 458 L124 446 Z"/>'};
    c.insertAdjacentHTML('beforeend',`<div class="anatomy-fallback"><svg viewBox="0 0 240 480" aria-label="Interactive two-dimensional body map">${Object.entries(shapes).map(([key,shape])=>`<g data-region="${key}" fill="#183d56" stroke="#5dc6e1"><title>${esc(D.anatomyRegions[key].name)}</title>${shape}</g>`).join('')}</svg></div>`);
    $$('[data-region]',c).forEach(n=>n.addEventListener('click',()=>chooseRegion(n.dataset.region)));
  }
  const connectedPage = (title,sub) => `${label(title,sub)}<p class="backend-info">Preparing the server connection. If the sign-in form does not appear, check your connection and reload. No offline demo responses are generated here.</p>`;
  const routes={'index.html':'overview','ask-to-ai.html':'ai','personel-info.html':'personal','health-check.html':'health','crew-data.html':'crew-data','olcumler.html':'measurements','bis-analizi.html':'bis','ridge.html':'ridge','raporlar.html':'reports','takvim.html':'calendar','uyku.html':'sleep','toparlanma.html':'recovery','gunluk-yuk.html':'load','gorev-sagligi.html':'mission-health','gunluk-etkiler.html':'insights'};
  const pages={overview,measurements,bis:bisPage,ridge:ridgePage,'crew-data':()=>connectedPage('Crew Data','NASA-INSPIRED SYNTHETIC SCENARIOS'),reports:()=>connectedPage('Ground Team Reports','REPORTS AND MESSAGES'),personal:()=>connectedPage('Personnel Info','CREW INFORMATION'),ai:()=>connectedPage('Ask to AI','LOCAL MISSION ASSISTANT'),calendar,health,sleep:sleepPage,recovery:recoveryPage,load:loadPage,'mission-health':missionHealthPage,insights:insightsPage};
  function render() {
    window.ASTROBIO_ANATOMY?.destroy?.();
    const file=(location.pathname.split('/').pop() || 'index.html').toLowerCase(), hash=location.hash.slice(1).split('?')[0];
    S.route=Object.hasOwn(pages,hash)?hash:(routes[file] || document.body.dataset.startRoute || 'overview');
    $$('.nav-link').forEach(a=>{a.classList.toggle('active',a.dataset.route===S.route);if(a.dataset.route===S.route)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    $('#main').innerHTML=`<div class="page">${pages[S.route]()}</div>`; $('#main').setAttribute('aria-label',S.route); updateSidebar();
    if(S.route==='overview') {
      const entry=document.createElement('section');entry.className='card card-padding crew-entry';
      entry.innerHTML='<div><h2>Individual astronaut datasets</h2><p>Explore authorized 90-day profiles, time series and computed associations in Crew Data. The design examples below remain separate.</p></div><a class="btn primary" href="crew-data.html">Open Crew Data</a>';
      $('#main .page').prepend(entry);
    }
    if(['sleep','recovery','load','mission-health','insights','measurements','bis','ridge'].includes(S.route)) $('#main .section-top')?.insertAdjacentHTML('beforeend','<a class="text-link" href="crew-data.html">View individual crew records →</a>');
    if(S.route==='calendar') $('#calendar-note').value=readNotes()[toDate(S.selectedDate)] || '';
    if(S.route==='health') import('./anatomy.js').then(mod=>{if(S.route==='health')return mod.mount({onRegion:chooseRegion});}).catch(error=>{console.warn('Unable to load the 3D viewer:',error);showFallback();});
    window.scrollTo({top:0,behavior:'instant'});
  }
  function saveBlob(content,name,type) {
    const url=URL.createObjectURL(new Blob([content],{type})), a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function jsonReport() {
    return {project:'ASTROBIO',prototype:true,medicalDevice:false,source:S.imported?'browser-import':'synthetic-demo',astronaut:'A-01',mission:mode().name,delay:mode().delay,scenario:S.scenario,alert:scenarios[S.scenario],latest:latest(),timestamp:new Date().toISOString(),note:'Synthetic report for education and demonstration only. Not sent to the server.'};
  }
  function handleImport(file) {
    if(!file) return; if(file.size>2e6) {toast('The file must not exceed 2 MB.');return;}
    const reader=new FileReader(); reader.onload=()=>{try{
      const parsed=JSON.parse(reader.result), rows=Array.isArray(parsed)?parsed:parsed.records;
      if(!Array.isArray(rows) || rows.length<2 || rows.length>365) throw Error('The records array must contain 2–365 entries.');
      const required=['heart','spo2','temperature','sleep','bis','co2','radiation'];
      const checked=rows.map((r,i)=>{if(!r || typeof r!=='object' || required.some(k=>!Number.isFinite(Number(r[k]))))throw Error(`Record ${i+1}: a required numeric field is missing.`);return {day:dayLabel(r.day || `Day ${i+1}`).slice(0,30),index:i+1,...Object.fromEntries(required.map(k=>[k,Number(r[k])])),quality:['Good','Weak signal','Sensor freeze'].includes(quality(r.quality))?quality(r.quality):'Good'};});
      localStorage.setItem('astrobio-import-v1',JSON.stringify(checked)); S.records=checked; S.imported=true; toast(`${checked.length} example records imported into this browser.`); render();
    }catch(error){toast(`Unable to import JSON: ${error.message}`);}}; reader.readAsText(file);
  }
  function handleClick(event) {
    const b=event.target.closest('button,a'); if(!b) return;
    if(b.dataset.mode){S.mode=b.dataset.mode;localStorage.setItem('astrobio-mode',S.mode);render();return;}
    if(b.dataset.region){chooseRegion(b.dataset.region);window.ASTROBIO_ANATOMY?.focusRegion?.(b.dataset.region);return;}
    if(b.dataset.insightDays){S.insightPeriod=b.dataset.insightDays;render();return;}
    if(b.dataset.loadIndex!==undefined){S.loadIndex=Number(b.dataset.loadIndex);render();return;}
    if(b.dataset.scenario){S.scenario=b.dataset.scenario;render();return;}
    if(b.dataset.date){S.selectedDate=new Date(b.dataset.date+'T12:00:00');render();return;}
    if(b.dataset.layer){window.ASTROBIO_ANATOMY?.toggleLayer?.(b.dataset.layer,b);return;}
    switch(b.dataset.action){
      case 'report-json':saveBlob(JSON.stringify(jsonReport(),null,2),'ASTROBIO-demo-report.json','application/json;charset=utf-8');toast('Example report downloaded.');break;
      case 'csv':{const keys=['day','bis','heart','spo2','sleep','temperature','co2','radiation','quality'];const cell=v=>`"${String(v ?? '').replace(/"/g,'""')}"`;saveBlob('\uFEFF'+[keys.map(cell).join(';'),...S.records.map(r=>keys.map(k=>cell(r[k])).join(';'))].join('\n'),'ASTROBIO-measurements.csv','text/csv;charset=utf-8');toast('CSV exported.');break;}
      case 'reset-data':localStorage.removeItem('astrobio-import-v1');S.records=normalize(D.demo);S.imported=false;S.loadIndex=null;toast('Example data restored.');render();break;
      case 'print':window.print();break;
      case 'zoom-in':window.ASTROBIO_ANATOMY?.zoom?.(-.3);break;
      case 'zoom-out':window.ASTROBIO_ANATOMY?.zoom?.(.3);break;
      case 'reset-camera':window.ASTROBIO_ANATOMY?.reset?.();break;
      case 'month-prev':S.calendarMonth=new Date(S.calendarMonth.getFullYear(),S.calendarMonth.getMonth()-1,1);render();break;
      case 'month-next':S.calendarMonth=new Date(S.calendarMonth.getFullYear(),S.calendarMonth.getMonth()+1,1);render();break;
      case 'calendar-clear':{const notes=readNotes();delete notes[toDate(S.selectedDate)];setNotes(notes);toast('Local note deleted.');render();break;}
    }
  }
  function change(event) {
    if(event.target.id==='import-data') handleImport(event.target.files[0]);
    if(['cole-r0','cole-alpha'].includes(event.target.id)) {const r=Number($('#cole-r0').value),a=Number($('#cole-alpha').value);$('#cole-r0-val').textContent=r;$('#cole-alpha-val').textContent=fmt(a,2);$('#cole-plot').innerHTML=colePlot(r,a);}
  }
  function init() {
    window.ASTROBIO_DESIGN={setMission(value){if(!Object.hasOwn(D.missionModes,value))return;S.mode=value;localStorage.setItem('astrobio-mode',value);render();}};
    document.addEventListener('click',handleClick);document.addEventListener('change',change);document.addEventListener('input',event=>{if(event.target.id.startsWith('cole-'))change(event);});
    document.addEventListener('submit',event=>{if(event.target.id!=='calendar-form')return;event.preventDefault();const notes=readNotes();notes[toDate(S.selectedDate)]=$('#calendar-note').value.slice(0,500);try{setNotes(notes);toast('Note saved in this browser.');render();}catch{toast('Unable to save the local note. Browser storage may be unavailable.');}});
    window.addEventListener('hashchange',render);$('#top-clock').textContent=new Intl.DateTimeFormat('en-US',{dateStyle:'medium'}).format(new Date());render();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
