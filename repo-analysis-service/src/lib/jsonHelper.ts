/**
 * jsonHelper.ts
 *
 * Reliably extracts and parses JSON from LLM responses.
 * LLMs occasionally wrap their JSON output in markdown fences (```json ... ```)
 * or prepend/append prose. A bare JSON.parse() will throw in those cases.
 * These helpers strip fences and extract the outermost JSON before parsing.
 */

export function cleanJsonText(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';

  let text = raw.trim();

  // Strip ```json ... ``` or ``` ... ``` wrappers
  const codeBlockMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim();
  } else {
    // Embedded code block inside prose
    const embeddedMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/i);
    if (embeddedMatch) {
      text = embeddedMatch[1].trim();
    }
  }

  // Extract outermost JSON array or object in case there is leading/trailing prose
  const firstBracket = text.indexOf('[');
  const firstBrace = text.indexOf('{');

  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    const lastBracket = text.lastIndexOf(']');
    if (lastBracket > firstBracket) {
      text = text.substring(firstBracket, lastBracket + 1);
    }
  } else if (firstBrace !== -1) {
    const lastBrace = text.lastIndexOf('}');
    if (lastBrace > firstBrace) {
      text = text.substring(firstBrace, lastBrace + 1);
    }
  }

  return text;
}

/**
 * Parse JSON from an LLM response, gracefully handling markdown fences and prose.
 *
 * @param raw - Raw string returned by the LLM
 * @param fallback - Optional fallback value; if provided, returned on parse failure instead of throwing
 */
export function cleanAndParseJson<T = unknown>(raw: string, fallback?: T): T {
  const cleaned = cleanJsonText(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    if (fallback !== undefined) {
      return fallback;
    }
    const preview = raw.slice(0, 300).replace(/\n/g, '\\n');
    throw new Error(
      `Failed to parse JSON from LLM response: ${(err as Error).message}\nRaw preview: ${preview}`,
    );
  }
}
