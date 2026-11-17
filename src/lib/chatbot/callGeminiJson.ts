import axios from 'axios';

const MODELS = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-001',
    'gemini-2.5-flash',
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-flash-latest',
];

const VERSIONS = ['v1beta', 'v1'] as const;

export async function callGeminiText(
    prompt: string,
    apiKey: string,
    options?: { timeoutMs?: number; temperature?: number; maxOutputTokens?: number }
): Promise<string> {
    const timeoutMs = options?.timeoutMs ?? 45_000;
    const temperature = options?.temperature ?? 0.3;
    const maxOutputTokens = options?.maxOutputTokens ?? 8192;
    let lastErr: unknown = null;

    const payloads = [
        {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature,
                maxOutputTokens,
                responseMimeType: 'application/json',
            },
        },
        {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature,
                maxOutputTokens,
            },
        },
    ];

    for (const version of VERSIONS) {
        for (const model of MODELS) {
            for (const body of payloads) {
                const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
                try {
                    const res = await axios.post(url, body, { timeout: timeoutMs });

                    const text =
                        res.data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join('') ||
                        res.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
                        '';

                    if (String(text).trim()) {
                        console.log(`[callGeminiText] model=${model} (${version})`);
                        return String(text).trim();
                    }
                } catch (err) {
                    lastErr = err;
                    const status = (err as { response?: { status?: number; data?: { error?: { message?: string } } } })
                        ?.response?.status;
                    const msg =
                        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
                            ?.message || (err as Error)?.message;
                    console.warn(
                        `[callGeminiText] ${version}/${model} failed (${status || 'err'}): ${String(msg).slice(0, 120)}`
                    );
                }
            }
        }
    }

    throw lastErr || new Error('All Gemini models failed');
}

export function extractJsonFromModelText(raw: string): unknown {
    const trimmed = raw.trim();
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
    return JSON.parse(candidate);
}
