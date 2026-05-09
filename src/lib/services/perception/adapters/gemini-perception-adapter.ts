/**
 * @fileOverview Gemini Perception Adapter.
 *
 * Asks Gemini to describe a business, then normalizes the response
 * into the ModelResponse/ModelPerception structure.
 *
 * Uses direct REST API calls to the Gemini API for simplicity and
 * independence from the Genkit flow infrastructure.
 */

import type { PerceptionAdapter, ModelResponse, ModelPerception } from "@/lib/types/perception-scan";

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

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });

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
