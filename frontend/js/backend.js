// Same-origin adapter. Health rules and authorization remain on the Node server.
import { AstrobioVoiceClient } from '/clients/voice-client.js';
import { replyLanguage } from './chat-language.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $ = (s) => document.querySelector(s);
let token = sessionStorage.getItem('astrobio-session') || '';
let users = [], state = null, assessment = null, pipeline = null, subjectId = '', day = 60;
let generation = 0, voice = null, chat = [], busy = false, transcript = false;
let activeMission = '', loading = true, failure = '';
let languageMode = 'auto', detectedLanguage = 'en';
const listeners = new AbortController();
const numeric = {
  hematocritPct:'Hematocrit (%)', onsdMm:'ONSD (mm)', sleepHours7d:'7-day sleep average (hours)',
  spo2Pct:'SpO₂ (%)', restingHrBpm:'Resting heart rate (bpm)', urineLitersDay:'Urine output (L/day)',
  resistanceSessions7d:'7-day resistance exercise (sessions)', moodAvg7d:'7-day mood average (1–5)',
  bodyTempC:'Temperature (°C)', systolicBp:'Systolic pressure (mmHg)', diastolicBp:'Diastolic pressure (mmHg)',
  glucoseMgDl:'Glucose (mg/dL)', wbcK:'White blood cells (thousand/µL)', lymphK:'Lymphocytes (thousand/µL)',
  vitaminDNgMl:'Vitamin D (ng/mL)', bodyMassKg:'Body mass (kg)',
};
const booleans = {visionChange:'Vision change', ijvClotSeen:'IJV clot seen', headache:'Headache'};
const mission = () => $('.delay-option.active')?.dataset.mode || localStorage.getItem('astrobio-mode') || 'mars';
const route = () => $('.nav-link.active')?.dataset.route || 'overview';
const language = () => languageMode === 'auto' ? detectedLanguage : languageMode;
const context = () => ({day, mission: mission(), crewId: subjectId, language:language()});
const message = (text) => { const el = $('#backend-error'); if (el) el.textContent = text; };

function clearSession() {
  token = ''; sessionStorage.removeItem('astrobio-session');
  state = assessment = pipeline = null; subjectId = ''; resetChat();
}
function resetChat() {
  voice?.revokeConsent(); voice = null; chat = []; busy = false; transcript = false;
  detectedLanguage = 'en';
}
async function api(path, options = {}) {
  const response = await fetch(path, {...options, headers: {
    ...(options.body ? {'Content-Type':'application/json'} : {}),
    ...(token ? {Authorization:`Bearer ${token}`} : {}), ...options.headers,
  }});
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && token) { clearSession(); mount(); }
    throw new Error(data.error || `API error (${response.status})`);
  }
  return data;
}
const post = (path, body) => api(path, {method:'POST', body:JSON.stringify(body)});

async function refresh() {
  const current = ++generation;
  loading = true; failure = ''; draw();
  const selectedMission = mission();
  try {
    const nextState = await api('/api/state');
    const nextAssessment = nextState.user.role === 'surgeon' ? null : await api(`/api/assessment?day=${day}&mission=${selectedMission}&mode=space`);
    if (current !== generation) return;
    state = nextState; assessment = nextAssessment;
    const subjects = assessment?.subjects || [];
    if (!subjects.some(s => s.id === subjectId)) subjectId = subjects.find(s => s.id === state.user.id)?.id || subjects[0]?.id || '';
    activeMission = selectedMission;
  } catch (error) {
    if (current !== generation) return;
    // Never show a previous context's medical results after a failed refresh.
    state = assessment = null; failure = error.message;
  }
  if (current === generation) { loading = false; draw(); }
}
function mount() {
  ++generation; resetChat();
  const page = $('#main .page');
  if (!page) return;
  // Design pages stay compact: no connection panel, sign-in form or health
  // requests. The full authenticated health panel belongs only to Health Check.
  if (!['health','ai','reports','personal','calendar'].includes(route())) return;
  if (['ai','reports','personal'].includes(route())) page.replaceChildren();
  const host = document.createElement('section');
  host.id = route()==='health' ? 'backend-panel' : 'backend-workspace';
  host.className = route()==='health' ? 'backend-panel' : 'account-workspace card card-padding';
  page.prepend(host);
  if (route()==='health') {
    const notice = document.createElement('div'); notice.className = 'backend-demo-notice';
    notice.textContent = 'The anatomy map below is an independent synthetic design demo, not a regional assessment of the selected person. Authenticated server findings are shown in this panel.';
    host.after(notice);
  }
  if (token) refresh(); else { loading = false; draw(); }
}
function draw() {
  const host = $('#backend-panel') || $('#backend-workspace'); if (!host) return;
  const title = {health:'Mission Health System',ai:'Local AI and Voice Chat',reports:'Ground Team Reports',personal:'Personnel Info',calendar:'Mission-day Notes'}[route()];
  host.innerHTML = `${route()==='health'?'<div class="eyebrow">ASTROBIO · AUTHORIZED BACKEND CONNECTION</div>':''}<h1>${title}</h1><p class="backend-info">Simulation prototype · Not a medical device. The server filters data according to your role.</p><p id="backend-error" class="backend-error" role="alert">${esc(failure)}</p>`;
  if (!token) {
    host.insertAdjacentHTML('beforeend', `<form id="backend-login" class="backend-toolbar"><label>User<select class="field" name="userId" required>${users.map(u=>`<option value="${esc(u.id)}">${esc(u.name)} · ${esc(u.title)}</option>`).join('')}</select></label><label>Demo PIN<input class="field" name="pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="63" required></label><button class="btn primary" ${users.length?'':'disabled'}>Sign in</button></form><p class="backend-info">Demo PIN: 2026. Chat and health data are not saved permanently in the browser; the session token stays in this tab.</p>`);
    return;
  }
  host.insertAdjacentHTML('beforeend', `<div class="backend-toolbar"><span>${esc(state?.user.name || 'Session')} ${state ? '· '+esc(state.user.title) : ''}</span><button type="button" class="btn ghost" data-backend="logout">Sign out</button><button type="button" class="btn" data-backend="refresh">Refresh</button></div>`);
  if (loading) { host.insertAdjacentHTML('beforeend','<p role="status">Loading server data…</p>'); return; }
  if (!state) return;
  const earth = state.user.role === 'surgeon';
  host.insertAdjacentHTML('beforeend', `<div class="backend-toolbar"><label>Mission day (1–90)<input id="backend-day" class="field" type="number" min="1" max="90" step="1" value="${day}"></label>${earth?'':`<label>Authorized person / cabin<select id="backend-subject" class="field">${assessment.subjects.map(s=>`<option value="${esc(s.id)}" ${s.id===subjectId?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label>`}<span class="badge cyan">${esc(activeMission.toUpperCase())} · Day ${day}</span></div>`);
  if (route() === 'ai') {
    if (earth) host.insertAdjacentHTML('beforeend','<p>Ground staff can only read reports delivered to them. Chat is available to onboard crew.</p>');
    else drawChat(host);
  } else if (route() === 'reports' || earth) drawReports(host);
  else if (route() === 'personal') {
    host.insertAdjacentHTML('beforeend',`<p>${esc(state.user.name)} · ${esc(state.user.id)} · ${esc(state.user.title)}</p><p>Mission: ${esc(activeMission)} · Day ${day}. This account and mission data are simulated.</p>`);
  } else if (route() === 'calendar') {
    drawNotes(host);
  } else {
    drawFindings(host);
    drawCheckin(host);
    host.insertAdjacentHTML('beforeend','<p class="backend-info">Mission and day selection changes only the server context. Synthetic design examples remain separate.</p>');
  }
}
function drawFindings(host) {
  const subject = assessment.subjects.find(s=>s.id===subjectId); if (!subject) return;
  host.insertAdjacentHTML('beforeend', `<h3>${esc(subject.name)} · Server findings</h3><p class="backend-info">${subject.manual?'Saved check-in':'Simulated sensor feed'} · Each finding includes its source and measurement age. Health text is not rewritten by AI.</p><div class="backend-findings">${subject.space.map(f=>{
    const p = subject.info[f.id];
    return `<details class="backend-finding ${esc(f.level)}" ${f.level==='red'?'open':''}><summary>${esc(f.level.toUpperCase())} · ${esc(f.title)} — ${esc(f.measured)}</summary><p>${esc(f.why)}</p><p>${esc(f.next)}</p><p class="backend-info">${esc(p?.source)} · Measured on day ${esc(p?.measuredDay)} · Age ${esc(p?.ageDays)} days ${p?.stale?'· STALE DATA':''}</p><ul>${f.sourceIds.map(id=>{const s=assessment.sources[id];return `<li>${esc(id)}: ${esc(s?.title || '')}</li>`;}).join('')}</ul></details>`;
  }).join('')}</div>`);
}
function drawChat(host) {
  host.insertAdjacentHTML('beforeend', `<p>Messages go directly to local AI without selecting a finding: Qwen3 handles general conversation; MedGemma handles health education. Generated health information is not a personal assessment. Emergency warnings take priority. Chat history is not stored on the server.</p><button class="btn" data-backend="pipeline">Check model / voice status</button><pre id="backend-pipeline" class="backend-info"></pre><div id="backend-chat" class="backend-messages" aria-live="polite"></div><form id="backend-chat-form"><label for="backend-prompt">Message / voice transcript to confirm</label><textarea class="field" id="backend-prompt" maxlength="2000" required placeholder="Ask a question or start a voice recording"></textarea><div class="backend-toolbar"><button id="backend-send" class="btn primary">Send</button><label><span><input id="backend-voice-consent" type="checkbox"> I consent to microphone recording and local STT/TTS processing</span></label><button type="button" class="btn" data-backend="record">Record 8 seconds</button><button type="button" class="btn ghost" data-backend="stop">Stop / cancel audio</button></div><p id="backend-transcript" class="backend-info">Transcripts are not sent automatically; review and confirm them first. Voice requires localhost/HTTPS and a running voice:server.</p></form>`);
  renderChat();
  const selector = document.createElement('label');
  selector.className = 'backend-toolbar';
  selector.innerHTML = 'Reply / recording language <select id="backend-language" class="field"><option value="auto">Auto (message language)</option><option value="en">English</option><option value="tr">Turkish</option></select>';
  $('#backend-chat-form').prepend(selector);
  $('#backend-language').value = languageMode;
  host.insertAdjacentHTML('beforeend', '<p class="backend-info">Speech playback uses your configured local voice. An English voice is recommended for English replies; no voice model is replaced automatically.</p>');
}
function renderChat() {
  const log = $('#backend-chat'); if (!log) return;
  log.innerHTML = chat.map(m=>`<div class="backend-message"><strong>${m.role==='user'?'You':'Astrobio'}</strong><p>${esc(m.text)}</p>${m.replyId?`<button type="button" class="btn small" data-backend="speak" data-reply="${esc(m.replyId)}">Read reply aloud</button>`:''}</div>`).join('');
  log.scrollTop = log.scrollHeight;
}
function drawReports(host) {
  if (assessment) host.insertAdjacentHTML('beforeend', `<h3>Server-generated report</h3><pre class="backend-report">${esc(assessment.report)}</pre><div class="backend-toolbar"><button class="btn" data-backend="download">Download report</button><button class="btn primary" data-backend="send-report">Send report to ground team</button></div>`);
  host.insertAdjacentHTML('beforeend', `<h3>Authorized messages and delivery status</h3><p class="backend-info">Delivery follows the server's mission delay. The demo time scale is accelerated. Use Refresh for new deliveries; this is not a real Earth link.</p><div class="backend-messages">${state.messages.map(m=>`<article class="backend-message"><strong>${esc(m.from_name)} · Day ${esc(m.day)} · ${m.delivered?'Delivered':'Queued for delivery'}</strong><p>${esc(m.body)}</p></article>`).join('') || 'No visible messages yet.'}</div><form id="backend-message-form"><label for="backend-message">Message</label><textarea id="backend-message" class="field" maxlength="4000" required></textarea>${state.user.role==='surgeon'?`<label>Recipient<select id="backend-recipient" class="field">${users.filter(u=>u.role!=='surgeon').map(u=>`<option value="${esc(u.id)}">${esc(u.name)}</option>`).join('')}</select></label>`:''}<button class="btn primary">Send message</button></form>`);
}
function drawNotes(host) {
  host.insertAdjacentHTML('beforeend', `<h3>Day ${day} · Server journal</h3><form id="backend-note-form"><textarea id="backend-note" class="field" maxlength="1000" required placeholder="This note is saved to SQLite under your account"></textarea><button class="btn primary">Save to server</button></form><div class="backend-messages">${state.notes.filter(n=>n.day===day).map(n=>`<div class="backend-message">${esc(n.crew_id)}: ${esc(n.text)}</div>`).join('')}</div>`);
}
function drawCheckin(host) {
  if (subjectId==='cabin') return;
  const prior = state.checkIns[`${subjectId}:${day}`] || {};
  host.insertAdjacentHTML('beforeend', `<details><summary>Save / update check-in for day ${day}</summary><p class="backend-info">Verify every field. Saving replaces the selected person's complete reading for this day. The server validates data and permissions. Do not enter real patient data.</p><form id="backend-checkin-form"><div class="backend-checkin">${Object.entries(numeric).map(([key,title])=>`<label>${esc(title)}<input class="field" name="${key}" type="number" step="any" value="${esc(prior[key] ?? '')}" required></label>`).join('')}${Object.entries(booleans).map(([key,title])=>`<label>${title}<select class="field" name="${key}" required><option value="">Select</option><option value="false" ${prior[key]===false?'selected':''}>No</option><option value="true" ${prior[key]===true?'selected':''}>Yes</option></select></label>`).join('')}<label>IJV flow<select class="field" name="ijvFlow" required><option value="">Select</option>${['forward','stagnant','retrograde'].map(v=>`<option ${prior.ijvFlow===v?'selected':''}>${v}</option>`).join('')}</select></label></div><button class="btn primary">Save complete check-in to server</button></form></details>`);
}
async function submitChat() {
  if (busy) return;
  const input = $('#backend-prompt'), text = input.value.trim(); if (!text) return;
  if (transcript && !window.confirm('Do you confirm sending the reviewed voice transcript to the AI system?')) return;
  if (languageMode === 'auto') detectedLanguage = replyLanguage(text, detectedLanguage);
  const current = generation;
  const fromVoice = transcript;
  busy = true; $('#backend-send').disabled = true; message('');
  chat.push({role:'user',text}); renderChat(); input.value = '';
  try {
    const result = fromVoice
      ? await voice.sendConfirmedText(text, context())
      : await post('/api/chat', {...context(), message:text, inputOrigin:'text'});
    if (current !== generation) return;
    chat.push({role:'bot',text:result.reply,replyId:result.replyId});
    transcript = false; $('#backend-transcript').textContent = 'Reply received. Speech playback authorization expires after 120 seconds.';
    renderChat();
  } catch (error) { if(current===generation) { message(error.message); input.value=text; } }
  finally { if(current===generation) { busy=false; $('#backend-send').disabled=false; } }
}
async function handleAction(action, button) {
  if (action==='logout') {
    try { await post('/api/logout', {}); } finally { clearSession(); mount(); }
    return;
  }
  if (action==='refresh') { resetChat(); await refresh(); return; }
  if (action==='pipeline') {
    const current = generation;
    pipeline = await api('/api/ai/pipeline/status');
    if (current===generation && $('#backend-pipeline')) $('#backend-pipeline').textContent=JSON.stringify(pipeline,null,2);
  }
  if (action==='download') {
    const url=URL.createObjectURL(new Blob([assessment.report],{type:'text/plain;charset=utf-8'}));
    const a=document.createElement('a'); a.href=url; a.download=`astrobio-${activeMission}-${day}.txt`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  if (action==='send-report') {
    if (!window.confirm('Send this server report to the ground team through the delayed delivery queue?')) return;
    await post('/api/messages',{day,mission:activeMission,kind:'report',body:assessment.report}); await refresh();
  }
  if (['record','speak'].includes(action)) {
    if (!$('#backend-voice-consent')?.checked) throw new Error('Select the voice consent checkbox first.');
    if (busy) throw new Error('Wait for the current operation to finish.');
    voice ||= new AstrobioVoiceClient(token); voice.grantConsent();
    if (action==='speak') { await voice.speak(button.dataset.reply); return; }
    const current=generation; busy=true; $('#backend-send').disabled=true;
    try {
      message('Recording for 8 seconds…');
      const audio=await voice.record(8);
      if (current!==generation) return;
      message('Preparing the local transcript…');
      const result=await voice.transcribe(audio,language());
      if (current!==generation) return;
      $('#backend-prompt').value=result.text; transcript=true; message('');
      $('#backend-transcript').textContent='Review / edit the transcript. The Send button will ask for explicit confirmation.';
    } finally { if(current===generation) { busy=false; $('#backend-send').disabled=false; } }
  }
  if(action==='stop') { voice?.stop(); message('Audio operation stopped.'); }
}

document.addEventListener('submit', async event => {
  if (!event.target.id.startsWith('backend-')) return;
  event.preventDefault(); message('');
  const form=event.target, button=form.querySelector('button');
  if (button?.disabled) return;
  if (button) button.disabled=true;
  try {
    if(form.id==='backend-login') {
      const fields=new FormData(form);
      const result=await post('/api/login',{userId:fields.get('userId'),pin:fields.get('pin')});
      token=result.token; sessionStorage.setItem('astrobio-session',token); await refresh();
    }
    if(form.id==='backend-chat-form') await submitChat();
    if(form.id==='backend-message-form') {
      await post('/api/messages',{day,mission:activeMission,body:$('#backend-message').value,toUserId:$('#backend-recipient')?.value}); await refresh();
    }
    if(form.id==='backend-note-form') { await post('/api/notes',{day,text:$('#backend-note').value}); await refresh(); }
    if(form.id==='backend-checkin-form') {
      const data=new FormData(form), reading={};
      for(const key of Object.keys(numeric)) reading[key]=Number(data.get(key));
      for(const key of Object.keys(booleans)) reading[key]=data.get(key)==='true';
      reading.ijvFlow=data.get('ijvFlow');
      const attachment=state.checkIns[`${subjectId}:${day}`]?.attachment;
      if(attachment) reading.attachment=attachment;
      await api(`/api/checkins/${encodeURIComponent(subjectId)}/${day}`,{method:'PUT',body:JSON.stringify(reading)}); await refresh();
    }
  } catch(error) { message(error.message); }
  finally { if(button?.isConnected) button.disabled=false; }
}, {signal:listeners.signal});
document.addEventListener('click', async event => {
  const button=event.target.closest('[data-backend]'); if(!button || button.disabled) return;
  button.disabled=true; message('');
  try { await handleAction(button.dataset.backend,button); } catch(error) { message(error.message); }
  finally { if(button.isConnected) button.disabled=false; }
}, {signal:listeners.signal});
document.addEventListener('change', event => {
  if(event.target.id==='backend-language') {
    languageMode=event.target.value;
    voice?.stop();
    return;
  }
  if(event.target.id==='backend-day') {
    const value=Number(event.target.value);
    if(!Number.isInteger(value)||value<1||value>90) { message('Mission day must be an integer from 1 to 90.'); event.target.value=day; return; }
    day=value; resetChat(); refresh();
  }
  if(event.target.id==='backend-subject') { subjectId=event.target.value; ++generation; resetChat(); draw(); }
  if(event.target.id==='backend-voice-consent' && !event.target.checked) {
    voice?.revokeConsent();
    if(transcript) { $('#backend-prompt').value=''; transcript=false; }
  }
}, {signal:listeners.signal});
window.addEventListener('pagehide',()=>voice?.revokeConsent(),{signal:listeners.signal});
const observer = new MutationObserver(()=>mount());
if (!$('#main')) await new Promise(resolve => document.addEventListener('DOMContentLoaded',resolve,{once:true}));
observer.observe($('#main'),{childList:true});
export function dispose() { ++generation; resetChat(); observer.disconnect(); listeners.abort(); }
mount();
try { const result=await api('/api/users'); users=result.users; } catch(error) { failure=error.message; }
draw();
