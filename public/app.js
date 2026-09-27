import {renderAnswer} from './markdown.js';
import {api,waitForJob} from './api.js';
const $=id=>document.getElementById(id);
let threadId=null, busy=false, generation=0;
function quota(user){$('quota').textContent=`${user.used} questions aujourd’hui · sans limite quotidienne`;}
function loginView(){generation++;$('password').value='';$('chat-view').hidden=true;$('login-view').hidden=false;$('login-footer').hidden=false;threadId=null;}
async function enter(){const user=await api('/api/me');$('user-label').textContent=user.label;quota(user);$('login-view').hidden=true;$('login-footer').hidden=true;$('chat-view').hidden=false;$('not-ready').hidden=user.ready;$('send').disabled=!user.ready;$('question').disabled=!user.ready;}
$('login-form').addEventListener('submit',async e=>{e.preventDefault();$('login-error').textContent='';$('login-button').disabled=true;try{await api('/api/login',{password:$('password').value});$('password').value='';clearChat();await enter();}catch(err){$('login-error').textContent=err.message;}finally{$('login-button').disabled=false;}});
function clearChat(){threadId=null;document.querySelectorAll('.message').forEach(m=>m.remove());$('welcome').hidden=false;$('chat-status').textContent='';}
$('new-chat').addEventListener('click',()=>{if(!busy){clearChat();$('question').focus();}});
$('logout').addEventListener('click',async()=>{try{await api('/api/logout',{});}finally{clearChat();loginView();}});
document.querySelectorAll('[data-prompt]').forEach(b=>b.addEventListener('click',()=>{$('question').value=b.dataset.prompt;$('question').focus();}));
function message(role,text){$('welcome').hidden=true;const wrap=document.createElement('article');wrap.className=`message ${role}`;const label=document.createElement('p');label.className='message-label';label.textContent=role==='user'?'Toi':'AlumniX';const content=document.createElement('div');content.className='message-body';if(role==='assistant')renderAnswer(content,text);else content.textContent=text;wrap.append(label,content);$('messages').append(wrap);wrap.scrollIntoView({block:'end',behavior:'smooth'});return wrap;}
function feedback(wrap,jobId){const row=document.createElement('div');row.className='feedback';const label=document.createElement('span');label.textContent='Cette réponse t’a aidé ?';row.append(label);for(const [title,rating]of[['Oui',1],['Non',-1]]){const button=document.createElement('button');button.type='button';button.textContent=title;button.addEventListener('click',async()=>{try{await api('/api/feedback',{jobId,rating});row.replaceChildren(document.createTextNode('Merci pour ton retour.'));}catch(err){$('chat-status').textContent=err.message;}});row.append(button);}wrap.append(row);}
$('chat-form').addEventListener('submit',async e=>{
  e.preventDefault();const text=$('question').value.trim();if(!text||busy)return;
  busy=true;const active=generation;$('send').disabled=true;$('new-chat').disabled=true;$('question').value='';message('user',text);$('chat-status').textContent='Recherche dans les sources…';
  try{
    const job=await api('/api/chat',{message:text,threadId});if(active!==generation)return;threadId=job.threadId;quota(job);
    const state=await waitForJob(job.jobId,{isActive:()=>active===generation});
    if(!state||active!==generation)return;
    feedback(message('assistant',state.answer),job.jobId);$('chat-status').textContent='';
  }catch(err){if(active!==generation)return;if(err.status===401){loginView();$('login-error').textContent=err.message;}else{$('chat-status').textContent=err.message;}}
  finally{busy=false;$('send').disabled=false;$('new-chat').disabled=false;if(active===generation)$('question').focus();}
});
$('question').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('chat-form').requestSubmit();}});
window.addEventListener('pageshow',()=>{if(!$('chat-view').hidden)api('/api/me').then(quota).catch(err=>{if(err.status===401){clearChat();loginView();}});});
enter().catch(()=>loginView());
