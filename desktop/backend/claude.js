'use strict';
// Calls the Claude Messages API with the user's own key and validates the structured answer.
// Mirrors savemind/src/main/java/com/abdallah/savemind/ClaudeClient.java.

const SYSTEM = require('./prompt');

const PROMPT_VERSION = 'savemind-analysis-v4';
const API = 'https://api.anthropic.com/v1/messages';
const MODELS_API = 'https://api.anthropic.com/v1/models/';
const VERSION = '2023-06-01';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

const CONTENT_TYPES = ['article', 'video', 'tool', 'code_repository', 'course', 'opportunity', 'event',
  'social_post', 'document', 'product', 'news', 'podcast', 'other'];
const ACTIONS = ['Read Later', 'Watch Later', 'Listen Later', 'Try Tool', 'Apply', 'Register', 'Buy', 'Review', 'Reference', 'Follow Up'];

class ClaudeError extends Error {
  constructor(code, message, retryable) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

function supportsFallbacks(model) {
  return model === 'claude-opus-5-5' || model === 'claude-sonnet-5-5';
}

function schema() {
  const props = {
    title: { type: 'string' },
    summary: { type: 'string' },
    content_type: { type: 'string', enum: CONTENT_TYPES },
    topic: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    suggested_existing_collection_id: { type: 'integer' },
    suggested_new_collection_name: { type: 'string' },
    recommended_action: { type: 'string', enum: ACTIONS },
    confidence: { type: 'number' },
    content_sufficient: { type: 'boolean' },
    deadline: { type: 'string' },
    effort_days: { type: 'integer' },
    countries: { type: 'array', items: { type: 'string' } },
    prep_steps: { type: 'array', items: { type: 'string' } }
  };
  return { type: 'object', properties: props, required: Object.keys(props), additionalProperties: false };
}

function request(model, userContent, languageRule, withFallbacks) {
  const body = {
    model,
    max_tokens: 8000,
    system: SYSTEM + '\n\nLanguage: ' + languageRule,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: schema() } },
    messages: [{ role: 'user', content: userContent }]
  };
  if (withFallbacks && supportsFallbacks(model)) body.fallbacks = 'default';
  return body;
}

async function post(apiKey, body, fallbackBeta) {
  const headers = { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': VERSION };
  if (fallbackBeta) headers['anthropic-beta'] = FALLBACK_BETA;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  try {
    const res = await fetch(API, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
    return { code: res.status, body: await res.text() };
  } catch (e) {
    throw new ClaudeError('network', 'Could not reach Claude. Will retry when online.', true);
  } finally {
    clearTimeout(timer);
  }
}

function errorMessage(text) {
  try {
    const o = JSON.parse(text);
    if (o.error && o.error.message) return o.error.message;
  } catch (e) { /* not JSON */ }
  return (text || '').slice(0, 200);
}

function checkStatus(r) {
  if (r.code === 200) return;
  const msg = errorMessage(r.body);
  switch (r.code) {
    case 401: throw new ClaudeError('auth', 'Claude API key was rejected. Update it in Settings.', false);
    case 403: throw new ClaudeError('permission', 'This API key is not allowed to use the model: ' + msg, false);
    case 404: throw new ClaudeError('model', 'Model not available for this API key. Choose another in Settings.', false);
    case 413: throw new ClaudeError('too_large', 'The page was too large to analyze.', false);
    case 429: throw new ClaudeError('rate_limit', 'Claude is rate limiting requests. Will retry.', true);
    case 400:
      if (msg.toLowerCase().includes('credit')) throw new ClaudeError('billing', 'Your Claude account has no credit left: ' + msg, false);
      throw new ClaudeError('bad_request', 'Claude could not process this link: ' + msg, false);
    default:
      if (r.code >= 500) throw new ClaudeError('server', 'Claude is temporarily unavailable. Will retry.', true);
      throw new ClaudeError('http_' + r.code, 'Claude answered HTTP ' + r.code + ': ' + msg, false);
  }
}

function clip(s, max) {
  const t = (s == null ? '' : String(s)).trim();
  return t.length > max ? t.slice(0, max - 1).trim() + '…' : t;
}

function oneOf(value, allowed, fallback) {
  const v = String(value || '').toLowerCase();
  return allowed.find((a) => a.toLowerCase() === v) || fallback;
}

let REGIONS = null;
function isRegion(code) {
  try {
    if (!REGIONS) REGIONS = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
    return !!REGIONS.of(code);
  } catch (e) {
    return /^[A-Z]{2}$/.test(code);
  }
}

/** Upper-case ISO 3166 codes or ONLINE, without duplicates, at most 8. */
function validCountries(list) {
  const out = [];
  for (const c of Array.isArray(list) ? list : []) {
    if (out.length >= 8) break;
    const code = String(c || '').trim().toUpperCase();
    if ((code === 'ONLINE' || (/^[A-Z]{2}$/.test(code) && isRegion(code))) && !out.includes(code)) out.push(code);
  }
  return out;
}

function parse(raw, collections, parseDeadline) {
  let resp;
  try { resp = JSON.parse(raw); } catch (e) { throw new ClaudeError('schema', "Claude's answer could not be read. Retry to try again.", true); }
  if (resp.stop_reason === 'refusal') throw new ClaudeError('refusal', 'Claude declined to analyze this link.', false);
  if (resp.stop_reason === 'max_tokens') throw new ClaudeError('max_tokens', 'The analysis was cut off. Retry to try again.', false);
  const block = (resp.content || []).find((b) => b.type === 'text');
  if (!block) throw new ClaudeError('empty', 'Claude returned no analysis.', true);
  let o;
  try { o = JSON.parse(block.text.trim()); } catch (e) { throw new ClaudeError('schema', "Claude's answer could not be read. Retry to try again.", true); }

  const a = {};
  a.title = clip(o.title, 140);
  a.summary = clip(o.summary, 600);
  a.contentType = oneOf(o.content_type, CONTENT_TYPES, 'other');
  a.topic = clip(o.topic, 40);
  const seen = [];
  for (const t of Array.isArray(o.tags) ? o.tags : []) {
    if (seen.length >= 6) break;
    const tag = String(t || '').trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-');
    if (tag && tag.length <= 32 && !seen.includes(tag)) seen.push(tag);
  }
  a.tags = seen;
  const cid = Number(o.suggested_existing_collection_id) || 0;
  a.suggestedCollectionId = cid > 0 && collections.some((c) => c.id === cid) ? cid : 0;
  const newName = clip(o.suggested_new_collection_name, 40);
  const dup = collections.some((c) => String(c.name).trim().toLowerCase() === newName.toLowerCase());
  a.suggestedNewName = a.suggestedCollectionId > 0 || !newName || dup ? null : newName;
  a.action = oneOf(o.recommended_action, ACTIONS, 'Read Later');
  const conf = Number(o.confidence);
  a.confidence = Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.5;
  a.contentSufficient = o.content_sufficient !== false;
  const dl = String(o.deadline || '').trim();
  a.deadline = parseDeadline(dl) ? dl : null;
  const effort = Number(o.effort_days) || 0;
  a.effortDays = a.deadline ? Math.max(0, Math.min(30, Math.round(effort))) : 0;
  a.steps = [];
  if (a.deadline && Array.isArray(o.prep_steps)) {
    for (const st of o.prep_steps) {
      if (a.steps.length >= 6) break;
      const t = clip(st, 90);
      if (t) a.steps.push(t);
    }
  }
  a.countries = validCountries(o.countries);
  const u = resp.usage || {};
  a.inputTokens = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  a.outputTokens = u.output_tokens || 0;
  return a;
}

async function analyze(apiKey, model, userContent, languageRule, collections, parseDeadline) {
  const body = request(model, userContent, languageRule, true);
  const fallbacks = supportsFallbacks(model);
  let r = await post(apiKey, body, fallbacks);
  if (fallbacks && r.code === 400 && r.body.includes('fallback')) {
    delete body.fallbacks;
    r = await post(apiKey, body, false);
  }
  checkStatus(r);
  return parse(r.body, collections, parseDeadline);
}

async function testKey(apiKey, model) {
  try {
    const res = await fetch(MODELS_API + model, { headers: { 'x-api-key': apiKey, 'anthropic-version': VERSION } });
    const text = await res.text();
    if (res.status === 200) return 'ok';
    if (res.status === 401) return 'The API key was rejected. Check that it was copied completely.';
    if (res.status === 403) return 'This key does not have permission to use the API.';
    if (res.status === 404) return 'This key cannot access ' + model + '. Choose another model.';
    return 'Claude answered HTTP ' + res.status + ': ' + errorMessage(text);
  } catch (e) {
    return 'Could not reach Claude. Check your internet connection.';
  }
}

module.exports = { analyze, testKey, ClaudeError, PROMPT_VERSION, CONTENT_TYPES, ACTIONS, parse, request, validCountries };
