/**
 * @fileOverview Type definitions for the V1 AI Perception Scan Engine.
 *
 * These types define the structured output of a perception scan:
 * how AI models see, describe, and understand a business.
 */

// ============================================================
// INPUT TYPES
// ============================================================

/**
 * Ground truth data supplied by the business owner.
 * Used to compare AI model outputs against what the business actually is.
 */
export interface GroundTruth {
  official_business_name?: string;
  official_description?: string;
  official_services?: string[];
  official_locations?: string[];
  official_industries?: string[];
  official_differentiators?: string[];
}

/**
 * Input payload for a perception scan request.
 */
export interface PerceptionScanInput {
  business_name: string;
  website_url?: string;
  prompt?: string;
  ground_truth?: GroundTruth;
  /** Model IDs to use. If omitted, all enabled models run. */
  models?: string[];
  /** Organization ID for Firestore storage (optional for API-only usage). */
  organization_id?: string;
}

// ============================================================
// MODEL RESPONSE TYPES
// ============================================================

/**
 * Normalized response from a single AI model.
 * Every adapter must produce this shape regardless of provider.
 */
export interface ModelResponse {
  model_id: string;
  provider: string;
  raw_response: string;
  summary: string;
  /** Structured perception extracted from the raw response */
  perception: ModelPerception;
  timestamp: string;
  success: boolean;
  error_message?: string;
  latency_ms: number;
}

/**
 * Structured perception data extracted from a model's response.
 * This is what we compare across models and against ground truth.
 */
export interface ModelPerception {
  business_description: string;
  services_mentioned: string[];
  industries_mentioned: string[];
  locations_mentioned: string[];
  customer_types_mentioned: string[];
  differentiators_mentioned: string[];
  /** What the model thinks the business fundamentally is */
  business_type: string;
  /** Any additional claims the model made */
  additional_claims: string[];
}

// ============================================================
// COMPARISON TYPES
// ============================================================

/**
 * A point of agreement, difference, or conflict between models.
 */
export interface ComparisonItem {
  category: string;
  detail: string;
  models_involved: string[];
}

/**
 * Side-by-side comparison of model outputs.
 */
export interface PerceptionComparison {
  perception_summary: string;
  model_outputs: {
    model_id: string;
    summary: string;
    raw_response: string;
  }[];
  comparison: {
    agreements: ComparisonItem[];
    differences: ComparisonItem[];
    conflicts: ComparisonItem[];
  };
}

// ============================================================
// INACCURACY DETECTION TYPES
// ============================================================

export type AccuracyClassification = 'accurate' | 'partially_accurate' | 'inaccurate' | 'unverifiable';

export interface InaccuracyFinding {
  category: string;
  claim: string;
  expected: string;
  classification: AccuracyClassification;
  model_id: string;
  explanation: string;
}

export interface InaccuracyReport {
  inaccuracies: InaccuracyFinding[];
  partial_matches: InaccuracyFinding[];
  unverifiable_claims: InaccuracyFinding[];
  accuracy_score: number; // 0-100, percentage of accurate claims
}

// ============================================================
// GAP / OMISSION TYPES
// ============================================================

export type OmissionSeverity = 'major' | 'minor';

export interface Omission {
  category: string;
  item: string;
  severity: OmissionSeverity;
  missing_in_models: string[];
  explanation: string;
}

export interface OmissionReport {
  omissions: Omission[];
  coverage_score: number; // 0-100, percentage of ground truth covered
}

// ============================================================
// ENTITY UNDERSTANDING TYPES
// ============================================================

export type UnderstandingStatus = 'correct' | 'partially_correct' | 'incorrect' | 'not_mentioned';

export interface EntityDimension {
  inferred_by_models: Record<string, string>;
  expected: string;
  status: UnderstandingStatus;
  notes: string;
}

export interface EntityUnderstanding {
  business_type: EntityDimension;
  services: EntityDimension;
  geography: EntityDimension;
  customer_type: EntityDimension;
  overall_score: number; // 0-100
}

// ============================================================
// CONSISTENCY / DRIFT TYPES
// ============================================================

export type ConsistencyLabel = 'high agreement' | 'moderate divergence' | 'significant divergence' | 'extreme divergence';

export interface ConsistencyReport {
  consistency_score: number; // 0-100 (0 = full agreement, 100 = extreme divergence)
  consistency_label: ConsistencyLabel;
  consistency_notes: string[];
}

// ============================================================
// RECOMMENDATION TYPES
// ============================================================

export type RecommendationPriority = 'high' | 'medium' | 'low';

export interface PerceptionRecommendation {
  priority: RecommendationPriority;
  category: string;
  title: string;
  reason: string;
  recommended_action: string;
}

// ============================================================
// REPORT TYPES
// ============================================================

/**
 * The complete structured output of a perception scan.
 * Stored in Firestore and returned from the API.
 */
export interface PerceptionScanResult {
  scan_id: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  business_name: string;
  website_url?: string;
  prompt_used: string;
  models_requested: string[];
  created_at: string;
  completed_at?: string;

  // Core data
  model_results: ModelResponse[];
  comparison: PerceptionComparison;
  inaccuracy_report: InaccuracyReport;
  omission_report: OmissionReport;
  entity_understanding: EntityUnderstanding;
  consistency: ConsistencyReport;
  recommendations: PerceptionRecommendation[];

  // Reports
  markdown_report: string;
  json_report: Record<string, any>;

  // Ground truth (if provided)
  ground_truth?: GroundTruth;

  // Error info
  error?: string;
}

/**
 * Adapter interface for the perception scan engine.
 * Each AI provider implements this to produce normalized perception data.
 */
export interface PerceptionAdapter {
  model_id: string;
  provider: string;
  display_name: string;

  /**
   * Send the scan prompt to the model and return a normalized perception response.
   * Must handle its own errors and return success: false on failure.
   */
  queryPerception(prompt: string, businessName: string): Promise<ModelResponse>;
}
