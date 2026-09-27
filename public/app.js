const $=id=>document.getElementById(id);
let threadId=null, busy=false, generation=0;
async function api(path,data){const r=await fetch(path,{method:data===undefined?'GET':'POST',credentials:'same-origin',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});const j=await r.json();if(!r.ok)throw Object.assign(new Error(j.error||'Service indisponible.'),{status:r.status});return j;}
function quota(user){$('quota').textContent=`${user.used} / ${user.limit} questions aujourd’hui`;}
function loginView(){generation++;$('chat-view').hidden=true;$('login-view').hidden=false;$('login-footer').hidden=false;threadId=null;}
async function enter(){const user=await api('/api/me');$('user-email').textContent=user.email;quota(user);$('login-view').hidden=true;$('login-footer').hidden=true;$('chat-view').hidden=false;$('not-ready').hidden=user.ready;$('send').disabled=!user.ready;$('question').disabled=!user.ready;}
$('login-form').addEventListener('submit',async e=>{e.preventDefault();$('login-error').textContent='';$('login-button').disabled=true;try{await api('/api/login',{email:$('email').value,code:$('code').value});$('code').value='';clearChat();await enter();}catch(err){$('login-error').textContent=err.message;}finally{$('login-button').disabled=false;}});
function clearChat(){threadId=null;document.querySelectorAll('.message').forEach(m=>m.remove());$('welcome').hidden=false;$('chat-status').textContent='';}
$('new-chat').addEventListener('click',()=>{if(!busy){clearChat();$('question').focus();}});
$('logout').addEventListener('click',async()=>{try{await api('/api/logout',{});}finally{clearChat();loginView();}});
document.querySelectorAll('[data-prompt]').forEach(b=>b.addEventListener('click',()=>{$('question').value=b.dataset.prompt;$('question').focus();}));
function message(role,text){$('welcome').hidden=true;const wrap=document.createElement('article');wrap.className=`message ${role}`;const label=document.createElement('p');label.className='message-label';label.textContent=role==='user'?'TOI':'ASSISTANT POLYTECHNIQUE';const content=document.createElement('div');content.className='message-body';content.textContent=text;wrap.append(label,content);$('messages').append(wrap);wrap.scrollIntoView({block:'end',behavior:'smooth'});return wrap;}
function feedback(wrap,jobId){const row=document.createElement('div');row.className='feedback';const label=document.createElement('span');label.textContent='Cette réponse t’a aidé ?';row.append(label);for(const [title,rating]of[['Oui',1],['Non',-1]]){const button=document.createElement('button');button.type='button';button.textContent=title;button.addEventListener('click',async()=>{try{await api('/api/feedback',{jobId,rating});row.replaceChildren(document.createTextNode('Merci pour ton retour.'));}catch(err){$('chat-status').textContent=err.message;}});row.append(button);}wrap.append(row);}
$('chat-form').addEventListener('submit',async e=>{
  e.preventDefault();const text=$('question').value.trim();if(!text||busy)return;
  busy=true;const active=generation;$('send').disabled=true;$('new-chat').disabled=true;$('question').value='';message('user',text);$('chat-status').textContent='Recherche dans les sources…';
  try{
    const job=await api('/api/chat',{message:text,threadId});if(active!==generation)return;threadId=job.threadId;quota(job);
    const deadline=Date.now()+300000;
    while(Date.now()<deadline){await new Promise(r=>setTimeout(r,2000));if(active!==generation)return;const state=await api('/api/jobs/'+job.jobId);if(active!==generation)return;if(state.state==='done'){feedback(message('assistant',state.answer),job.jobId);$('chat-status').textContent='';return;}if(state.state==='error')throw new Error(state.error);}
    throw new Error('La recherche n’a pas abouti à temps. Elle n’a pas été relancée automatiquement.');
  }catch(err){if(active!==generation)return;if(err.status===401){loginView();$('login-error').textContent=err.message;}else{$('chat-status').textContent=err.message;}}
  finally{busy=false;$('send').disabled=false;$('new-chat').disabled=false;if(active===generation)$('question').focus();}
});
$('question').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('chat-form').requestSubmit();}});
window.addEventListener('pageshow',()=>{if(!$('chat-view').hidden)api('/api/me').then(quota).catch(()=>{clearChat();loginView();});});
enter().catch(()=>loginView());
