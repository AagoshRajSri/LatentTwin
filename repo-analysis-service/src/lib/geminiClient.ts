import fetch from 'node-fetch';

export const FLASH_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
export const PRO_MODEL = process.env.GEMINI_PRO_MODEL || 'gemini-3.6-pro';

export async function callHaiku(prompt: string, systemPrompt?: string): Promise<string> {
  return callGemini(prompt, systemPrompt, FLASH_MODEL);
}

export async function callSonnet(prompt: string, systemPrompt?: string): Promise<string> {
  return callGemini(prompt, systemPrompt, FLASH_MODEL); // Fast & capable for structured diffs
}

export async function callGemini(
  prompt: string,
  systemPrompt?: string,
  model: string = FLASH_MODEL
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured in .env');
  }

  const sys = systemPrompt ?? 'Respond with JSON only, no prose, no markdown fences.';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  let res: any;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: sys }],
        },
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      }),
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API Error (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Empty response returned by Gemini API');
  }

  return text;
}
