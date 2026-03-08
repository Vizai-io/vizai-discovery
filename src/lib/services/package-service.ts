
/**
 * @fileOverview PackageService
 * 
 * Maps scan weaknesses to VizAI service packages and manages tier metadata.
 */

import { ServicePackageType, ScanResults } from "@/lib/types";

export interface PackageMetadata {
  type: ServicePackageType;
  label: string;
  description: string;
  color: string;
  focus: string[];
}

export class PackageService {
  static PACKAGES: Record<ServicePackageType, PackageMetadata> = {
    Snapshot: {
      type: 'Snapshot',
      label: 'Intelligence Snapshot',
      description: 'A deep-dive audit of current visibility with no ongoing execution.',
      color: 'bg-blue-500',
      focus: ['Entity Audit', 'Competitive Gaps', 'Accuracy Baseline']
    },
    Foundation: {
      type: 'Foundation',
      label: 'Discovery Foundation',
      description: 'Implementation of critical technical signals and structured data.',
      color: 'bg-green-500',
      focus: ['Schema Markup', 'Citation Building', 'Narrative Correction']
    },
    Growth: {
      type: 'Growth',
      label: 'Visibility Growth',
      description: 'Aggressive content and entity signaling to capture market share.',
      color: 'bg-accent',
      focus: ['Competitor Displacement', 'Intent Coverage', 'Content Authority']
    },
    Monitoring: {
      type: 'Monitoring',
      label: 'Active Monitoring',
      description: 'Ongoing tracking of AI training sets and recommendation drift.',
      color: 'bg-primary',
      focus: ['Weekly Audits', 'Drift Alerts', 'Executive Reporting']
    }
  };

  /**
   * Suggests a package based on scan category scores.
   */
  static getSuggestedPackage(scores: ScanResults['categoryScores']): ServicePackageType {
    const { presence, descriptionAccuracy, citationStrength, competitorShareOfVoice } = scores;

    // 1. Critical Visibility Deficit -> Foundation
    if (presence < 40 || citationStrength < 40) return 'Foundation';

    // 2. High Competitor Intrusion -> Growth
    if (competitorShareOfVoice > 50) return 'Growth';

    // 3. Low Accuracy -> Foundation/Snapshot
    if (descriptionAccuracy < 60) return 'Foundation';

    // 4. Generally stable but needs tracking -> Monitoring
    if (presence > 70) return 'Monitoring';

    // Default
    return 'Snapshot';
  }

  static getPackageInfo(type: ServicePackageType): PackageMetadata {
    return this.PACKAGES[type];
  }
}
