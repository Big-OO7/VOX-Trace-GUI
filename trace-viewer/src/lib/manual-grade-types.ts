export interface RelevanceChecks {
  primaryIntentMatch: boolean;          // +3
  descriptiveTraitsPreserved: boolean;  // +2
  categoryDietaryMatch: boolean;        // +2
  situationalSuitability: boolean;      // +2
  explicitConstraintsMet: boolean;      // +2
  profileCompliant: boolean;            // +1 (GATE: if false, total score = 0)
  outputClarity: boolean;               // +2
  mainstreamAvailability: boolean;      // +2
  formatCorrectness: boolean;           // +2
  conciseness: boolean;                 // +2
}

export interface SerendipityChecks {
  cuisineDishNovelty: 0 | 1 | 2 | 3 | 4 | 5;  // 0-5 points (6-tier graded)
  lowDiscoverability: boolean;                 // +1
  familiarIngredientsNewContext: boolean;      // +1
  contextFitWhileNovel: boolean;               // +1
  ahaMoment: boolean;                          // +1
  createsCuriosity: boolean;                   // +1
}

export interface ManualGrade {
  id: string;
  timestamp: number;

  // Input fields
  consumerId?: string;
  query: string;
  daypart: string;
  recommendation: string;

  // Rubric checks
  relevanceChecks: RelevanceChecks;
  serendipityChecks: SerendipityChecks;

  // Calculated scores
  relevanceScore: number;        // 0-10
  serendipityScore: number;      // 0-10
  weightedScore: number;         // calculated

  // Optional fields
  notes?: string;
  grader?: string;
}

export const RELEVANCE_POINTS: Record<keyof RelevanceChecks, number> = {
  primaryIntentMatch: 3,
  descriptiveTraitsPreserved: 2,
  categoryDietaryMatch: 2,
  situationalSuitability: 2,
  explicitConstraintsMet: 2,
  profileCompliant: 1,
  outputClarity: 2,
  mainstreamAvailability: 2,
  formatCorrectness: 2,
  conciseness: 2,
};

export const NOVELTY_TIERS = [
  { value: 0, label: 'Tier 1 (+0.0): Completely new dish in DISCONNECTED cuisine', description: 'e.g., Japanese ramen → Ethiopian injera' },
  { value: 1, label: 'Tier 2 (+1.0): SAME dish SAME cuisine (variants only)', description: 'e.g., Tonkotsu ramen → Shoyu ramen' },
  { value: 2, label: 'Tier 3 (+2.0): Similar dish in SAME familiar cuisine', description: 'e.g., Japanese ramen → Japanese udon' },
  { value: 3, label: 'Tier 4 (+3.0): Same/similar dish in CONNECTED new cuisine', description: 'e.g., Japanese ramen → Vietnamese pho' },
  { value: 4, label: 'Tier 5 (+4.0): Completely new dish in SAME familiar cuisine', description: 'e.g., Japanese ramen → Japanese tempura' },
  { value: 5, label: 'Tier 6 (+5.0): Completely new dish in CONNECTED new cuisine', description: 'e.g., Japanese ramen → Vietnamese spring rolls' },
];
