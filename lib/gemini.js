'use strict';
/* Klien Gemini tanpa library.
   Mendukung dua gaya API:
   - Interactions API  : POST {base}/interactions            (baru, default sejak 2026)
   - generateContent   : POST {base}/models/{m}:generateContent (lama/legacy)
   Mode "auto" mencoba Interactions dulu, lalu otomatis beralih bila endpoint tidak tersedia. */
const cfg = require('./config');

let style = cfg.GEMINI_API_STYLE === 'generatecontent' ? 'generatecontent' : cfg.GEMINI_API_STYLE === 'interactions' ? 'interactions' : 'auto';
let activeModel = cfg.GEMINI_MODEL;

class GeminiError extends Error { constructor(msg, status, body) { super(msg); this.status = status; this.body = body; } }

async function post(url, body) {
  const lim = cfg.IS_VERCEL ? 25000 : 60000;   // Vercel memutus fungsi setelah 60 detik
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), lim);
  try {
    const r = await fetch(url, { method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.GEMINI_API_KEY }, body: JSON.stringify(body) });
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (e) {}
    if (!r.ok) throw new GeminiError((json && json.error && json.error.message) || text.slice(0, 300) || r.statusText, r.status, json);
    return json || {};
  } catch (e) {
    if (e.name === 'AbortError') throw new GeminiError(`Gemini tidak merespons dalam ${lim / 1000} detik`, 504);
    throw e;
  } finally { clearTimeout(to); }
}

/* ---------- Interactions API ---------- */
function toolsInteractions(tools) { return tools.map(t => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters })); }
function parseInteraction(j) {
  const steps = Array.isArray(j.steps) ? j.steps : Array.isArray(j.outputs) ? j.outputs : [];
  let lastInput = -1;
  steps.forEach((s, i) => { if (s && (s.type === 'user_input' || s.type === 'function_result')) lastInput = i; });
  const fresh = steps.slice(lastInput + 1);
  const calls = fresh.filter(s => s && s.type === 'function_call').map(s => ({ id: s.id || s.call_id, name: s.name, args: s.arguments || s.args || {} }));
  let text = '';
  for (const s of fresh) {
    if (s && s.type === 'model_output' && Array.isArray(s.content)) text += s.content.filter(c => c.type === 'text').map(c => c.text).join('');
    else if (s && s.type === 'text' && s.text) text += s.text;
  }
  if (!text && typeof j.output_text === 'string') text = j.output_text;
  return { id: j.id, text: text.trim(), calls, status: j.status };
}
async function runInteractions({ system, input, tools, execTool, maxRounds = 4 }) {
  const url = `${cfg.GEMINI_API_BASE}/interactions`;
  const base = { model: activeModel, system_instruction: system, store: true };
  if (tools && tools.length) base.tools = toolsInteractions(tools);
  let res = parseInteraction(await post(url, Object.assign({}, base, { input })));
  const actions = [];
  for (let round = 0; res.calls.length && round < maxRounds; round++) {
    const results = [];
    for (const c of res.calls) {
      const out = await execTool(c.name, c.args || {}); actions.push({ name: c.name, args: c.args, result: out });
      results.push({ type: 'function_result', name: c.name, call_id: c.id, result: [{ type: 'text', text: JSON.stringify(out) }] });
    }
    res = parseInteraction(await post(url, Object.assign({}, base, { previous_interaction_id: res.id, input: results })));
  }
  return { text: res.text, actions };
}

/* ---------- generateContent (legacy) ---------- */
async function runGenerate({ system, input, tools, execTool, maxRounds = 4 }) {
  const url = `${cfg.GEMINI_API_BASE}/models/${encodeURIComponent(activeModel)}:generateContent`;
  const contents = [{ role: 'user', parts: [{ text: input }] }];
  const body = { systemInstruction: { parts: [{ text: system }] }, contents };
  if (tools && tools.length) body.tools = [{ functionDeclarations: tools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters })) }];
  const actions = [];
  for (let round = 0; round <= maxRounds; round++) {
    const j = await post(url, body);
    const cand = j.candidates && j.candidates[0];
    if (!cand || !cand.content) { const why = (j.promptFeedback && j.promptFeedback.blockReason) || (cand && cand.finishReason) || 'kosong'; return { text: `(Gemini tidak memberi jawaban: ${why})`, actions }; }
    const parts = cand.content.parts || [];
    const calls = parts.filter(p => p.functionCall);
    if (!calls.length || round === maxRounds) return { text: parts.filter(p => p.text && !p.thought).map(p => p.text).join('').trim(), actions };
    contents.push(cand.content);
    const respParts = [];
    for (const p of calls) {
      const out = await execTool(p.functionCall.name, p.functionCall.args || {}); actions.push({ name: p.functionCall.name, args: p.functionCall.args, result: out });
      respParts.push({ functionResponse: { name: p.functionCall.name, response: { result: out } } });
    }
    contents.push({ role: 'user', parts: respParts });
  }
  return { text: '', actions };
}

/* ---------- pintu masuk ---------- */
async function run(opts) {
  if (!cfg.GEMINI_API_KEY) throw new GeminiError('GEMINI_API_KEY belum diisi di file .env', 401);
  const attempt = async () => {
    if (style === 'generatecontent') return runGenerate(opts);
    try { return await runInteractions(opts); }
    catch (e) {
      if (style === 'auto' && (e.status === 404 || e.status === 405 || (e.status === 400 && /interaction|unknown name|invalid json/i.test(e.message)))) {
        console.warn('[gemini] Interactions API tidak tersedia (' + e.status + '), beralih ke generateContent');
        style = 'generatecontent'; return runGenerate(opts);
      }
      throw e;
    }
  };
  try { return await attempt(); }
  catch (e) {
    if ((e.status === 404 || (e.status === 400 && /model/i.test(e.message))) && activeModel !== cfg.GEMINI_FALLBACK_MODEL && cfg.GEMINI_FALLBACK_MODEL) {
      console.warn(`[gemini] model ${activeModel} gagal (${e.message}); mencoba ${cfg.GEMINI_FALLBACK_MODEL}`);
      activeModel = cfg.GEMINI_FALLBACK_MODEL; return attempt();
    }
    throw e;
  }
}
async function simple(system, input) { return (await run({ system, input, tools: [], execTool: async () => ({}) })).text; }
function info() { return { enabled: !!cfg.GEMINI_API_KEY, model: activeModel, style }; }
module.exports = { run, simple, info, GeminiError };
