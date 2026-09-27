import test from 'node:test';
import assert from 'node:assert/strict';
import {createDustClient, DustError, dustDiagnostic, latestMessages} from '../dust.mjs';
import {readConfig} from '../server.mjs';

const config = {dustOrigin:'https://eu.dust.tt',workspaceId:'workspace',agentId:'fixed-agent',apiKey:'fixture-key'};
const response = (data, status=200) => new Response(JSON.stringify(data), {status});

test('agent diagnostic reads only the configured agent and returns no raw configuration',async()=>{
  const requests=[];
  const client=createDustClient(config,async(url,options)=>{
    requests.push({url,options});
    return response({agentConfiguration:{sId:'fixed-agent',status:'active',canRead:true,instructions:'PRIVATE',actions:[{secret:'PRIVATE'}]}});
  });
  assert.deepEqual(await client.checkAgent(),{status:'active'});
  assert.equal(requests.length,1);
  assert.equal(requests[0].url,'https://eu.dust.tt/api/v1/w/workspace/assistant/agent_configurations/fixed-agent?variant=light');
  assert.equal(requests[0].options.method,'GET');
  assert.equal(requests[0].options.body,undefined);
  assert.equal(requests[0].options.redirect,'error');
  assert.equal(requests[0].options.headers.Authorization,'Bearer fixture-key');
});

test('agent diagnostic distinguishes disabled states and permission denial',async t=>{
  for(const status of ['archived','disabled_by_admin','disabled_missing_datasource','disabled_free_workspace','pending']) {
    await t.test(status,async()=>{
      const client=createDustClient(config,async()=>response({agentConfiguration:{sId:'fixed-agent',status}}));
      await assert.rejects(()=>client.checkAgent(),{code:'dust_agent_'+status});
      assert.notEqual(dustDiagnostic('dust_agent_'+status).message,'La vérification Dust a échoué.');
    });
  }
  const client=createDustClient(config,async()=>response({agentConfiguration:{sId:'fixed-agent',status:'active',canRead:false}}));
  await assert.rejects(()=>client.checkAgent(),{code:'dust_agent_forbidden'});
});

test('agent diagnostic accepts the documented light shape and flags drafts',async()=>{
  for(const status of ['active','draft']) {
    const client=createDustClient(config,async()=>response({agentConfiguration:{sId:'fixed-agent',status}}));
    assert.deepEqual(await client.checkAgent(),{status});
  }
});

test('agent diagnostic rejects missing, mismatched and unknown configurations',async()=>{
  for(const agentConfiguration of [null,{sId:'other-agent',status:'active'},{sId:'fixed-agent',status:'unrecognized-private-status'}]) {
    const client=createDustClient(config,async()=>response({agentConfiguration}));
    await assert.rejects(()=>client.checkAgent(),{code:'dust_format'});
  }
});

test('the reported HTTP 400 is preserved for create and post without exposing Dust details',async()=>{
  const requests=[];
  const client=createDustClient(config,async(url,options)=>{
    requests.push({url,options});
    return response({error:{type:'agent_inaccessible',message:'PRIVATE upstream details fixture-key'}},400);
  });
  for(const [stage,call] of [['create',()=>client.create('Question')],['post',()=>client.post('conv1','Suite')],['agent',()=>client.checkAgent()]]) {
    await assert.rejects(call,error=>{
      assert.ok(error instanceof DustError);
      assert.equal(error.code,`dust_http_400_${stage}_agent_inaccessible`);
      assert.doesNotMatch(error.message,/PRIVATE|fixture-key/);
      const diagnostic=dustDiagnostic(error.code);
      assert.match(diagnostic.message,/accès/);
      assert.match(diagnostic.steps.join(' '),/espaces/);
      assert.doesNotMatch(JSON.stringify(diagnostic),/PRIVATE|fixture-key/);
      return true;
    });
  }
  // No retries or fallback to an unrelated agent after a permission failure.
  assert.equal(requests.length,3);
  for(const request of requests.slice(0,2)) {
    const body=JSON.parse(request.options.body);
    const message=body.message||body;
    assert.deepEqual(message.mentions,[{configurationId:'fixed-agent'}]);
    assert.deepEqual(message.context,{username:'testeur-polytechnique',timezone:'Europe/Paris',origin:'api'});
  }
});

test('HTTP failures and malformed responses stay bounded and sanitized',async()=>{
  for(const status of [401,403,404,429,500]) {
    const client=createDustClient(config,async()=>response({error:{message:'PRIVATE'}},status));
    await assert.rejects(()=>client.checkAgent(),{code:'dust_http_'+status});
  }
  const unknown=createDustClient(config,async()=>response({error:{type:'PRIVATE',message:'PRIVATE'}},400));
  await assert.rejects(()=>unknown.checkAgent(),{code:'dust_http_400_agent_unknown'});
  const network=createDustClient(config,async()=>{throw new Error('PRIVATE');});
  await assert.rejects(()=>network.checkAgent(),{code:'dust_unavailable'});
  const malformed=createDustClient(config,async()=>new Response('not JSON'));
  await assert.rejects(()=>malformed.checkAgent(),{code:'dust_unavailable'});
  const oversized=createDustClient(config,async()=>new Response('x'.repeat(4_000_001)));
  await assert.rejects(()=>oversized.checkAgent(),{code:'dust_too_large'});
});

test('Dust settings tolerate copy/paste whitespace but keep the origin allowlist',()=>{
  const env={LOCAL_DEVELOPMENT:'true',ADMIN_SECRET:'fixture-admin-secret-at-least-32-characters',DUST_ORIGIN:' https://eu.dust.tt/ ',DUST_API_KEY:' fixture-key\n',DUST_WORKSPACE_ID:' workspace ',DUST_AGENT_ID:' fixed-agent\n'};
  const actual=readConfig(env);
  for(const [key,value] of Object.entries(config)) assert.equal(actual[key],value);
  assert.equal(actual.ready,true);
  for(const key of ['DUST_API_KEY','DUST_WORKSPACE_ID','DUST_AGENT_ID']) assert.equal(readConfig({...env,[key]:' \n '}).ready,false);
  assert.throws(()=>readConfig({...env,DUST_ORIGIN:'https://eu.dust.tt.attacker.example/'}),/DUST_ORIGIN/);
  assert.throws(()=>readConfig({...env,DUST_AGENT_ID:'https://dust.tt/agent/example'}),/identifiant seul/);
});

test('current Dust message types still reach the answer polling loop',()=>{
  const messages=latestMessages({content:[[{type:'user_message',sId:'u1'}],[{type:'agent_message',sId:'a1',version:0},{type:'agent_message',sId:'a1',version:1,status:'succeeded'}]]});
  assert.deepEqual(messages.map(m=>m.type),['human','agent']);
  assert.equal(messages[1].status,'succeeded');
});
