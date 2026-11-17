/**
 * Style-only rewriter for flow outbound text.
 * Never chooses the next node — only rephrases an already-approved message.
 */
import crypto from 'crypto';
import axios from 'axios';

export type HumanizeTone = 'warm' | 'formal' | 'cercano';

export type HumanizeOutboundParams = {
    approvedText: string;
    tone?: HumanizeTone | string;
    botId?: string;
    nodeId?: string | null;
    contactName?: string | null;
    lastUserText?: string | null;
    recentTurns?: Array<{ sender?: string; text?: string }>;
    timeoutMs?: number;
    geminiApiKey?: string | null;
    openaiApiKey?: string | null;
};

const DEFAULT_TIMEOUT_MS = 1800;
const cache = new Map<string, string>();
const CACHE_MAX = 200;

function cacheKey(params: HumanizeOutboundParams): string {
    const base = [
        params.botId || '',
        params.nodeId || '',
        params.tone || 'warm',
        params.approvedText,
        params.contactName || '',
    ].join('|');
    return crypto.createHash('sha1').update(base).digest('hex');
}

function remember(key: string, value: string) {
    if (cache.size >= CACHE_MAX) {
        const first = cache.keys().next().value;
        if (first) cache.delete(first);
    }
    cache.set(key, value);
}

function buildPrompt(params: HumanizeOutboundParams): string {
    const tone = params.tone || 'warm';
    const toneHint =
        tone === 'formal'
            ? 'Tono formal y profesional, sin ser frío.'
            : tone === 'cercano'
              ? 'Tono cercano y conversacional, como un asesor amable por WhatsApp.'
              : 'Tono cálido y humano, natural para WhatsApp.';

    const recent = (params.recentTurns || [])
        .slice(-4)
        .map((m) => `${m.sender === 'user' || m.sender === 'contact' ? 'Usuario' : 'Agente'}: ${String(m.text || '').slice(0, 160)}`)
        .join('\n');

    return `Eres un reescritor de tono. NO eres un agente libre.

Tu ÚNICA tarea: reformular el MENSAJE APROBADO para que suene más humano, manteniendo exactamente la misma intención, datos y pregunta.

Reglas estrictas:
- Conserva hechos, precios, nombres, ciudades, enlaces y variables ya resueltas.
- No añadas preguntas nuevas, ofertas, tips ni CTAs extras.
- No respondas al usuario fuera de este mensaje; no inventes respuestas a temas ajenos.
- Longitud similar (±30%).
- Mismo idioma que el mensaje aprobado.
- Devuelve SOLO el texto final, sin comillas ni explicación.

Estilo: ${toneHint}
${params.contactName ? `Nombre del contacto (si ayuda a saludar, úsalo con naturalidad solo si el original ya saluda o pide nombre): ${params.contactName}` : ''}
${params.lastUserText ? `Último mensaje del usuario (contexto breve, no lo contestes aparte): ${String(params.lastUserText).slice(0, 200)}` : ''}
${recent ? `Turnos recientes:\n${recent}` : ''}

MENSAJE APROBADO:
${params.approvedText}`;
}

async function callGemini(prompt: string, apiKey: string, timeoutMs: number): Promise<string> {
    const models = [
        'gemini-2.0-flash',
        'gemini-2.0-flash-001',
        'gemini-2.5-flash',
        'gemini-1.5-flash',
        'gemini-1.5-flash-latest',
        'gemini-flash-latest',
    ];
    const versions = ['v1beta', 'v1'] as const;
    let lastErr: any = null;

    for (const version of versions) {
        for (const model of models) {
            const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
            try {
                const res = await axios.post(
                    url,
                    {
                        // Gemini accepts parts-only contents; including role can 400 on some models.
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            temperature: 0.4,
                            maxOutputTokens: 512,
                        },
                    },
                    { timeout: timeoutMs }
                );
                const text =
                    res.data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ||
                    res.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
                    '';
                if (String(text).trim()) {
                    console.log(`[humanizeOutbound] model=${model} (${version})`);
                    return String(text).trim();
                }
            } catch (err: any) {
                lastErr = err;
                const status = err?.response?.status;
                const msg = err?.response?.data?.error?.message || err?.message;
                console.warn(`[humanizeOutbound] ${version}/${model} failed (${status || 'err'}): ${String(msg).slice(0, 120)}`);
            }
        }
    }

    throw lastErr || new Error('All Gemini models failed');
}

function sanitizeResult(original: string, candidate: string): string | null {
    const cleaned = candidate
        .replace(/^["'«»]+|["'«»]+$/g, '')
        .replace(/^Texto final:\s*/i, '')
        .trim();
    if (!cleaned) return null;
    if (cleaned.length > original.length * 2.2 + 40) return null;
    // Reject if model clearly went off-script with meta commentary
    if (/^(claro|por supuesto|como ia|no puedo)/i.test(cleaned) && cleaned.length > original.length * 1.5) {
        return null;
    }
    return cleaned;
}

async function callOpenAI(prompt: string, apiKey: string, timeoutMs: number): Promise<string> {
    const res = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
            model: 'gpt-4o-mini',
            temperature: 0.4,
            max_tokens: 400,
            messages: [
                {
                    role: 'system',
                    content:
                        'Eres un reescritor de tono. Devuelve SOLO el texto reformulado. No inventes contenido ni tomas decisiones de flujo.',
                },
                { role: 'user', content: prompt },
            ],
        },
        {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: timeoutMs,
        }
    );
    return String(res.data?.choices?.[0]?.message?.content || '').trim();
}

function resolveGeminiKey(override?: string | null): string | undefined {
    const fromEnv = (process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS || '')
        .split(',')
        .map((k) => k.trim())
        .find((k) => k.length > 0);
    const key = (override || fromEnv || '').trim();
    return key || undefined;
}

function resolveOpenAIKey(override?: string | null): string | undefined {
    const key = (override || process.env.OPENAI_API_KEY || '').trim();
    return key || undefined;
}

/**
 * Returns a humanized version of approvedText, or the original on any failure/timeout.
 */
export async function humanizeOutboundText(params: HumanizeOutboundParams): Promise<string> {
    const approved = String(params.approvedText || '').trim();
    if (!approved) return params.approvedText || '';

    const key = cacheKey(params);
    const hit = cache.get(key);
    if (hit) return hit;

    const geminiKey = resolveGeminiKey(params.geminiApiKey);
    const openaiKey = resolveOpenAIKey(params.openaiApiKey);

    if (!geminiKey && !openaiKey) {
        console.warn('[humanizeOutbound] Missing GEMINI_API_KEY/OPENAI_API_KEY — using original text');
        return params.approvedText;
    }

    const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const prompt = buildPrompt(params);

    try {
        let raw = '';
        if (geminiKey) {
            try {
                raw = await callGemini(prompt, geminiKey, timeoutMs);
            } catch (geminiErr: any) {
                console.warn(
                    `[humanizeOutbound] Gemini failed, trying OpenAI if available: ${geminiErr?.response?.status || geminiErr?.message || geminiErr}`
                );
            }
        }
        if (!raw && openaiKey) {
            raw = await callOpenAI(prompt, openaiKey, timeoutMs);
            console.log('[humanizeOutbound] model=openai/gpt-4o-mini');
        }

        const safe = sanitizeResult(approved, raw);
        if (!safe) {
            console.warn('[humanizeOutbound] Rejected or empty model output — fallback to original');
            return params.approvedText;
        }
        console.log(
            `[humanizeOutbound] ok bot=${params.botId || '-'} node=${params.nodeId || '-'} ` +
                `orig=${approved.slice(0, 40)}… → ${safe.slice(0, 40)}…`
        );
        remember(key, safe);
        return safe;
    } catch (err: any) {
        console.warn(
            `[humanizeOutbound] fallback to original: ${err?.code || err?.message || err}`
        );
        return params.approvedText;
    }
}

export function shouldHumanizeOutbound(options: {
    humanizeToneEnabled?: boolean;
    content?: string;
    skipHumanize?: boolean;
    type?: string;
}): boolean {
    if (!options.humanizeToneEnabled) return false;
    if (options.skipHumanize) return false;
    const content = String(options.content || '').trim();
    if (!content) return false;
    const type = options.type;
    if (!type || type === 'text' || type === 'quick_reply' || type === 'list') return true;
    // captions for media still pass type=image etc. with content — allow those
    if (['image', 'video', 'audio', 'document'].includes(String(type))) return true;
    return false;
}
