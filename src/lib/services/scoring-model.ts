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

export const SCORING_MODEL: ScoreCategory[] = [
  {
    id: 'presence',
    label: 'AI Visibility',
    weight: 0.30,
    description: 'The frequency and prominence of your brand in AI responses across top discovery vectors.',
    positiveDrivers: ['High mention frequency', 'First-page positioning', 'Brand-entity association'],
    negativeDrivers: ['Low search prominence', 'Competitor dominance', 'Generic keyword mismatch'],
  },
  {
    id: 'descriptionAccuracy',
    label: 'Description Accuracy',
    weight: 0.20,
    description: 'How well AI-generated summaries match your official business model and capabilities.',
    positiveDrivers: ['Accurate service listing', 'Correct historical data', 'Clear value proposition'],
    negativeDrivers: ['Outdated info', 'Hallucinated services', 'Misleading summaries'],
  },
  {
    id: 'citationStrength',
    label: 'Citation Strength',
    weight: 0.20,
    description: 'The authority and diversity of external sources cited by AI to validate your claims.',
    positiveDrivers: ['Premium industry backlinks', 'Wikipedia/Entity mentions', 'Press coverage'],
    negativeDrivers: ['Broken references', 'Low-authority sources', 'Sparse citation density'],
  },
  {
    id: 'serviceCoverage',
    label: 'Service Coverage',
    weight: 0.15,
    description: 'The breadth of your specific service taxonomy identified and indexed by AI models.',
    positiveDrivers: ['Niche capability discovery', 'Cross-category indexing', 'Feature-level mentions'],
    negativeDrivers: ['Narrow service view', 'Ignored sub-capabilities', 'Taxonomy gaps'],
  },
  {
    id: 'competitorShareOfVoice',
    label: 'Competitor Threat',
    weight: 0.15,
    description: 'The defensive strength of your profile against rival brands capturing your search intent.',
    positiveDrivers: ['Low rival intrusion', 'Owned search vectors', 'Unique market positioning'],
    negativeDrivers: ['High rival share', 'Brand name confusion', 'Aggressive rival citations'],
  },
];

export function calculateWeightedScore(scores: Record<string, number>): number {
  return SCORING_MODEL.reduce((acc, cat) => {
    // For Competitor Threat, a LOWER score is technically "better" for the client, 
    // but in our UI, a 100 in "Competitor Threat" usually means "High Threat".
    // We treat this as "Competitive Defense" for the weighted average calculation.
    const scoreValue = cat.id === 'competitorShareOfVoice' ? (100 - scores[cat.id]) : scores[cat.id];
    return acc + (scoreValue * cat.weight);
  }, 0);
}

/**
 * Simulates a projected score improvement scenario based on current weaknesses.
 */
export function calculateProjectedImprovement(currentScores: Record<string, number>) {
  const projectedScores: Record<string, number> = { ...currentScores };
  const improvements: { id: string, label: string, gain: number }[] = [];

  SCORING_MODEL.forEach(cat => {
    const currentVal = currentScores[cat.id];
    // If a score is below 85, there's significant room for optimization
    if (currentVal < 85) {
      const gain = Math.min(100 - currentVal, cat.id === 'presence' ? 18 : 12);
      projectedScores[cat.id] = currentVal + gain;
      if (gain > 0) {
        improvements.push({ id: cat.id, label: cat.label, gain });
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
