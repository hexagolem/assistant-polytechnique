import test from 'node:test';
import assert from 'node:assert/strict';
import {api,waitForJob} from '../public/api.js';

const json = (data, status = 200) => Response.json(data, {status});
const html = (status = 503) => new Response('<!DOCTYPE html><h1>Gateway unavailable</h1>', {status, headers:{'Content-Type':'text/html'}});
function fixture(responses) {
  const calls = []; let clock = 0;
  const request = (path, data, options) => api(path, data, {...options, fetchImpl: async (url, init) => {
    calls.push({url, method:init.method});
    assert.ok(responses.length, 'Unexpected extra request');
    const result = responses.shift(); if (result instanceof Error) throw result; return result;
  }});
  return {calls, request, now:()=>clock, sleep:async ms=>{clock+=ms;}};
}

test('HTML 502/503 and network failure during polling recover the same job, with one POST', async () => {
  const f = fixture([json({jobId:'job-1'},202), html(502), html(), new TypeError('offline'), json({state:'pending'}), json({state:'done',answer:'**Réponse**'})]);
  const job = await f.request('/api/chat',{message:'Test'});
  assert.equal((await waitForJob(job.jobId,f)).answer,'**Réponse**');
  assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
  assert.ok(f.calls.slice(1).every(c=>c.method==='GET' && c.url==='/api/jobs/job-1'));
});
test('HTML or invalid JSON in a successful response is recoverable', async () => {
  const f = fixture([html(200), new Response('{broken'), json({state:'done',answer:'OK'})]);
  assert.equal((await waitForJob('job',f)).answer,'OK');
});
test('a prolonged gateway failure stops after six reads with a readable error', async () => {
  const f = fixture(Array.from({length:6},()=>html()));
  await assert.rejects(waitForJob('job',f),err=>!err.message.includes('DOCTYPE') && /pas été renvoyée/.test(err.message));
  assert.equal(f.calls.length,6);
});
test('authentication, permissions, missing and expired jobs are never retried', async () => {
  for (const status of [401,403,404,410]) {
    const f=fixture([json({error:'Erreur contrôlée'},status)]);
    await assert.rejects(waitForJob('job',f),err=>err.status===status && err.message==='Erreur contrôlée');
    assert.equal(f.calls.length,1);
  }
});
test('a server restart error is preserved and does not relaunch Dust', async () => {
  const message='Le service a redémarré pendant la recherche. Cette demande n’a pas été relancée.';
  const f=fixture([html(),json({state:'error',error:message})]);
  await assert.rejects(waitForJob('job',f),{message});
  assert.ok(f.calls.every(c=>c.method==='GET'));
});
test('uncertain POST delivery is never retried', async () => {
  for (const response of [html(), new TypeError('offline')]) {
    const f=fixture([response]);
    await assert.rejects(f.request('/api/chat',{message:'Test'}),/peut-être déjà été transmise/);
    assert.equal(f.calls.length,1);
  }
});
test('pending jobs stop at the overall deadline, without another request', async () => {
  const f=fixture([json({state:'pending'}),json({state:'pending'})]);
  await assert.rejects(waitForJob('job',{...f,timeoutMs:5000}),/pas abouti à temps/);
  assert.equal(f.now(),5000); assert.equal(f.calls.length,2);
});
test('leaving a conversation cancels polling and ignores a late answer', async () => {
  const f=fixture([]);
  assert.equal(await waitForJob('job',{...f,isActive:()=>false}),null);
  assert.equal(f.calls.length,0);
  let active=true;
  assert.equal(await waitForJob('job',{...f,isActive:()=>active,request:async()=>{active=false;return {state:'done',answer:'Stale'};}}),null);
});
test('fetch timeout aborts a stalled request and exposes a recoverable error', async () => {
  let calls=0;
  await assert.rejects(api('/api/jobs/job',undefined,{timeoutMs:10,fetchImpl:async (_url,{signal})=>{
    calls++;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));
  }}),err=>err.retryable===true && !err.message.includes('aborted'));
  assert.equal(calls,1);
});
test('invalid job payloads fail clearly instead of displaying an empty answer', async () => {
  const f=fixture([json({state:'done'})]);
  await assert.rejects(waitForJob('job',f),/réponse inattendue/);
});
