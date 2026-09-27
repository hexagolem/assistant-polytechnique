// The browser never receives the Dust API key, raw tool results or configuration.
export class DustError extends Error {
  constructor(code) { super(code); this.code = code; }
}

// Fixed, actionable guidance only: never forward Dust's raw error message.
export function dustDiagnostic(code) {
  const accessSteps = [
    'Dans Dust, vérifie que l’agent est actif et partagé dans un espace accessible à la clé API utilisée par le site.',
    'Dans Dust → administration des clés API, autorise cette clé à accéder aux espaces nécessaires à cet agent.',
    'Dans Render → Environment, vérifie DUST_AGENT_ID (le sId de l’agent, pas son nom ni son id numérique), DUST_WORKSPACE_ID et DUST_ORIGIN. La clé et l’agent doivent appartenir au même workspace et à la même région.',
    'Après toute modification des variables Render, redéploie le service puis relance cette vérification.'
  ];
  const type = code.replace(/^dust_http_400_(?:create|post|get|cancel|agent)_/, '');
  if (type === 'agent_inaccessible' || code === 'dust_agent_forbidden') return {
    message: 'Dust refuse l’accès à l’agent : il est désactivé ou inaccessible à cette clé API.', steps: accessSteps
  };
  const disabled = {
    archived: 'L’agent Dust est archivé. Configure le sId d’un agent actif.',
    disabled_by_admin: 'L’agent Dust a été désactivé par un administrateur. Réactive-le dans Dust.',
    disabled_missing_datasource: 'L’agent Dust est désactivé car une source manque. Corrige ses sources dans Dust.',
    disabled_free_workspace: 'L’agent Dust est désactivé sur ce workspace. Vérifie son abonnement et son statut dans Dust.',
    pending: 'L’agent Dust est en attente et ne peut pas encore répondre. Termine sa configuration dans Dust.'
  };
  if (disabled[code.replace(/^dust_agent_/, '')]) return {
    message: disabled[code.replace(/^dust_agent_/, '')], steps: accessSteps
  };
  if (code === 'dust_not_configured') return {
    message: 'La configuration Dust est incomplète.',
    steps: ['Renseigne DUST_API_KEY, DUST_WORKSPACE_ID et DUST_AGENT_ID dans Render → Environment, puis redéploie.']
  };
  if (code === 'dust_http_401' || type === 'invalid_api_key_error') return {
    message: 'Dust refuse la clé API.',
    steps: ['Remplace DUST_API_KEY dans Render par une clé valide du workspace et de la région choisis, puis redéploie.']
  };
  if (code === 'dust_http_403' || type === 'workspace_auth_error' || type === 'permission_error') return {
    message: 'La clé API n’a pas les droits nécessaires dans Dust.', steps: accessSteps
  };
  if (code === 'dust_http_404' || type === 'agent_configuration_not_found' || type === 'workspace_not_found') return {
    message: 'L’agent ou le workspace est introuvable, ou inaccessible à cette clé.', steps: accessSteps
  };
  if (code === 'dust_http_429') return {
    message: 'Dust limite temporairement les appels API.', steps: ['Attends un peu avant de relancer la vérification.']
  };
  return {
    message: 'La vérification Dust a échoué.',
    steps: ['Vérifie la disponibilité de Dust et les variables de connexion dans Render. Si le problème persiste, communique le code de diagnostic à l’organisateur.']
  };
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
    // Public Dust API error types, including agent/model access failures.
    const allowedTypes = new Set([
      'action_api_error', 'action_failed', 'action_unknown_error',
      'agent_configuration_not_found', 'agent_inaccessible', 'agent_message_error',
      'app_auth_error', 'app_not_found', 'assistant_saving_error',
      'chat_message_not_found', 'connector_credentials_error', 'connector_not_found_error',
      'connector_oauth_target_mismatch', 'connector_provider_not_supported', 'connector_update_error',
      'connector_update_unauthorized', 'content_too_large', 'conversation_access_restricted',
      'conversation_not_found', 'credits_exhausted', 'data_source_auth_error',
      'data_source_document_not_found', 'data_source_error', 'data_source_not_found',
      'data_source_not_managed', 'data_source_quota_error', 'data_source_view_not_found',
      'dataset_not_found', 'dust_app_secret_not_found', 'expired_oauth_token_error',
      'feature_flag_already_exists', 'feature_flag_not_found', 'file_not_found',
      'file_too_large', 'file_type_not_supported', 'global_agent_error',
      'group_not_found', 'internal_server_error', 'invalid_agent_configuration',
      'invalid_api_key_error', 'invalid_oauth_token_error', 'invalid_pagination_parameters',
      'invalid_request_error', 'invalid_rows_request_error', 'invitation_already_sent_recently',
      'invitation_not_found', 'key_not_found', 'malformed_authorization_header_error',
      'membership_not_found', 'message_not_found', 'method_not_supported_error',
      'missing_authorization_header_error', 'model_disabled', 'no_seat',
      'not_authenticated', 'permission_error', 'personal_workspace_not_found',
      'plan_limit_error', 'plan_message_limit_exceeded', 'plugin_execution_failed',
      'plugin_not_found', 'provider_auth_error', 'provider_not_found',
      'rate_limit_error', 'run_error', 'run_not_found',
      'skill_not_found', 'space_already_exists', 'space_not_found',
      'stripe_invalid_product_id_error', 'subscription_not_found', 'subscription_payment_failed',
      'subscription_state_invalid', 'table_not_found', 'template_not_found',
      'transcripts_configuration_already_exists', 'transcripts_configuration_default_not_allowed', 'transcripts_configuration_not_found',
      'unexpected_action_response', 'unexpected_error_format', 'unexpected_network_error',
      'unexpected_response_format', 'unprocessable_entity', 'user_cap_reached',
      'user_not_found', 'workspace_auth_error', 'workspace_can_use_product_required_error',
      'workspace_not_found', 'workspace_user_not_found'
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
  const base = `${config.dustOrigin}/api/v1/w/${encodeURIComponent(config.workspaceId)}/assistant`;
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
          const stage = path.startsWith('/agent_configurations/') ? 'agent'
            : path === '/conversations' ? 'create'
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
    async checkAgent() {
      // Read-only: does not create a conversation or run the model.
      const data = await request('/agent_configurations/' + id(config.agentId) + '?variant=light');
      const agent = data?.agentConfiguration;
      if (!agent || agent.sId !== config.agentId) throw new DustError('dust_format');
      const disabled = ['archived', 'disabled_by_admin', 'disabled_missing_datasource', 'disabled_free_workspace', 'pending'];
      if (disabled.includes(agent.status)) throw new DustError('dust_agent_' + agent.status);
      if (!['active', 'draft'].includes(agent.status)) throw new DustError('dust_format');
      if (agent.canRead === false) throw new DustError('dust_agent_forbidden');
      // Do not return the agent's instructions, sources or tools to the browser.
      return {status: agent.status};
    },
    async create(content) {
      const data = await request('/conversations', 'POST', {
        title: 'Test Assistant Polytechnique', message: message(content),
        blocking: false, skipToolsValidation: false
      });
      id(data.conversation?.sId);
      return data.conversation;
    },
    async get(conversationId) {
      const data = await request('/conversations/' + id(conversationId));
      if (!data.conversation) throw new DustError('dust_format');
      return data.conversation;
    },
    async post(conversationId, content) {
      await request('/conversations/' + id(conversationId) + '/messages', 'POST', message(content));
    },
    async cancel(conversationId, messageIds) {
      if (messageIds.length) await request('/conversations/' + id(conversationId) + '/cancel', 'POST', { messageIds });
    }
  };
}
