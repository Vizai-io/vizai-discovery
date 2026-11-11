/**
 * @fileOverview Gemini Perception Adapter.
 *
 * Asks Gemini to describe a business, then normalizes the response
 * into the ModelResponse/ModelPerception structure.
 *
 * Uses direct REST API calls to the Gemini API for simplicity and
 * independence from the Genkit flow infrastructure.
 */

import type { PerceptionAdapter, ModelResponse, ModelPerception, GroundedAnswer } from "@/lib/types/perception-scan";

/** Parse a JSON block from a model response, handling markdown fences */
function extractJSON(text: string): any {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) {
    try { return JSON.parse(match[1].trim()); } catch {}
  }
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try { return JSON.parse(braceMatch[0]); } catch {}
  }
  return null;
}

function emptyPerception(): ModelPerception {
  return {
    business_description: "",
    services_mentioned: [],
    industries_mentioned: [],
    locations_mentioned: [],
    customer_types_mentioned: [],
    differentiators_mentioned: [],
    business_type: "",
    additional_claims: [],
  };
}

export class GeminiPerceptionAdapter implements PerceptionAdapter {
  model_id = "google:gemini-2.5-flash";
  provider = "Google";
  display_name = "Gemini 2.5 Flash";

  async queryPerception(prompt: string, businessName: string): Promise<ModelResponse> {
    const start = Date.now();
    const apiKey = process.env.GOOGLE_GENAI_API_KEY;

    if (!apiKey) {
      return this.failureResponse("GOOGLE_GENAI_API_KEY not configured", start);
    }

    const systemInstruction = `You are an AI business analyst. The user will ask you about a specific business.
Answer based ONLY on your existing knowledge. Do NOT search the web.

CRITICAL: Your response MUST be valid JSON matching this exact structure:
{
  "business_description": "A 2-3 sentence description of what this business is and does",
  "business_type": "The primary classification (e.g., 'SaaS company', '3PL logistics provider')",
  "services_mentioned": ["service1", "service2"],
  "industries_mentioned": ["industry1", "industry2"],
  "locations_mentioned": ["location1", "location2"],
  "customer_types_mentioned": ["customer type 1", "customer type 2"],
  "differentiators_mentioned": ["differentiator 1", "differentiator 2"],
  "additional_claims": ["any other notable facts you know about this business"],
  "confidence": "high | medium | low",
  "summary": "A one-paragraph summary of how you perceive this business"
}

If you have limited knowledge about this business, still fill in what you can and set confidence to "low".
Do NOT make up information. If you don't know something, leave that array empty.
Return ONLY the JSON object, no markdown fences.`;

    // Auto-repair: if the primary key is rejected (401/403, e.g. revoked),
    // retry once with a fallback key when one is configured
    // (GOOGLE_GENAI_API_KEY_FALLBACK). A dead primary key no longer
    // silently degrades every scan.
    const requestBody = JSON.stringify({
      system_instruction: {
        parts: [{ text: systemInstruction }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2000,
        responseMimeType: "application/json",
      },
    });
    const doFetch = (key: string) =>
      fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
        },
      );

    try {
      let response = await doFetch(apiKey);
      if (response.status === 401 || response.status === 403) {
        const fallbackKey = process.env.GOOGLE_GENAI_API_KEY_FALLBACK;
        if (fallbackKey && fallbackKey !== apiKey) {
          console.warn("[gemini-adapter] Primary key rejected, retrying with fallback key");
          response = await doFetch(fallbackKey);
        }
      }

      // On 429 (per-minute quota), wait and retry once. If the quota is a
      // daily limit the retry will fail again and the query is marked failed.
      if (response.status === 429) {
        console.warn("[gemini-adapter] Quota hit (429), waiting 20s and retrying once");
        await new Promise((r) => setTimeout(r, 20000));
        response = await doFetch(apiKey);
      }

      if (!response.ok) {
        const errorText = await response.text();
        return this.failureResponse(`Gemini API ${response.status}: ${errorText.slice(0, 200)}`, start);
      }

      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const parsed = extractJSON(content);

      if (!parsed) {
        return this.failureResponse("Failed to parse JSON from Gemini response", start, content);
      }

      const perception: ModelPerception = {
        business_description: parsed.business_description || "",
        services_mentioned: Array.isArray(parsed.services_mentioned) ? parsed.services_mentioned : [],
        industries_mentioned: Array.isArray(parsed.industries_mentioned) ? parsed.industries_mentioned : [],
        locations_mentioned: Array.isArray(parsed.locations_mentioned) ? parsed.locations_mentioned : [],
        customer_types_mentioned: Array.isArray(parsed.customer_types_mentioned) ? parsed.customer_types_mentioned : [],
        differentiators_mentioned: Array.isArray(parsed.differentiators_mentioned) ? parsed.differentiators_mentioned : [],
        business_type: parsed.business_type || "",
        additional_claims: Array.isArray(parsed.additional_claims) ? parsed.additional_claims : [],
      };

      return {
        model_id: this.model_id,
        provider: this.provider,
        raw_response: content,
        summary: parsed.summary || perception.business_description,
        perception,
        timestamp: new Date().toISOString(),
        success: true,
        latency_ms: Date.now() - start,
      };
    } catch (err: any) {
      return this.failureResponse(err.message || "Unknown Gemini error", start);
    }
  }

  /**
   * Ask Gemini a customer-style question with live web search (Google Search
   * grounding) and return the natural-language answer plus the sources it used.
   *
   * Unlike queryPerception (memory-only, JSON), this reflects what a real user
   * gets today: a web-grounded answer. Grounding does not work with JSON mode,
   * so this returns text, not a structured perception.
   *
   * Note: grounding chunk URIs are Google redirect URLs, not the final page
   * URLs — they are still auditable links to the sources used.
   */
  async queryGrounded(question: string): Promise<GroundedAnswer> {
    const start = Date.now();
    const apiKey = process.env.GOOGLE_GENAI_API_KEY;

    if (!apiKey) {
      return this.groundedFailure(question, "GOOGLE_GENAI_API_KEY not configured", start);
    }

    const systemInstruction = `You are an audit assistant using web search. Do not guess. If information is missing, say 'unclear'. Search for official and authoritative sources. Only state facts supported by citations. Keep the answer concise.`;

    const requestBody = JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: "user", parts: [{ text: question }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1500 },
    });
    const doFetch = (key: string) =>
      fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
        },
      );

    try {
      let response = await doFetch(apiKey);
      if (response.status === 401 || response.status === 403) {
        const fallbackKey = process.env.GOOGLE_GENAI_API_KEY_FALLBACK;
        if (fallbackKey && fallbackKey !== apiKey) {
          console.warn("[gemini-adapter] Primary key rejected, retrying with fallback key");
          response = await doFetch(fallbackKey);
        }
      }

      if (!response.ok) {
        const errorText = await response.text();
        return this.groundedFailure(question, `Gemini API ${response.status}: ${errorText.slice(0, 200)}`, start);
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];
      const answerText =
        candidate?.content?.parts?.map((part: any) => part.text || "").join("") || "";
      const gm = candidate?.groundingMetadata;
      const sources: string[] = [];
      if (gm?.groundingChunks) {
        for (const chunk of gm.groundingChunks) {
          const uri = chunk?.web?.uri;
          if (uri && !sources.includes(uri)) sources.push(uri);
        }
      }

      return {
        model_id: this.model_id,
        provider: this.provider,
        question,
        answer_text: answerText,
        sources,
        grounded: Boolean(gm),
        timestamp: new Date().toISOString(),
        success: true,
        latency_ms: Date.now() - start,
      };
    } catch (err: any) {
      return this.groundedFailure(question, err.message || "Unknown Gemini error", start);
    }
  }

  private groundedFailure(question: string, errorMessage: string, startTime: number): GroundedAnswer {
    return {
      model_id: this.model_id,
      provider: this.provider,
      question,
      answer_text: "",
      sources: [],
      grounded: false,
      timestamp: new Date().toISOString(),
      success: false,
      error_message: errorMessage,
      latency_ms: Date.now() - startTime,
    };
  }

  private failureResponse(errorMessage: string, startTime: number, rawResponse?: string): ModelResponse {
    return {
      model_id: this.model_id,
      provider: this.provider,
      raw_response: rawResponse || "",
      summary: "",
      perception: emptyPerception(),
      timestamp: new Date().toISOString(),
      success: false,
      error_message: errorMessage,
      latency_ms: Date.now() - startTime,
    };
  }
}
