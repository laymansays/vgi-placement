/* ═══════════════════════════════════════════════════
   ai_rewriter.js
   Loads WebLLM (Phi-3 Mini) in browser, parses
   raw resume text into structured JSON.
   No API key. Runs entirely on device.
═══════════════════════════════════════════════════ */

const WEBLLM_MODEL  = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
const WEBLLM_CDN    = 'https://esm.run/@mlc-ai/web-llm';

let _engine     = null;   // cached engine instance
let _engineBusy = false;
let _preloading = false;

// ── Silent background preload — call on student login ──
async function preloadWebLLM() {
  if (_engine || _preloading) return;   // already loaded or loading
  if (!isWebGPUSupported())   return;   // silently skip if unsupported
  _preloading = true;
  try {
    console.log('[AI] Background model preload started…');
    await loadWebLLM();
    console.log('[AI] Model ready.');
  } catch(e) {
    console.warn('[AI] Preload failed silently:', e.message);
  } finally {
    _preloading = false;
  }
}

// ── Check if WebGPU is available ──────────────────────
function isWebGPUSupported() {
  return typeof navigator !== 'undefined' && !!navigator.gpu;
}

// ── Load model (downloads ~2GB on first use, cached after) ──
async function loadWebLLM(onProgress) {
  if (_engine) return _engine;
  if (!isWebGPUSupported()) {
    throw new Error(
      'Your browser does not support WebGPU. Please use Chrome or Edge (latest version) on a laptop or desktop.'
    );
  }

  onProgress && onProgress('Loading AI model — this takes a few minutes on first use…', 0.0);

  // Dynamic import so it doesn't block page load
  const { CreateMLCEngine } = await import(WEBLLM_CDN);

  _engine = await CreateMLCEngine(WEBLLM_MODEL, {
    initProgressCallback: (report) => {
      onProgress && onProgress(report.text, report.progress || 0);
    },
  });

  return _engine;
}

// ── Build grade instruction based on user's choice ───
function gradeInstruction(mode) {
  if (mode === 'cgpa') {
    return `Convert all percentage grades to CGPA using: CGPA = Percentage ÷ 9.5 (Tumkur University formula). ` +
           `Example: 78% → ${(78/9.5).toFixed(2)} CGPA. Show as "X.XX CGPA".`;
  }
  return `Convert all CGPA grades to percentage using: Percentage = CGPA × 9.5 (Tumkur University formula). ` +
         `Example: 8.37 CGPA → ${(8.37*9.5).toFixed(1)}%. Show as "XX.X%".`;
}

// ── Call WebLLM with resume text ──────────────────────
async function rewriteWithAI(rawText, gradeMode, onProgress) {
  if (_engineBusy) throw new Error('AI is already processing. Please wait a moment and try again.');
  _engineBusy = true;

  try {
    const engine = await loadWebLLM(onProgress);

    onProgress && onProgress('AI is reading your resume…', 0.85);

    const systemPrompt = RESUME_TEMPLATE.systemPrompt +
      '\n\nGrade instruction: ' + gradeInstruction(gradeMode);

    // Trim aggressively — 1B model has smaller context window
    const trimmedText = rawText.length > 2500
      ? rawText.slice(0, 2500) + '\n[truncated]'
      : rawText;

    // Use streaming so we get tokens progressively — avoids silent hang
    const chunks     = [];
    let   tokenCount = 0;

    const streamPromise = (async () => {
      const stream = await engine.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: 'Parse this resume and return JSON:\n\n' + trimmedText },
        ],
        temperature: 0.05,
        max_tokens:  800,   // JSON for a resume fits in ~500-700 tokens
        stream:      true,
      });
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) { chunks.push(delta); tokenCount++; }
        // Yield to browser every 10 tokens so the UI actually repaints
        if (tokenCount % 10 === 0) {
          const pct = Math.min(0.95, 0.85 + tokenCount / 2000 * 0.1);
          onProgress && onProgress(`AI is writing your resume… (${tokenCount} tokens)`, pct);
          await new Promise(r => setTimeout(r, 0)); // release thread to browser
        }
      }
    })();

    // 90-second timeout — if model hangs, fail gracefully
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(
        'AI took too long to respond. Your device may not have enough memory. Please try again.'
      )), 90000)
    );

    await Promise.race([streamPromise, timeout]);

    onProgress && onProgress('Formatting output…', 0.97);

    const raw = chunks.join('').trim();

    // Strip markdown code fences if model adds them
    const jsonStr = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/,      '')
      .replace(/\s*```$/,      '')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch(e) {
      // Try to extract JSON object if model added extra text
      const match = jsonStr.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error('AI returned invalid JSON. Try uploading again.');
    }

    // Validate minimum structure
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('AI output was not a valid resume structure. Try again.');
    }

    // Ensure arrays exist
    ['education','experience','projects','skills','awards'].forEach(k => {
      if (!Array.isArray(parsed[k])) parsed[k] = [];
    });

    return parsed;

  } finally {
    _engineBusy = false;
  }
}
