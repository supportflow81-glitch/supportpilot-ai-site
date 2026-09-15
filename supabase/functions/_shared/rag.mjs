export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const DIMENSIONS = 1536;
export async function boundedBody(req, maximum) {
  const reader = req.body?.getReader();
  if (!reader) return '';
  let size = 0, text = ''; const decoder = new TextDecoder();
  try {
    for (;;) {
      const {value, done} = await reader.read();
      if (done) return text + decoder.decode();
      size += value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new RangeError('Request too large'); }
      text += decoder.decode(value, {stream:true});
    }
  } finally { reader.releaseLock(); }
}
export async function launchLimit(db, organization, action, subject) {
  const {data,error} = await db.rpc('consume_launch_limit', {
    p_organization_id:organization,p_action:action,p_subject:subject
  });
  if (error || typeof data?.allowed !== 'boolean') throw new Error('Limit service unavailable');
  return data;
}
export function chunkText(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('Add text before processing. URLs and files need extracted text.');
  if (raw.length > 200000) throw new Error('Source is too large. Split it into sources under 200,000 characters.');
  const text = raw.replace(/\r\n?/g, '\n').trim();
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + 2200, text.length);
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf('\n', end), text.lastIndexOf(' ', end));
      if (boundary > start + 1100) end = boundary;
      const code = text.charCodeAt(end - 1);
      if (code >= 0xD800 && code <= 0xDBFF) end--;
    }
    const content = text.slice(start, end).trim();
    if (content) chunks.push(content);
    if (end === text.length) break;
    start = end - 200;
    const code = text.charCodeAt(start);
    if (code >= 0xDC00 && code <= 0xDFFF) start++;
  }
  if (chunks.length > 128) throw new Error('Source has too many chunks.');
  return chunks;
}
export async function openaiRequest(path, body, apiKey, timeout = 25000) {
  if (!apiKey) throw new Error('AI unavailable');
  const response = await fetch('https://api.openai.com/v1/' + path, {
    method: 'POST', headers: {'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json'},
    body: JSON.stringify(body), signal: AbortSignal.timeout(timeout)
  });
  if (!response.ok) {
    let code='unknown';
    try { const body=await response.json(); const candidate=body.error?.code; if(typeof candidate==='string'&&/^[a-z_]{1,60}$/.test(candidate))code=candidate; } catch {}
    throw new Error('AI request failed (' + response.status + ':' + code + ')');
  }
  return await response.json();
}
export async function embedTexts(texts, apiKey) {
  const vectors = [];
  for (let offset = 0; offset < texts.length; offset += 16) {
    const input = texts.slice(offset, offset + 16);
    const result = await openaiRequest('embeddings', {
      model: EMBEDDING_MODEL, dimensions: DIMENSIONS, encoding_format: 'float', input
    }, apiKey, 15000);
    if (!Array.isArray(result.data) || result.data.length !== input.length) throw new Error('Invalid embeddings');
    const batch = result.data.slice().sort((a,b) => a.index-b.index);
    batch.forEach((item, index) => {
      if (item.index !== index || !Array.isArray(item.embedding) || item.embedding.length !== DIMENSIONS ||
          !item.embedding.every(Number.isFinite) || !item.embedding.some(v => v !== 0)) throw new Error('Invalid embeddings');
      vectors.push(item.embedding);
    });
  }
  return vectors;
}

