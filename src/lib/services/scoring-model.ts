/**
 * ScoringModel defines the weighted framework for calculating the Overall AI Visibility Score.
 * This ensures transparency in client conversations and consistent demo behavior.
 */

export interface ScoreCategory {
  id: string;
  label: string;
  weight: number; // Percentage (0-1)
  description: string;
  positiveDrivers: string[];
  negativeDrivers: string[];
}

/**
 * The master configuration for the scoring engine.
 * Adjust weights here to shift the primary drivers of the overall score.
 * Total weights MUST sum to 1.0.
 */
export const SCORING_MODEL: ScoreCategory[] = [
  {
    id: 'presence',
    label: 'AI Visibility',
    weight: 0.30,
    description: 'Measures the frequency and priority positioning of your brand in top-tier AI search responses.',
    positiveDrivers: ['High mention frequency', 'First-page positioning', 'Brand-entity association'],
    negativeDrivers: ['Low search prominence', 'Competitor dominance', 'Generic keyword mismatch'],
  },
  {
    id: 'descriptionAccuracy',
    label: 'Description Accuracy',
    weight: 0.20,
    description: 'Measures how precisely AI-generated summaries align with your official business model and history.',
    positiveDrivers: ['Accurate service listing', 'Correct historical data', 'Clear value proposition'],
    negativeDrivers: ['Outdated info', 'Hallucinated services', 'Misleading summaries'],
  },
  {
    id: 'citationStrength',
    label: 'Citation Strength',
    weight: 0.20,
    description: 'Evaluates the authority and reliability of external sites cited by AI models to validate your brand.',
    positiveDrivers: ['Premium industry backlinks', 'Wikipedia/Entity mentions', 'Press coverage'],
    negativeDrivers: ['Broken references', 'Low-authority sources', 'Sparse citation density'],
  },
  {
    id: 'serviceCoverage',
    label: 'Service Coverage',
    weight: 0.15,
    description: 'Assesses the breadth of your service taxonomy identified and indexed within the AI knowledge layer.',
    positiveDrivers: ['Niche capability discovery', 'Cross-category indexing', 'Feature-level mentions'],
    negativeDrivers: ['Narrow service view', 'Ignored sub-capabilities', 'Taxonomy gaps'],
  },
  {
    id: 'competitorShareOfVoice',
    label: 'Competitor Threat',
    weight: 0.15,
    description: 'Measures the risk of rivals capturing search intent and being recommended over your brand.',
    positiveDrivers: ['Low rival intrusion', 'Owned search vectors', 'Unique market positioning'],
    negativeDrivers: ['High rival share', 'Brand name confusion', 'Aggressive rival citations'],
  },
];

/**
 * Calculates a consolidated score based on defined weights.
 * Note: For 'Competitor Threat', a higher score in the UI indicates a higher threat,
 * so we use (100 - score) for the defensive weighted calculation.
 */
export function calculateWeightedScore(scores: Record<string, number>): number {
  return SCORING_MODEL.reduce((acc, cat) => {
    const rawValue = scores[cat.id as keyof typeof scores] || 0;
    const scoreValue = cat.id === 'competitorShareOfVoice' ? (100 - rawValue) : rawValue;
    return acc + (scoreValue * cat.weight);
  }, 0);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * Simulates a projected score improvement scenario based on strategic optimizations.
 */
export function calculateProjectedImprovement(currentScores: Record<string, number>) {
  const projectedScores: Record<string, number> = { ...currentScores };
  const improvements: { id: string, label: string, gain: number }[] = [];

  SCORING_MODEL.forEach(cat => {
    const currentVal = currentScores[cat.id as keyof typeof currentScores] || 0;
    // Target a move toward 'Leader' status (85+)
    if (currentVal < 85) {
      const potentialGain = Math.min(100 - currentVal, cat.id === 'presence' ? 18 : 12);
      const nextValue = cat.id === 'competitorShareOfVoice'
        ? clampScore(currentVal - potentialGain)
        : clampScore(currentVal + potentialGain);
      projectedScores[cat.id] = nextValue;
      if (potentialGain > 0) {
        improvements.push({ id: cat.id, label: cat.label, gain: potentialGain });
      }
    }
  });

  const currentOverall = calculateWeightedScore(currentScores);
  const projectedOverall = calculateWeightedScore(projectedScores);

  return {
    projectedScores,
    currentOverall,
    projectedOverall,
    improvements,
    totalGain: projectedOverall - currentOverall
  };
}
