const $=id=>document.getElementById(id);
async function api(path,data){const r=await fetch(path,{method:data===undefined?'GET':'POST',credentials:'same-origin',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});const j=await r.json();if(!r.ok)throw Object.assign(new Error(j.error||'Service indisponible.'),{status:r.status});return j;}
const date=value=>new Date(value).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'});
function p(text,cls){const e=document.createElement('p');e.textContent=text;if(cls)e.className=cls;return e;}
async function refresh(){const data=await api('/api/admin/state');$('admin-login').hidden=true;$('admin-panel').hidden=false;$('configuration').textContent=data.ready?`Paramètres Dust renseignés · questions sans limite quotidienne. Vérifie l’accès ci-dessous avant invitation.`:'Le site est prêt à être configuré. Renseigne DUST_API_KEY, DUST_WORKSPACE_ID et DUST_AGENT_ID dans Render.';$('stats').replaceChildren();for(const[label,key]of[['Questions aujourd’hui','questions'],['Réponses terminées','completed'],['Avis positifs','positive'],['Avis négatifs','negative']]){const box=document.createElement('div');box.className='stat';const n=document.createElement('strong');n.textContent=data.stats[key]||0;const s=document.createElement('span');s.textContent=label;box.append(n,s);$('stats').append(box);}
  $('testers').replaceChildren();if(!data.users.length)$('testers').append(p('Aucun mot de passe généré pour le moment.','empty'));
  for(const u of data.users){const row=document.createElement('div');row.className='tester-row';row.append(p(u.label),p(`${u.used} questions aujourd’hui · sans limite quotidienne · expire le ${date(u.expires)}`,'meta'));if(u.enabled&&u.expires>Date.now()){const b=document.createElement('button');b.type='button';b.className='text-button revoke';b.textContent='Retirer l’accès';b.addEventListener('click',async()=>{if(!confirm(`Retirer l’accès de ${u.label} ?`))return;try{await api('/api/admin/revoke',{id:u.id});await refresh();}catch(e){$('admin-error').textContent=e.message;}});row.append(b);}else row.append(p('Accès inactif','meta'));$('testers').append(row);}
  const events={login:'Connexion',admin_login:'Connexion administrateur',access_created:'Mot de passe créé',access_revoked:'Accès retiré',question:'Question envoyée',answer:'Réponse terminée',error:'Échec de recherche'};
  $('events').replaceChildren();for(const e of data.events){const tr=document.createElement('tr');for(const t of [date(e.created),e.label||'Organisateur',(events[e.event]||e.event)+(e.code?' · '+e.code:'')+(e.detail?' — '+e.detail:'')]){const td=document.createElement('td');td.textContent=t;tr.append(td);}$('events').append(tr);}}
$('admin-login-form').addEventListener('submit',async e=>{e.preventDefault();$('login-error').textContent='';try{await api('/api/admin/login',{secret:$('secret').value});$('secret').value='';await refresh();}catch(err){$('login-error').textContent=err.message;}});
$('invite-form').addEventListener('submit',async e=>{e.preventDefault();const button=$('generate-password');if(button.disabled)return;button.disabled=true;$('admin-error').textContent='';$('invite-text').value='';$('invitation').hidden=true;try{const x=await api('/api/admin/invite',{days:Number($('days').value)});$('invite-text').value=`Voici ton accès à AlumniX :\n\nSite : ${x.url}\nAccès : ${x.label}\nMot de passe : ${x.password}\nValable jusqu’au ${date(x.expires)}.\nQuestions sans limite quotidienne.\n\nGarde ce mot de passe pour toi et vérifie les sources des réponses.`;$('invitation').hidden=false;await refresh();}catch(err){$('admin-error').textContent=err.message;}finally{button.disabled=false;}});
$('copy-invite').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('invite-text').value);$('copy-invite').textContent='Copié';setTimeout(()=>$('copy-invite').textContent='Copier l’invitation',2000);}catch{$('invite-text').select();$('admin-error').textContent='Sélectionne le texte puis copie-le manuellement.';}});
$('hide-invite').addEventListener('click',()=>{$('invite-text').value='';$('invitation').hidden=true;});
$('refresh').addEventListener('click',()=>refresh().catch(e=>$('admin-error').textContent=e.message));
$('logout').addEventListener('click',async()=>{await api('/api/logout',{});$('invite-text').value='';location.reload();});
refresh().catch(()=>{});

$('check-dust').addEventListener('click',async()=>{
  const button=$('check-dust'); const result=$('dust-diagnostic');
  button.disabled=true; result.replaceChildren(p('Vérification en cours…'));
  try {
    const diagnostic=await api('/api/admin/dust/check',{});
    result.replaceChildren(p(diagnostic.message,diagnostic.ok?'notice':'error'));
    if(diagnostic.code) result.append(p('Code : '+diagnostic.code,'fine'));
    const steps=document.createElement('ol');
    for(const text of diagnostic.steps){const item=document.createElement('li');item.textContent=text;steps.append(item);}
    result.append(steps);
  } catch(error) {result.replaceChildren(p(error.message,'error'));}
  finally {button.disabled=false;}
});
