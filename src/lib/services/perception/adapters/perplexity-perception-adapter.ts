/**
 * @fileOverview Perplexity grounded adapter (web search + answer).
 *
 * Perplexity's `sonar` model is purpose-built for web-grounded answers with
 * citations, which is exactly what the customer-intent scan needs. It is the
 * primary grounded provider when PERPLEXITY_API_KEY is configured; the
 * customer-intent scan falls back to Gemini grounding otherwise.
 *
 * The API key lives in Vizai-discovery/.env.local as PERPLEXITY_API_KEY.
 * If it is not set, queryGrounded returns a failure (not configured) and the
 * caller falls back to Gemini.
 */

import type { GroundedAnswer } from "@/lib/types/perception-scan";

export class PerplexityPerceptionAdapter {
  readonly model_id = "perplexity:sonar";
  readonly provider = "Perplexity";

  async queryGrounded(question: string): Promise<GroundedAnswer> {
    const start = Date.now();
    const apiKey = process.env.PERPLEXITY_API_KEY;

    if (!apiKey) {
      return this.groundedFailure(question, "PERPLEXITY_API_KEY not configured", start);
    }

    const systemInstruction = `You are an audit assistant using web search. Do not guess. If information is missing, say 'unclear'. Search for official and authoritative sources. Only state facts supported by citations. Keep the answer concise.`;

    try {
      const response = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "sonar",
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: question },
          ],
          temperature: 0.2,
          max_tokens: 1500,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return this.groundedFailure(
          question,
          `Perplexity API ${response.status}: ${errorText.slice(0, 200)}`,
          start,
        );
      }

      const data = await response.json();
      const answerText = data.choices?.[0]?.message?.content || "";
      const sources: string[] = Array.isArray(data.citations)
        ? data.citations.filter((u: unknown) => typeof u === "string")
        : [];

      return {
        model_id: this.model_id,
        provider: this.provider,
        question,
        answer_text: answerText,
        sources,
        grounded: sources.length > 0,
        timestamp: new Date().toISOString(),
        success: true,
        latency_ms: Date.now() - start,
      };
    } catch (err: any) {
      return this.groundedFailure(question, err.message || "Unknown Perplexity error", start);
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
}
