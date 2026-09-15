(()=>{
'use strict';
const script=document.currentScript,key=script?.dataset.widgetKey;
if(!key||document.getElementById('sl-widget'))return;
const endpoint='https://keucuxicejohafnokfkz.supabase.co/functions/v1/widget-chat';
const storageKey='servelink_v2_'+key;
const root=document.createElement('div');root.id='sl-widget';
root.innerHTML=`<style>
#sl-widget{--sl-accent:#2563eb;--sl-ink:#fff;font:14px/1.5 system-ui,-apple-system,sans-serif;position:fixed;right:18px;bottom:18px;z-index:2147483000;color:#eaf1ff;text-align:left}
#sl-widget *{box-sizing:border-box}#sl-widget button,#sl-widget input{font:inherit}
#sl-widget button{cursor:pointer}#sl-widget button:disabled{cursor:wait;opacity:.6}
#sl-widget button:focus-visible,#sl-widget input:focus-visible{outline:3px solid #a8ceff;outline-offset:2px}
#sl-open{width:58px;height:58px;border:0;border-radius:50%;background:var(--sl-accent);color:var(--sl-ink);font-size:24px!important;box-shadow:0 12px 40px #0005}
#sl-panel{display:none;width:min(390px,calc(100vw - 28px));height:min(630px,calc(100dvh - 36px));background:#0b1625;border:1px solid #34455d;border-radius:18px;box-shadow:0 20px 70px #0007;overflow:hidden}
#sl-panel.open{display:flex;flex-direction:column}#sl-widget .sl-head{padding:14px 16px;background:var(--sl-accent);color:var(--sl-ink);display:flex;align-items:center;gap:10px}
#sl-widget .sl-title{flex:1;min-width:0}#sl-name-title{display:block;overflow-wrap:anywhere;font-weight:750}#sl-mode{font-size:12px}
#sl-widget .sl-close{background:transparent;color:inherit;border:0;font-size:24px}
#sl-widget .sl-toolbar{display:flex;justify-content:space-between;gap:10px;padding:8px 12px;border-bottom:1px solid #34455d}
#sl-widget .sl-link{background:transparent;border:0;color:#b9d5ff;text-decoration:underline;font-size:12px}
#sl-reset-confirm{padding:10px 12px;background:#213047}#sl-reset-confirm[hidden]{display:none}
#sl-widget .sl-msgs{flex:1;min-height:70px;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:12px;overscroll-behavior:contain}
#sl-widget .sl-msg{max-width:90%;padding:10px 12px;border-radius:13px;background:#1b2b42;white-space:pre-wrap;overflow-wrap:anywhere}
#sl-widget .sl-msg.me{align-self:flex-end;background:var(--sl-accent);color:var(--sl-ink)}
#sl-widget .sl-msg small{display:block;font-size:10px;opacity:.85;margin-bottom:3px}
#sl-widget .sl-contact{display:flex;gap:7px;padding:8px 12px}
#sl-widget input{min-width:0;width:100%;padding:10px;background:#101e31;color:#fff;border:1px solid #53627a;border-radius:8px}
#sl-widget .sl-form{display:flex;gap:7px;padding:10px 12px;border-top:1px solid #34455d}
#sl-widget .sl-form input{flex:1}#sl-widget .sl-send{background:var(--sl-accent);color:var(--sl-ink);border:0;border-radius:8px;padding:0 15px;font-weight:700}
#sl-feedback{padding:0 12px 6px;color:#c4d5ed;font-size:12px;min-height:24px}
#sl-widget .sl-brand{color:#9badc5;text-align:center;font-size:10px;padding:0 10px 8px}
#sl-widget [hidden]{display:none!important}
@media(max-width:480px){#sl-widget{right:14px;bottom:14px}#sl-panel{height:min(650px,calc(100dvh - 28px))}}
</style>
<section id="sl-panel" role="dialog" aria-label="Customer support chat">
<header class="sl-head"><div class="sl-title"><b id="sl-name-title">Customer support</b><span id="sl-mode">Connecting…</span></div><button class="sl-close" aria-label="Close chat">×</button></header>
<div class="sl-toolbar"><button class="sl-link" id="sl-new">Start new chat</button><button class="sl-link" id="sl-refresh">Refresh messages</button></div>
<div id="sl-reset-confirm" hidden>Start a new conversation? Your previous conversation remains in the business inbox.<br><button class="sl-link" id="sl-reset-yes">Start new</button><button class="sl-link" id="sl-reset-no">Keep this chat</button></div>
<div class="sl-msgs" role="log" aria-label="Conversation messages" aria-live="polite"></div>
<div class="sl-contact"><input id="sl-name" maxlength="200" placeholder="Name (optional)" aria-label="Your name (optional)" autocomplete="name"><input id="sl-email" type="email" maxlength="320" placeholder="Email (optional)" aria-label="Your email (optional)" autocomplete="email"></div>
<form class="sl-form"><input id="sl-input" maxlength="4000" placeholder="Type your message…" aria-label="Message" autocomplete="off" required><button class="sl-send" type="submit">Send</button></form>
<div id="sl-feedback" role="status"></div><button id="sl-retry" class="sl-link" hidden>Retry</button>
<div class="sl-brand">Powered by ServeLink AI · Messages are saved by this business.</div></section>
<button id="sl-open" aria-label="Open chat" aria-expanded="false">✦</button>`;
document.body.appendChild(root);
const $=s=>root.querySelector(s),panel=$('#sl-panel'),launcher=$('#sl-open'),log=$('.sl-msgs'),input=$('#sl-input'),send=$('.sl-send'),feedback=$('#sl-feedback'),retry=$('#sl-retry');
let session=null,config=null,opened=false,busy=false,epoch=0,poll=null,failed=null,signature='',lastMessages=[],aiEnabled=true;
try{const saved=JSON.parse(sessionStorage.getItem(storageKey)||'null');if(saved&&/^[0-9a-f]{64}$/i.test(saved.token))session=saved;}catch{}
function save(){try{sessionStorage.setItem(storageKey,JSON.stringify(session));}catch{feedback.textContent='Browser storage is unavailable. This chat lasts until you leave the page.';}}
function newSession(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);session={token:Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join(''),id:null};save();}
function textMessage(text,role='assistant',label='Assistant'){
 const el=document.createElement('div');el.className='sl-msg'+(role==='visitor'?' me':'');const small=document.createElement('small');small.textContent=label;el.append(small);
 const parts=String(text).split(/(\*\*[^*]+\*\*)/g);for(const p of parts){if(p.startsWith('**')&&p.endsWith('**')){const b=document.createElement('strong');b.textContent=p.slice(2,-2);el.append(b);}else el.append(document.createTextNode(p));}log.append(el);
}
function configure(c){
 config=c;$('#sl-name-title').textContent=c.name||'Customer support';
 const color=/^#[0-9a-f]{6}$/i.test(c.primary_color||'')?c.primary_color:'#2563eb';
 root.style.setProperty('--sl-accent',color);
 const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 root.style.setProperty('--sl-ink',rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.179?'#07111f':'#ffffff');
}
function render(data){
 if(data.assistant)configure(data.assistant);
 if(data.conversation_id){session.id=data.conversation_id;save();}
 aiEnabled=data.ai_enabled!==false;
 $('#sl-mode').textContent=aiEnabled?'AI assistant':'Human support · replies appear here';
 const messages=data.messages||[];
 const sig=JSON.stringify(messages.map(m=>[m.id,m.content]));
 if(sig!==signature){const nearBottom=log.scrollHeight-log.scrollTop-log.clientHeight<70;log.replaceChildren();
 textMessage(config?.greeting||'Hi! How can I help today?','assistant',config?.name||'Assistant');
 if(data.history_limited)textMessage('Showing the latest 100 messages.','assistant','Chat history');
 for(const m of messages)textMessage(m.content,m.sender_type,m.sender_type==='visitor'?'You':m.sender_type==='agent'?'Human teammate':config?.name||'Assistant');
 signature=sig;if(nearBottom||lastMessages.length===0)log.scrollTop=log.scrollHeight;
 }
 lastMessages=messages;
 if(failed&&messages.some(m=>m.client_request_id===failed.request_id&&m.sender_type==='visitor')){
  failed=null;retry.hidden=true;feedback.textContent=aiEnabled?'Message received. Waiting for a reply…':'Message sent to the human support queue.';
 }
}
async function request(action,extra={}){
 const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,widget_key:key,conversation_id:session?.id||null,session_token:session?.token,...extra}),signal:AbortSignal.timeout(45000)});
 const data=await r.json();if(!r.ok){const e=new Error(data.error||'Chat unavailable');e.code=data.code;e.status=r.status;throw e;}return data;
}
function showError(e){
 feedback.textContent=e.code==='SESSION_INVALID'?'This chat session expired. Start a new chat.':e.status===403?'Chat is not available on this website.':e.status===404?'This assistant is unavailable.':'Connection interrupted. Your message is kept; retry when connected.';
 retry.hidden=e.code==='SESSION_INVALID';retry.textContent=failed?'Retry sending':'Reconnect';
}
function setBusy(value){busy=value;send.disabled=value;input.disabled=value;$('#sl-new').disabled=value;$('#sl-refresh').disabled=value;retry.disabled=value;}
async function sync(){
 if(!opened||busy||document.hidden)return;
 const version=epoch;
 try{const data=await request('history');if(version!==epoch)return;render(data);if(!failed)feedback.textContent=aiEnabled?'':'A human teammate can reply here. Response times may vary.';}
 catch(e){if(version===epoch)showError(e);}
}
function startPoll(){clearInterval(poll);poll=setInterval(sync,3000);}
async function open(){
 panel.classList.add('open');launcher.hidden=true;launcher.setAttribute('aria-expanded','true');opened=true;
 if(!session)newSession();
 if(!config){feedback.textContent='Loading assistant…';try{configure((await request('config')).assistant);}catch(e){showError(e);return;}}
 await sync();startPoll();input.focus();
}
function close(){opened=false;clearInterval(poll);panel.classList.remove('open');launcher.hidden=false;launcher.setAttribute('aria-expanded','false');launcher.focus();}
launcher.onclick=open;$('.sl-close').onclick=close;
root.addEventListener('keydown',e=>{if(e.key==='Escape'&&opened)close();});
$('#sl-new').onclick=()=>{$('#sl-reset-confirm').hidden=false;};
$('#sl-reset-no').onclick=()=>{$('#sl-reset-confirm').hidden=true;};
$('#sl-reset-yes').onclick=async()=>{
 epoch++;failed=null;signature='';lastMessages=[];newSession();retry.hidden=true;input.value='';$('#sl-name').value='';$('#sl-email').value='';$('#sl-reset-confirm').hidden=true;await sync();input.focus();
};
$('#sl-refresh').onclick=sync;
async function submit(payload){
 const version=++epoch;setBusy(true);retry.hidden=true;feedback.textContent='Sending…';
 try{const data=await request('message',payload);if(version!==epoch)return;failed=null;render(data);input.value='';feedback.textContent=data.ai_enabled===false?'Message sent to human support.':data.replayed?'Message received.':'Sent';}
 catch(e){if(version===epoch){failed=payload;showError(e);}}
 finally{if(version===epoch){setBusy(false);input.focus();}}
}
$('.sl-form').onsubmit=e=>{
 e.preventDefault();if(busy)return;
 if(!config){showError(new Error('Not connected'));return;}
 if(!$('#sl-email').checkValidity()){$('#sl-email').reportValidity();return;}
 const message=input.value.trim();if(!message)return;
 if(failed){feedback.textContent='Retry your previous message or start a new chat before sending another.';retry.hidden=false;return;}
 submit({message,request_id:crypto.randomUUID(),visitor_name:$('#sl-name').value.trim()||null,visitor_email:$('#sl-email').value.trim()||null});
};
retry.onclick=()=>{if(failed)submit(failed);else open();};
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&opened)sync();});
window.addEventListener('online',()=>{if(opened)sync();});
request('config').then(data=>configure(data.assistant)).catch(()=>{});
})();