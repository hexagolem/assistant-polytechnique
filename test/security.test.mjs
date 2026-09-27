import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApplication,readConfig} from '../server.mjs';
import {createDustClient,latestMessages,DustError} from '../dust.mjs';

const origin='http://localhost:3000';
const secret='fixture-only-admin-secret-not-for-production';
const cfg=dir=>({...readConfig({LOCAL_DEVELOPMENT:'true',PUBLIC_ORIGIN:origin,ADMIN_SECRET:secret,DATA_DIR:dir}),ready:true,agentId:'agent-test',pollMs:1,jobTimeoutMs:1000});
function fakeDust(){
  const conversations=new Map(); let serial=0; const calls=[];
  function answer(content){return {sId:'answer-'+(++serial),type:'agent',visibility:'visible',version:1,status:'succeeded',content,configuration:{sId:'agent-test',instructions:'NEVER EXPOSE THIS'},chainOfThought:'SECRET REASONING',actions:[{secret:'RAW TOOL CONTENT'}]};}
  return {calls,conversations,async create(content){calls.push(content);const c={sId:'conversation-'+(++serial),content:[[{sId:'human-'+serial,type:'human',content}],[answer('Réponse vérifiée. Source : exemple, uid=123.')]]};conversations.set(c.sId,c);return c;},async get(id){return conversations.get(id);},async post(id,content){calls.push(content);conversations.get(id).content.push([answer('Réponse suivante.')]);},async cancel(){}};
}
async function start(config,dust){const app=createApplication(config,dust);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;return {app,async request(path,{cookie='',data,originHeader=origin}={}){const response=await fetch(base+path,{method:data===undefined?'GET':'POST',headers:{...(cookie?{Cookie:cookie}:{}),...(data===undefined?{}:{'Content-Type':'application/json',Origin:originHeader})},body:data===undefined?undefined:JSON.stringify(data)});const text=await response.text();return {status:response.status,headers:response.headers,body:response.headers.get('content-type')?.includes('json')?JSON.parse(text):text,cookie:response.headers.get('set-cookie')?.split(';')[0]};}};}
async function done(site,job,cookie){for(let n=0;n<30;n++){const r=await site.request('/api/jobs/'+job,{cookie});if(r.body.state!=='pending')return r;await new Promise(r=>setTimeout(r,3));}assert.fail('job did not finish');}

test('end-to-end access controls, isolation, quotas and retained counters',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'poly-test-'));const dust=fakeDust();let site=await start(cfg(dir),dust);
  let admin,a,b,userId,threadId,jobId;
  try{
    await t.test('unauthenticated visitors cannot query, read answers or manage users',async()=>{
      for(const path of ['/api/me','/api/admin/state','/api/jobs/11111111-1111-4111-8111-111111111111'])assert.equal((await site.request(path)).status,401);
      assert.equal((await site.request('/api/chat',{data:{message:'hello'}})).status,401);
      for(const path of ['/server.mjs','/.env','/access.sqlite','/package.json'])assert.equal((await site.request(path)).status,404);
    });
    await t.test('login rejects cross-origin requests and sets HttpOnly SameSite cookies',async()=>{
      assert.equal((await site.request('/api/admin/login',{data:{secret},originHeader:'https://attacker.example'})).status,403);
      const r=await site.request('/api/admin/login',{data:{secret}});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.match(r.headers.get('set-cookie'),/SameSite=Strict/);admin=r.cookie;
    });
    await t.test('individual invitations work and are stored hashed',async()=>{
      const inviteA=await site.request('/api/admin/invite',{cookie:admin,data:{email:'alice@example.test',days:7,dailyLimit:2}});
      const inviteB=await site.request('/api/admin/invite',{cookie:admin,data:{email:'bob@example.test',days:7,dailyLimit:5}});
      assert.equal(inviteA.status,200);assert.equal(inviteA.body.code.length,43);
      assert.notEqual(site.app.db.prepare('SELECT code_hash FROM testers WHERE email=?').get('alice@example.test').code_hash,inviteA.body.code);
      assert.equal((await site.request('/api/login',{data:{email:'bob@example.test',code:inviteA.body.code}})).status,401);
      a=(await site.request('/api/login',{data:{email:'alice@example.test',code:inviteA.body.code}})).cookie;
      b=(await site.request('/api/login',{data:{email:'bob@example.test',code:inviteB.body.code}})).cookie;
      assert.equal((await site.request('/api/admin/state',{cookie:a})).status,403);
      userId=site.app.db.prepare('SELECT id FROM testers WHERE email=?').get('alice@example.test').id;
    });
    await t.test('only permitted server parameters are accepted',async()=>{
      assert.equal((await site.request('/api/chat',{cookie:a,data:{message:'Question',agentId:'other-agent'}})).status,400);
      assert.equal((await site.request('/api/chat',{cookie:a,data:{message:'x'.repeat(2001)}})).status,400);
      assert.equal((await site.request('/api/chat',{cookie:a,data:{message:'Question'},originHeader:'null'})).status,403);
      assert.equal(dust.calls.length,0);
    });
    await t.test('answer projection excludes tools, instructions and reasoning',async()=>{
      const start=await site.request('/api/chat',{cookie:a,data:{message:'QUESTION NOT IN AUDIT',threadId:null}});assert.equal(start.status,202);threadId=start.body.threadId;jobId=start.body.jobId;
      const r=await done(site,jobId,a);assert.equal(r.body.state,'done');assert.match(r.body.answer,/Source/);
      assert.deepEqual(Object.keys(r.body).sort(),['answer','state']);assert.doesNotMatch(JSON.stringify(r.body),/SECRET|RAW TOOL|configuration|instructions/);
      assert.doesNotMatch(JSON.stringify(site.app.db.prepare('SELECT * FROM audit').all()),/QUESTION NOT IN AUDIT/);
    });
    await t.test('another tester cannot read or append to an existing conversation',async()=>{
      assert.equal((await site.request('/api/jobs/'+jobId,{cookie:b})).status,404);
      assert.equal((await site.request('/api/chat',{cookie:b,data:{message:'intrusion',threadId}})).status,404);
      assert.equal((await site.request('/api/feedback',{cookie:b,data:{jobId,rating:1}})).status,404);
    });
    await t.test('follow-up uses the same owner conversation and is counted',async()=>{
      const r=await site.request('/api/chat',{cookie:a,data:{message:'suite',threadId}});assert.equal(r.status,202);assert.equal((await done(site,r.body.jobId,a)).body.answer,'Réponse suivante.');
      assert.equal(dust.conversations.size,1);assert.equal((await site.request('/api/chat',{cookie:a,data:{message:'quota'}})).status,429);
    });
    await t.test('quota survives restart; invitation renewal does not reset usage',async()=>{
      await site.app.close();site=await start(cfg(dir),dust);
      assert.equal((await site.request('/api/chat',{cookie:a,data:{message:'quota after restart'}})).status,429);
      const invite=await site.request('/api/admin/invite',{cookie:admin,data:{email:'alice@example.test',days:7,dailyLimit:2}});
      assert.equal((await site.request('/api/me',{cookie:a})).status,401);
      a=(await site.request('/api/login',{data:{email:'alice@example.test',code:invite.body.code}})).cookie;
      assert.equal((await site.request('/api/me',{cookie:a})).body.used,2);
      assert.equal((await site.request('/api/chat',{cookie:a,data:{message:'quota after renewal'}})).status,429);
    });
    await t.test('revocation immediately invalidates existing sessions',async()=>{
      assert.equal((await site.request('/api/admin/revoke',{cookie:admin,data:{id:userId}})).status,200);
      assert.equal((await site.request('/api/me',{cookie:a})).status,401);
      assert.equal((await site.request('/api/jobs/'+jobId,{cookie:a})).status,401);
    });
    await t.test('security headers and text-only rendering are active',async()=>{
      const r=await site.request('/');assert.match(r.headers.get('content-security-policy'),/default-src 'none'/);assert.equal(r.headers.get('cache-control'),'no-store');
      assert.doesNotMatch(readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),/innerHTML|localStorage/);
    });
  }finally{await site.app.close();rmSync(dir,{recursive:true,force:true});}
});

test('revocation during a run suppresses the result and requests cancellation',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'poly-revoke-'));let release;const wait=new Promise(r=>release=r);let cancelled=false;
  const dust={async create(){await wait;return {sId:'c1',content:[[{sId:'m1',type:'agent',status:'created',configuration:{sId:'agent-test'}}]]};},async get(){throw Error('must not poll');},async cancel(){cancelled=true;}};
  const site=await start(cfg(dir),dust);
  try{
    const admin=(await site.request('/api/admin/login',{data:{secret}})).cookie;
    const invite=(await site.request('/api/admin/invite',{cookie:admin,data:{email:'user@example.test',days:1,dailyLimit:2}})).body;
    const cookie=(await site.request('/api/login',{data:{email:invite.email,code:invite.code}})).cookie;
    const job=(await site.request('/api/chat',{cookie,data:{message:'go'}})).body;
    const uid=site.app.db.prepare('SELECT id FROM testers').get().id;
    await site.request('/api/admin/revoke',{cookie:admin,data:{id:uid}});release();
    for(let i=0;i<30 && site.app.db.prepare('SELECT state FROM jobs WHERE id=?').get(job.jobId).state==='pending';i++)await new Promise(r=>setTimeout(r,3));
    assert.equal(cancelled,true);assert.equal(site.app.db.prepare('SELECT answer FROM jobs WHERE id=?').get(job.jobId).answer,null);
  }finally{release();await site.app.close();rmSync(dir,{recursive:true,force:true});}
});

test('Dust adapter follows documented endpoints and does not follow redirects',async()=>{
  const requests=[];
  const client=createDustClient({dustOrigin:'https://eu.dust.tt',workspaceId:'workspace',apiKey:'dummy-key',agentId:'fixed-agent'},async(url,options)=>{requests.push({url,options});return new Response(JSON.stringify({conversation:{sId:'conv1',content:[]}}));});
  await client.create('test');await client.post('conv1','suite');await client.get('conv1');await client.cancel('conv1',['message1']);
  assert.equal(requests[0].url,'https://eu.dust.tt/api/v1/w/workspace/assistant/conversations');
  assert.deepEqual(JSON.parse(requests[0].options.body).message.mentions,[{configurationId:'fixed-agent'}]);
  assert.equal(JSON.parse(requests[0].options.body).skipToolsValidation,false);
  assert.equal(requests[0].options.redirect,'error');
  assert.equal(requests[1].url.endsWith('/conv1/messages'),true);
  assert.deepEqual(JSON.parse(requests[3].options.body),{messageIds:['message1']});
  await assert.rejects(()=>client.get('../../credentials'));
  assert.equal(latestMessages({content:[[{sId:'a',version:1},{sId:'b',version:2}]]})[0].sId,'b');
});

test('production refuses insecure configuration and local mode on Render',()=>{
  assert.throws(()=>readConfig({RENDER:'true',LOCAL_DEVELOPMENT:'true'}),/interdit/);
  assert.throws(()=>readConfig({PUBLIC_ORIGIN:'http://example.com',ADMIN_SECRET:secret}),/HTTPS/);
  assert.throws(()=>readConfig({LOCAL_DEVELOPMENT:'true',ADMIN_SECRET:'short'}),/32/);
  assert.throws(()=>readConfig({LOCAL_DEVELOPMENT:'true',ADMIN_SECRET:secret,DUST_ORIGIN:'https://attacker.example'}),/DUST_ORIGIN/);
});

test('Dust diagnostics are admin-only, read-only and do not expose secrets',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'poly-diagnostic-'));
  const dust=fakeDust(); let checks=0; let failure=null;
  dust.checkAgent=async()=>{checks++;if(failure)throw failure;return {status:'active',instructions:'PRIVATE',apiKey:'PRIVATE'};};
  const config=cfg(dir); const site=await start(config,dust);
  try {
    const path='/api/admin/dust/check';
    assert.equal((await site.request(path,{data:{}})).status,401);
    const admin=(await site.request('/api/admin/login',{data:{secret}})).cookie;
    const invite=(await site.request('/api/admin/invite',{cookie:admin,data:{email:'diagnostic@example.test',days:1,dailyLimit:5}})).body;
    const cookie=(await site.request('/api/login',{data:{email:invite.email,code:invite.code}})).cookie;
    assert.equal((await site.request(path,{cookie,data:{}})).status,403);
    assert.equal((await site.request(path,{cookie:admin,data:{},originHeader:'https://attacker.example'})).status,403);
    assert.equal((await site.request(path,{cookie:admin,data:{agentId:'other'}})).status,400);
    assert.equal(checks,0);
    const success=await site.request(path,{cookie:admin,data:{}});
    assert.equal(success.status,200);assert.equal(success.body.ok,true);
    assert.doesNotMatch(JSON.stringify(success.body),/PRIVATE|instructions|apiKey/);
    failure=new DustError('dust_http_400_agent_agent_inaccessible');
    const denied=await site.request(path,{cookie:admin,data:{}});
    assert.equal(denied.body.ok,false);assert.match(denied.body.message,/accès/);
    assert.match(denied.body.steps.join(' '),/DUST_AGENT_ID/);
    failure=new Error('PRIVATE raw exception');
    const unexpected=await site.request(path,{cookie:admin,data:{}});
    assert.equal(unexpected.body.code,'internal');assert.doesNotMatch(JSON.stringify(unexpected.body),/PRIVATE/);
    config.ready=false;
    const incomplete=await site.request(path,{cookie:admin,data:{}});
    assert.equal(incomplete.body.code,'dust_not_configured');assert.equal(checks,3);
    assert.equal(site.app.db.prepare('SELECT count(*) AS n FROM jobs').get().n,0);
    assert.equal(dust.calls.length,0);
    assert.equal((await site.request('/api/me',{cookie})).body.used,0);
    for(let i=0;i<2;i++)await site.request(path,{cookie:admin,data:{}});
    assert.equal((await site.request(path,{cookie:admin,data:{}})).status,429);
  } finally {await site.app.close();rmSync(dir,{recursive:true,force:true});}
});

test('agent_inaccessible gives testers a useful error and explains the admin audit',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'poly-access-error-'));const dust=fakeDust();let creates=0;
  dust.create=async()=>{creates++;throw new DustError('dust_http_400_create_agent_inaccessible');};
  const site=await start(cfg(dir),dust);
  try {
    const admin=(await site.request('/api/admin/login',{data:{secret}})).cookie;
    const invite=(await site.request('/api/admin/invite',{cookie:admin,data:{email:'error@example.test',days:1,dailyLimit:5}})).body;
    const cookie=(await site.request('/api/login',{data:{email:invite.email,code:invite.code}})).cookie;
    const job=(await site.request('/api/chat',{cookie,data:{message:'test'}})).body;
    const result=await done(site,job.jobId,cookie);
    assert.equal(result.body.state,'error');assert.match(result.body.error,/rétablir son accès/);
    assert.equal(creates,1);
    const state=(await site.request('/api/admin/state',{cookie:admin})).body;
    const event=state.events.find(e=>e.event==='error');
    assert.equal(event.code,'dust_http_400_create_agent_inaccessible');assert.match(event.detail,/clé API/);
  } finally {await site.app.close();rmSync(dir,{recursive:true,force:true});}
});
