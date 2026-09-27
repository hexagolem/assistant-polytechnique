// The browser never receives the Dust API key, raw tool results or configuration.
export class DustError extends Error {
  constructor(code) { super(code); this.code = code; }
}

export function latestMessages(conversation) {
  if (!conversation || !Array.isArray(conversation.content)) throw new DustError('dust_format');
  return conversation.content.map(versions => {
    if (!Array.isArray(versions)) throw new DustError('dust_format');
    return [...versions].sort((a,b) => (b.version || 0) - (a.version || 0))[0];
  }).filter(Boolean);
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
        await response.body?.cancel();
        throw new DustError(`dust_http_${response.status}`);
      }
      const reader = response.body.getReader();
      const chunks = []; let length = 0;
      while (true) {
        const {done, value} = await reader.read(); if (done) break;
        length += value.length;
        if (length > 4_000_000) { await reader.cancel(); throw new DustError('dust_too_large'); }
        chunks.push(Buffer.from(value));
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (error) {
      if (error instanceof DustError) throw error;
      throw new DustError('dust_unavailable');
    }
  }
  const message = content => ({content, mentions: [{configurationId: config.agentId}]});
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
