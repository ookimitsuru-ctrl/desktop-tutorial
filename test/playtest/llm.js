// ============================================================
//  llm.js  ローカル LLM (llama.cpp の llama-server, OpenAI 互換 API) に聞く
//   schema を渡すと, その形の JSON だけを返すように文法で縛る
// ============================================================
async function chat(url, messages, opt) {
  opt = opt || {};
  const body = {
    messages,
    temperature: opt.temperature !== undefined ? opt.temperature : 0.7,
    max_tokens: opt.maxTokens || 220,
    cache_prompt: true
  };
  if (opt.schema) body.response_format = { type: 'json_schema', json_schema: { name: 'reply', schema: opt.schema } };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opt.timeoutMs || 180000);
  try {
    const r = await fetch(url + '/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ac.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
    const j = await r.json();
    return { text: j.choices[0].message.content, usage: j.usage, timings: j.timings };
  } finally { clearTimeout(timer); }
}

async function ask(url, system, prompt, schema) {
  const r = await chat(url, [{ role: 'system', content: system }, { role: 'user', content: prompt }], { schema });
  return JSON.parse(r.text);
}

module.exports = { chat, ask };
