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
}

export interface ScanRecord {
  id: string;
  profileId: string;
  date: any;
  status: 'pending' | 'completed' | 'failed';
  results: ScanResults;
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
  priorityActions: {
    category: string;
    action: string;
    impact: string;
    priority: 'high' | 'medium' | 'low';
  }[];
}
