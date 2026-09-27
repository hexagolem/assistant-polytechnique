// The browser never receives the Dust API key, raw tool results or configuration.
export class DustError extends Error {
  constructor(code) { super(code); this.code = code; }
}

export function latestMessages(conversation) {
  if (!conversation || !Array.isArray(conversation.content)) throw new DustError('dust_format');
  return conversation.content.map(versions => {
    if (!Array.isArray(versions)) throw new DustError('dust_format');
    const message = [...versions].sort((a,b) => (b.version || 0) - (a.version || 0))[0];
    if (!message) return message;
    // Normalize the public API's current names to this application's internal
    // names; older example responses used "agent" and "human".
    const type = message.type === 'agent_message' ? 'agent'
      : message.type === 'user_message' ? 'human' : message.type;
    return {...message, type};
  }).filter(Boolean);
}

async function readJson(response, maximumBytes) {
  const reader = response.body?.getReader();
  if (!reader) throw new DustError('dust_format');
  const chunks = []; let length = 0;
  try {
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      length += value.length;
      if (length > maximumBytes) {
        await reader.cancel();
        throw new DustError('dust_too_large');
      }
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { reader.releaseLock(); }
}

// Only fixed diagnostic labels reach the admin audit: never log the response
// text, question, credentials, names or other data returned by Dust.
async function badRequestCode(response, stage) {
  const prefix = `dust_http_400_${stage}`;
  try {
    const data = await readJson(response, 16384);
    const allowedTypes = new Set([
      'invalid_request_error', 'agent_configuration_not_found',
      'invalid_agent_configuration', 'conversation_not_found',
      'workspace_not_found', 'space_not_found', 'permission_error'
    ]);
    const type = allowedTypes.has(data?.error?.type) ? data.error.type : 'unknown';
    const detail = typeof data?.error?.message === 'string' ? data.error.message : '';
    const fields = type === 'invalid_request_error'
      ? ['context', 'username', 'timezone', 'mentions', 'configurationId', 'visibility']
        .filter(field => new RegExp(`\\b${field}\\b`).test(detail))
      : [];
    return [prefix, type, ...fields].join('_');
  } catch { return prefix; }
}

export function createDustClient(config, fetcher = fetch) {
  const base = `${config.dustOrigin}/api/v1/w/${encodeURIComponent(config.workspaceId)}/assistant/conversations`;
  const id = value => {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new DustError('dust_format');
    return encodeURIComponent(value);
  };
  async function request(path, method = 'GET', body) {
    try {
      const response = await fetcher(base + path, {
        method, redirect: 'error', signal: AbortSignal.timeout(25000),
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      if (!response.ok) {
        if (response.status === 400) {
          const stage = path === '' ? 'create'
            : path.endsWith('/messages') ? 'post'
            : path.endsWith('/cancel') ? 'cancel' : 'get';
          throw new DustError(await badRequestCode(response, stage));
        }
        await response.body?.cancel();
        throw new DustError(`dust_http_${response.status}`);
      }
      return await readJson(response, 4_000_000);
    } catch (error) {
      if (error instanceof DustError) throw error;
      throw new DustError('dust_unavailable');
    }
  }
  const message = content => ({
    content,
    mentions: [{configurationId: config.agentId}],
    // Required by Dust's runtime request schema, even though its OpenAPI
    // example omits this object. Keep tester identity in our own audit only.
    context: {username: 'testeur-polytechnique', timezone: 'Europe/Paris', origin: 'api'}
  });
  return {
    async create(content) {
      const data = await request('', 'POST', {
        title: 'Test Assistant Polytechnique', message: message(content),
        blocking: false, skipToolsValidation: false
      });
      id(data.conversation?.sId);
      return data.conversation;
    },
    async get(conversationId) {
      const data = await request('/' + id(conversationId));
      if (!data.conversation) throw new DustError('dust_format');
      return data.conversation;
    },
    async post(conversationId, content) {
      await request('/' + id(conversationId) + '/messages', 'POST', message(content));
    },
    async cancel(conversationId, messageIds) {
      if (messageIds.length) await request('/' + id(conversationId) + '/cancel', 'POST', { messageIds });
    }
  };
}
