const temporaryStatuses = new Set([408, 429, 500, 502, 503, 504]);
const unavailable = 'Le serveur est momentanément indisponible. Réessaie dans un instant.';
const interrupted = 'La connexion a été interrompue. Ta demande a peut-être déjà été transmise ; elle n’a pas été renvoyée automatiquement.';
const error = (message, status = 0, retryable = false) => Object.assign(new Error(message), {status, retryable});

// A request is sent exactly once, including POSTs whose receipt is uncertain.
export async function api(path, data, {fetchImpl = globalThis.fetch, timeoutMs = 15000} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response, body;
    try {
      response = await fetchImpl(path, {
        method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin',
        headers: data === undefined ? {} : {'Content-Type': 'application/json'},
        body: data === undefined ? undefined : JSON.stringify(data), signal: controller.signal,
      });
      body = await response.text();
    } catch {
      throw error(data === undefined ? unavailable : interrupted, 0, true);
    }
    let json;
    try { json = JSON.parse(body); } catch { /* An upstream gateway can return HTML. */ }
    const valid = json !== null && typeof json === 'object' && !Array.isArray(json);
    if (!response.ok || !valid) {
      const retryable = temporaryStatuses.has(response.status) || (response.ok && !valid);
      const message = valid && typeof json.error === 'string' ? json.error
        : response.status === 401 ? 'Ta session a expiré. Reconnecte-toi.'
        : data !== undefined && retryable ? interrupted : unavailable;
      throw error(message, response.status, retryable);
    }
    return json;
  } finally { clearTimeout(timer); }
}

// Only repeat reads of the existing job: never create another Dust conversation.
export async function waitForJob(jobId, {
  request = api, isActive = () => true, now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), timeoutMs = 300000,
} = {}) {
  const deadline = now() + timeoutMs;
  let failures = 0;
  while (isActive() && now() < deadline) {
    await sleep(Math.min(failures ? Math.min(2000 * 2 ** failures, 8000) : 2000, deadline - now()));
    if (!isActive()) return null;
    if (now() >= deadline) break;
    let state;
    try {
      state = await request('/api/jobs/' + encodeURIComponent(jobId), undefined, {timeoutMs: Math.min(15000, deadline - now())});
    } catch (err) {
      if (!isActive()) return null;
      if (!err.retryable) throw err;
      if (++failures >= 6) throw error('Impossible de récupérer la réponse pour le moment. La connexion au serveur a été interrompue ; ta question n’a pas été renvoyée automatiquement.');
      continue;
    }
    if (!isActive()) return null;
    failures = 0;
    if (state.state === 'done' && typeof state.answer === 'string') return state;
    if (state.state === 'error') throw new Error(state.error || 'La recherche a été interrompue.');
    if (state.state !== 'pending') throw error('Le serveur a renvoyé une réponse inattendue. Ta question n’a pas été renvoyée automatiquement.');
  }
  if (!isActive()) return null;
  throw error('La recherche n’a pas abouti à temps. Elle n’a pas été relancée automatiquement.');
}
