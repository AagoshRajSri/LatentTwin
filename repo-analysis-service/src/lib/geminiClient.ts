import fetch from "node-fetch";

export const FLASH_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
export const PRO_MODEL = process.env.GEMINI_PRO_MODEL || "gemini-3.6-pro";

export async function callHaiku(
  prompt: string,
  systemPrompt?: string,
): Promise<string> {
  return callGemini(prompt, systemPrompt, FLASH_MODEL);
}

export async function callSonnet(
  prompt: string,
  systemPrompt?: string,
): Promise<string> {
  // LLM7 handles focused diagnosis and repair; Gemini remains the broad scanner.
  return process.env.LLM7_API_KEY
    ? callLLM7(prompt, systemPrompt)
    : callGemini(prompt, systemPrompt, PRO_MODEL);
}

export async function callGemini(
  prompt: string,
  systemPrompt?: string,
  model: string = FLASH_MODEL,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return callLLM7(prompt, systemPrompt);
  }

  const sys =
    systemPrompt ?? "Respond with JSON only, no prose, no markdown fences.";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  let res: any;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Gemini API Error (${res.status})`);
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
      throw new Error("Empty response returned by Gemini API");
    }

    return text;
  } catch (err) {
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function callLLM7(
  prompt: string,
  systemPrompt?: string,
): Promise<string> {
  const llm7Key = process.env.LLM7_API_KEY;
  if (!llm7Key) {
    throw new Error(
      "LLM7_API_KEY is required for focused diagnosis and repair",
    );
  }

  const url = "https://api.llm7.io/v1/chat/completions";
  const messages = [];

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${llm7Key}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "default",
        messages,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`LLM7 API Error (${res.status}): ${errText}`);
    }

    const data = (await res.json()) as any;
    const text = data?.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error("Empty response from LLM7 API");
    }
    return text;
  } finally {
    clearTimeout(timeout);
  }
}
