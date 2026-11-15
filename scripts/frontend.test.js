// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

let requests, fetchMock, adapter;
const user = {id:'C1',name:'Test Crew',role:'crew',title:'Commander'};
const subjects = [{id:'C1',name:'Test Crew',manual:false,space:[{id:'sleep',title:'Sleep',level:'amber',measured:'5 h',why:'Original rule text',next:'Review',sourceIds:[]}],info:{sleep:{source:'Wearable',measuredDay:59,ageDays:1,stale:false}}}];
const state = {user,checkIns:{},notes:[],messages:[]};
const assessment = {subjects,sources:{},report:'Canonical server report'};
const wait = async (selector) => vi.waitFor(()=>expect(document.querySelector(selector)).not.toBeNull());
const submit = (selector) => document.querySelector(selector).dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
async function boot(route='health', signedIn=false) {
  document.body.innerHTML=`<a class="nav-link active" data-route="${route}"></a><button class="delay-option active" data-mode="mars"></button><main id="main"><div class="page"><p>Design demo</p></div></main>`;
  if(signedIn) sessionStorage.setItem('astrobio-session','test-token');
  adapter = await import('../frontend/js/backend.js');
  await wait(signedIn ? '#backend-day' : '#backend-login');
}
beforeEach(()=>{
  vi.resetModules(); sessionStorage.clear(); localStorage.clear(); requests=[]; adapter=null;
  window.confirm=vi.fn(()=>true);
  fetchMock=vi.fn(async (path,options={})=>{
    requests.push({path,options});
    let data = path==='/api/users'?{users:[user]}:path==='/api/login'?{token:'test-token',user}:path==='/api/state'?state:path.startsWith('/api/assessment')?assessment:path==='/api/chat'?{reply:'Canonical AI reply',replyId:'receipt'}:{ok:true};
    return {ok:true,status:200,json:async()=>data};
  });
  vi.stubGlobal('fetch',fetchMock);
});
afterEach(()=>{adapter?.dispose();vi.restoreAllMocks();vi.unstubAllGlobals();document.body.replaceChildren();});

describe('frontend API adapter',()=>{
  it('signs in and renders authorized canonical findings, separate from design demos',async()=>{
    await boot();
    document.querySelector('[name=pin]').value='2026';
    submit('#backend-login');
    await vi.waitFor(()=>expect(document.body.textContent).toContain('Original rule text'));
    expect(document.querySelector('.backend-demo-notice').textContent).toContain('independent synthetic');
    expect(requests.find(r=>r.path==='/api/login').options.body).toContain('2026');
    expect(requests.find(r=>r.path==='/api/state').options.headers.Authorization).toBe('Bearer test-token');
    expect(sessionStorage.getItem('astrobio-session')).toBe('test-token');
    expect(localStorage.length).toBe(0);
  });
  it('uses real chat API instead of the standalone demo response',async()=>{
    await boot('ai',true);
    expect(document.body.textContent).not.toContain('Design demo');
    document.querySelector('#backend-prompt').value='Hello';
    submit('#backend-chat-form');
    await vi.waitFor(()=>expect(document.body.textContent).toContain('Canonical AI reply'));
    const call=requests.find(r=>r.path==='/api/chat');
    expect(JSON.parse(call.options.body)).toMatchObject({message:'Hello',crewId:'C1',mission:'mars',day:60,inputOrigin:'text',language:'en'});
    expect(document.querySelector('#backend-panel')).toBeNull();
    expect(document.body.textContent).not.toContain('AUTHORIZED BACKEND CONNECTION');
    expect(document.querySelector('[data-backend=speak]').dataset.reply).toBe('receipt');
  });
  it('sends the canonical report through the server queue',async()=>{
    await boot('reports',true);
    document.querySelector('[data-backend=send-report]').click();
    await vi.waitFor(()=>expect(requests.some(r=>r.path==='/api/messages')).toBe(true));
    expect(JSON.parse(requests.find(r=>r.path==='/api/messages').options.body)).toMatchObject({kind:'report',body:'Canonical server report',day:60,mission:'mars'});
  });
  it('clears a rejected session without exposing prior findings',async()=>{
    fetchMock.mockImplementation(async path=>path==='/api/users'?{ok:true,json:async()=>({users:[user]})}:{ok:false,status:401,json:async()=>({error:'Please sign in.'})});
    await boot('health',true).catch(()=>{});
    await wait('#backend-login');
    expect(sessionStorage.getItem('astrobio-session')).toBeNull();
    expect(document.body.textContent).not.toContain('Original rule text');
  });
  it('requires voice consent before attempting a recording',async()=>{
    await boot('ai',true);
    document.querySelector('[data-backend=record]').click();
    await vi.waitFor(()=>expect(document.querySelector('#backend-error').textContent).toContain('consent checkbox'));
    expect(requests.some(r=>r.path.startsWith('/api/voice/'))).toBe(false);
  });
  it('does not display stale findings when a context refresh fails',async()=>{
    await boot('health',true);
    expect(document.body.textContent).toContain('Original rule text');
    fetchMock.mockResolvedValue({ok:false,status:503,json:async()=>({error:'Service unavailable'})});
    const input=document.querySelector('#backend-day'); input.value='61';
    input.dispatchEvent(new Event('change',{bubbles:true}));
    await vi.waitFor(()=>expect(document.body.textContent).toContain('Service unavailable'));
    expect(document.body.textContent).not.toContain('Original rule text');
  });
  it('keeps the Earth role restricted to delivered messages, without requesting assessments',async()=>{
    const original=fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async(path,options)=>path==='/api/state'?{ok:true,json:async()=>({...state,user:{...user,id:'FS',role:'surgeon'}})}:original(path,options));
    await boot('health',true);
    expect(document.body.textContent).toContain('Authorized messages');
    expect(requests.some(r=>r.path.startsWith('/api/assessment'))).toBe(false);
    expect(document.querySelector('#backend-subject')).toBeNull();
    expect(document.querySelector('#backend-recipient')).not.toBeNull();
  });
  it('displays a transcript for editing and requires confirmation before voice chat',async()=>{
    await boot('ai',true);
    // resetModules gives the adapter its own class instance; mock that instance's
    // prototype after importing through the same module graph.
    const {AstrobioVoiceClient: Voice}=await import('../clients/voice-client.js');
    vi.spyOn(Voice.prototype,'record').mockResolvedValue(new Blob(['synthetic-test-audio']));
    const transcribe=vi.spyOn(Voice.prototype,'transcribe').mockResolvedValue({text:'Voice transcript'});
    const send=vi.spyOn(Voice.prototype,'sendConfirmedText').mockResolvedValue({reply:'Confirmed voice reply',replyId:'voice-receipt'});
    document.querySelector('#backend-voice-consent').checked=true;
    document.querySelector('[data-backend=record]').click();
    await vi.waitFor(()=>expect(document.querySelector('#backend-prompt').value).toBe('Voice transcript'));
    expect(transcribe).toHaveBeenCalledWith(expect.any(Blob),'en');
    expect(send).not.toHaveBeenCalled();
    document.querySelector('#backend-prompt').value='Edited transcript';
    window.confirm.mockReturnValue(false); submit('#backend-chat-form');
    await vi.waitFor(()=>expect(document.querySelector('#backend-send').disabled).toBe(false));
    expect(send).not.toHaveBeenCalled();
    window.confirm.mockReturnValue(true); submit('#backend-chat-form');
    await vi.waitFor(()=>expect(send).toHaveBeenCalledWith('Edited transcript',expect.objectContaining({crewId:'C1',day:60,language:'en'})));
  });
  it.each(['overview','sleep','recovery','load','mission-health','insights','measurements','bis','ridge'])('does not mount a backend panel or fetch health data on %s',async route=>{
    document.body.innerHTML=`<a class="nav-link active" data-route="${route}"></a><main id="main"><div class="page"><h1>Design page</h1></div></main>`;
    sessionStorage.setItem('astrobio-session','test-token');
    adapter=await import('../frontend/js/backend.js');
    expect(document.querySelector('#backend-panel')).toBeNull();
    expect(document.querySelector('#backend-workspace')).toBeNull();
    expect(document.querySelector('#backend-login')).toBeNull();
    expect(document.querySelector('.backend-demo-notice')).toBeNull();
    expect(document.querySelector('h1').textContent).toBe('Design page');
    expect(requests.some(r=>r.path==='/api/state'||r.path.startsWith('/api/assessment'))).toBe(false);
  });
  it.each(['reports','personal','calendar'])('keeps %s functional without the health connection panel',async route=>{
    await boot(route,true);
    expect(document.querySelector('#backend-panel')).toBeNull();
    expect(document.querySelector('.backend-panel')).toBeNull();
    expect(document.querySelector('#backend-workspace')).not.toBeNull();
    expect(document.body.textContent).not.toContain('AUTHORIZED BACKEND CONNECTION');
  });
  it('mounts the authorized connection panel only on Interactive Health Check',async()=>{
    await boot('health',true);
    expect(document.querySelector('#backend-panel')).not.toBeNull();
    expect(document.body.textContent).toContain('AUTHORIZED BACKEND CONNECTION');
    expect(document.querySelector('#backend-checkin-form')).not.toBeNull();
  });
  it('automatically requests Turkish for a Turkish message without changing English UI labels',async()=>{
    await boot('ai',true);
    document.querySelector('#backend-prompt').value='Biraz baş ağrım var, ne yapabilirim?';
    submit('#backend-chat-form');
    await vi.waitFor(()=>expect(requests.some(r=>r.path==='/api/chat')).toBe(true));
    expect(JSON.parse(requests.find(r=>r.path==='/api/chat').options.body).language).toBe('tr');
    expect(document.querySelector('#backend-send').textContent).toBe('Send');
  });
  it('allows an explicit reply language and uses it for voice transcription',async()=>{
    await boot('ai',true);
    const select=document.querySelector('#backend-language'); select.value='tr';
    select.dispatchEvent(new Event('change',{bubbles:true}));
    const {AstrobioVoiceClient: Voice}=await import('../clients/voice-client.js');
    vi.spyOn(Voice.prototype,'record').mockResolvedValue(new Blob(['synthetic-test-audio']));
    const transcribe=vi.spyOn(Voice.prototype,'transcribe').mockResolvedValue({text:'Merhaba'});
    document.querySelector('#backend-voice-consent').checked=true;
    document.querySelector('[data-backend=record]').click();
    await vi.waitFor(()=>expect(transcribe).toHaveBeenCalledWith(expect.any(Blob),'tr'));
  });
});
