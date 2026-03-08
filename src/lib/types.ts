
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
  foundingYear?: number;
  employeeSize?: string;
  operatingRegions?: string[];
  googleBusinessProfileUrl?: string;
  linkedInPageUrl?: string;
  directoryListings?: string[];
  createdAt: any;
  monitoringFrequency?: 'off' | 'weekly' | 'biweekly' | 'monthly';
  nextScanAt?: any;
  lastScanAt?: any;
}

export interface WebsiteSignal {
  id: string;
  profileId: string;
  title: string;
  metaDescription: string;
  h1: string[];
  jsonLdDetected: boolean;
  serviceKeywords: string[];
  locationReferences: string[];
  extractedAt: any;
}

export interface PresenceSignal {
  id: string;
  profileId: string;
  hasGoogleBusiness: boolean;
  hasLinkedIn: boolean;
  directoryCount: number;
  citationWeight: number; // 0-100
  authorityBoost: number; // 0-100
  lastVerifiedAt: any;
}

export interface EntitySignal {
  id: string;
  profileId: string;
  authorityWeight: number; // 0-100
  serviceCoverageWeight: number; // 0-100
  geographicRelevanceWeight: number; // 0-100
  dataConfidence: number; // 0-100
  enrichedAttributes: {
    foundingYear?: number;
    employeeSize?: string;
    operatingRegions: string[];
    industriesServed: string[];
  };
  extractedAt: any;
}

export interface CompetitorProfile {
  id: string;
  name: string;
  industry: string;
  services: string[];
  geography: string[];
  authorityScore: number;
  citationStrengthScore: number;
  serviceCoverageScore: number;
}

export interface IndustryQuery {
  id?: string;
  text: string;
  category: string;
  geoModifier?: string;
  intentType: 'best' | 'local' | 'comparison' | 'capability';
}

export interface ProposalData {
  summary: string;
  gaps: string[];
  workstreams: { title: string; description: string }[];
  projections: string;
  monitoringPlan: string;
  estimatedInvestment?: string;
  updatedAt?: any;
}

export interface ScanRecord {
  id: string;
  profileId: string;
  organizationId: string;
  date: any;
  status: 'pending' | 'completed' | 'failed';
  reviewStatus?: 'draft' | 'in-review' | 'approved' | 'shared';
  internalNotes?: string;
  lastReviewedBy?: string;
  lastReviewedAt?: any;
  results: ScanResults;
  queryDiscovery?: QueryDiscoveryData;
  queryLibraryUsed?: string[];
  realQueryResults?: RealQueryResult[];
  // Share Settings
  shareEnabled?: boolean;
  shareCreatedAt?: any;
  viewCount?: number;
  lastViewedAt?: any;
  // Proposal Mode
  proposal?: ProposalData;
}

export interface RealQueryResult {
  id: string;
  scanId: string;
  query: string;
  model: string;
  mentions: {
    companyName: string;
    description: string;
    position?: number;
  }[];
  responseExcerpt: string;
  timestamp: any;
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
  intentType?: 'best' | 'local' | 'comparison' | 'capability';
  category?: string;
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
  overview?: string;
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
  benchmark?: {
    industry: string;
    industryAverage: number;
    topPerformer: number;
    percentile: number;
    totalCompanies: number;
  };
  entitySignal?: EntitySignal;
  presenceSignal?: PresenceSignal;
  simulationAccuracy?: number; // 0-100
  companyName?: string;
  industry?: string;
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

export interface IndustryBenchmark {
  industry: string;
  averageScore: number;
  topScore: number;
  minScore: number;
  totalCompanies: number;
}

export interface DiscoveryDataEntry {
  id: string;
  scanId: string;
  industry: string;
  region: string;
  queryText: string;
  companiesMentioned: string[];
  competitorsPresent: string[];
  targetCompanyPresent: boolean;
  intentType?: string;
  timestamp: any;
}

export type LeadStatus = 'new' | 'qualified' | 'proposal sent' | 'won' | 'lost';

export interface ConsultationRequest {
  id: string;
  name: string;
  email: string;
  company: string;
  website?: string;
  serviceInterest: string;
  notes?: string;
  status: LeadStatus;
  sourceScanId?: string;
  createdAt: any;
}
