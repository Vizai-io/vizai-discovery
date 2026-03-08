
export type UserRole = 'admin' | 'client';

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  organizationId: string;
  displayName?: string;
}

export interface Organization {
  id: string;
  name: string;
  createdAt: any;
}

export interface CompanyProfile {
  id: string;
  organizationId: string;
  name: string;
  website: string;
  industry: string;
  serviceCategories: string[];
  targetGeography: string;
  competitors: string[];
  createdAt: any;
  monitoringFrequency?: 'off' | 'weekly' | 'biweekly' | 'monthly';
  nextScanAt?: any;
  lastScanAt?: any;
}

export interface IndustryQuery {
  id?: string;
  text: string;
  category: string;
  geoModifier?: string;
  intentType: 'best' | 'local' | 'comparison' | 'capability';
}

export interface ScanRecord {
  id: string;
  profileId: string;
  date: any;
  status: 'pending' | 'completed' | 'failed';
  results: ScanResults;
  queryDiscovery?: QueryDiscoveryData;
  queryLibraryUsed?: string[];
}

export interface QueryDiscoveryData {
  queries: QueryRecord[];
  summary: {
    totalQueries: number;
    companyMentionCount: number;
    coveragePercentage: number;
  };
}

export interface QueryRecord {
  id: string;
  text: string;
  results: QueryResult[];
}

export interface QueryResult {
  provider: 'OpenAI' | 'Anthropic' | 'Perplexity' | 'Gemini';
  mentions: CompanyMention[];
  isTargetCompanyMentioned: boolean;
}

export interface CompanyMention {
  companyName: string;
  position: number;
  description: string;
  confidenceScore: number;
}

export interface StrategicRecommendation {
  title: string;
  description: string;
  category: 'Structured Data' | 'Content / Positioning' | 'Entity / Citation Signals' | 'Competitive Visibility' | string;
  priority: 'high' | 'medium' | 'low';
  expectedImpact: string;
}

export interface ScanResults {
  overallScore: number;
  categoryScores: {
    presence: number;
    descriptionAccuracy: number;
    citationStrength: number;
    serviceCoverage: number;
    competitorShareOfVoice: number;
  };
  competitorComparison: {
    name: string;
    overallScore: number;
    presence: number;
    descriptionAccuracy: number;
  }[];
  aiDescriptionAccuracy: {
    generatedDescription: string;
    actualProfileDescription: string;
    matchScore: number;
    discrepancies: string[];
  };
  knowledgeGaps: {
    type: string;
    description: string;
    impact: string;
    suggestedImprovement: string;
  }[];
  missedDiscoveryOpportunities: {
    query: string;
    reason: string;
    suggestedAction: string;
  }[];
  priorityActions: StrategicRecommendation[];
}

export interface RankingEntry {
  companyName: string;
  score: number;
  rank: number;
  change: number; // Positive means rank improved (moved up)
  industry: string;
  region: string;
}

export interface RankingSnapshot {
  id: string;
  date: any;
  industry: string;
  region: string;
  entries: RankingEntry[];
}
