import { z } from "zod";

export const CrawlBudgetSchema = z.object({
  maxPages: z.number().int().min(1).max(100).default(1),
  maxBrowserPages: z.number().int().min(0).max(20).default(0),
  maxBytesPerPage: z.number().int().min(1_024).max(10_000_000).default(5_000_000),
  maxRedirects: z.number().int().min(0).max(10).default(5),
  timeoutMs: z.number().int().min(1_000).max(120_000).default(30_000),
  maxDurationMs: z.number().int().min(1_000).max(900_000).default(60_000),
  maxModelTokens: z.number().int().min(0).max(1_000_000).default(0),
  maxCostMicros: z.number().int().min(0).max(100_000_000).default(0),
});

export type CrawlBudget = z.infer<typeof CrawlBudgetSchema>;

export const FOUNDATION_BUDGET: CrawlBudget = CrawlBudgetSchema.parse({});

export const CreateRegistryTargetSchema = z.object({
  business_name: z.string().trim().min(1).max(200),
  canonical_url: z.string().url().max(2_048),
  company_profile_id: z.string().min(1).optional(),
  autonomy_policy_id: z.string().min(1).optional(),
  freshness_hours: z.number().int().min(1).max(8_760).optional().default(720),
});

export const CreateCrawlRunSchema = z.object({
  objective: z.string().trim().min(1).max(2_000).optional()
    .default("Fetch the approved canonical page and create an evidence snapshot."),
  priority: z.number().int().min(-100).max(100).optional().default(0),
  command_center_run_id: z.string().trim().min(1).max(200).optional(),
});

export const DEFAULT_ALLOWED_MIME_TYPES = [
  "text/html",
  "text/plain",
  "application/xhtml+xml",
  "application/json",
  "application/ld+json",
  "application/xml",
  "text/xml",
] as const;

export const REGISTRY_CRAWLER_USER_AGENT =
  process.env.REGISTRY_CRAWLER_USER_AGENT ??
  "VizAI-RegistryBot/1.0 (+https://www.vizai.io/crawler)";

export const REGISTRY_QUEUE_NAME = "vizai-registry-foundation";
export const REGISTRY_DEAD_LETTER_QUEUE = "vizai-registry-foundation-dead-letter";

export interface RegistryRunJob {
  runId: string;
  targetId: string;
  organizationId: string;
  traceId: string;
}
