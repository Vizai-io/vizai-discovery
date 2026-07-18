import {GoogleGenAI} from '@google/genai';
import type {z} from 'zod';

const DEFAULT_MODEL = 'gemini-2.5-flash';

function getApiKey(): string {
  const apiKey =
    process.env.GOOGLE_GENAI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      'Gemini is not configured. Set GOOGLE_GENAI_API_KEY or GOOGLE_API_KEY.',
    );
  }

  return apiKey;
}

function parseJsonResponse(text: string): unknown {
  const normalized = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  try {
    return JSON.parse(normalized);
  } catch {
    throw new Error('Gemini returned an invalid JSON response.');
  }
}

export async function generateStructuredOutput<T>({
  prompt,
  schema,
  model = process.env.GOOGLE_GENAI_MODEL || DEFAULT_MODEL,
}: {
  prompt: string;
  schema: z.ZodType<T>;
  model?: string;
}): Promise<T> {
  const client = new GoogleGenAI({apiKey: getApiKey()});
  const response = await client.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error('Gemini returned an empty response.');
  }

  return schema.parse(parseJsonResponse(text));
}
