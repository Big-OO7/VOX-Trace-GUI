import { ManualGrade, RelevanceChecks, SerendipityChecks, RELEVANCE_POINTS } from '@/lib/manual-grade-types';

export function calculateRelevanceScore(checks: RelevanceChecks): number {
  // GATE check: if profile not compliant, score = 0
  if (!checks.profileCompliant) {
    return 0;
  }

  let rawPoints = 0;

  Object.entries(checks).forEach(([key, value]) => {
    if (value === true) {
      rawPoints += RELEVANCE_POINTS[key as keyof RelevanceChecks];
    }
  });

  // Normalize from 20 points to 10 points scale
  return (rawPoints / 20) * 10;
}

export function calculateSerendipityScore(checks: SerendipityChecks): number {
  let points = 0;

  // Graded check (0-5 points)
  points += checks.cuisineDishNovelty;

  // Binary checks (+1 each)
  if (checks.lowDiscoverability) points += 1;
  if (checks.familiarIngredientsNewContext) points += 1;
  if (checks.contextFitWhileNovel) points += 1;
  if (checks.ahaMoment) points += 1;
  if (checks.createsCuriosity) points += 1;

  return points; // Already on 0-10 scale
}

export function calculateWeightedScore(relevanceScore: number, serendipityScore: number): number {
  return (relevanceScore * 0.70) + (serendipityScore * 0.30);
}

export function saveGradeToLocalStorage(grade: ManualGrade): void {
  const grades = getGradesFromLocalStorage();
  const existingIndex = grades.findIndex(g => g.id === grade.id);

  if (existingIndex >= 0) {
    grades[existingIndex] = grade;
  } else {
    grades.push(grade);
  }

  localStorage.setItem('manual_grades', JSON.stringify(grades));
}

export function getGradesFromLocalStorage(): ManualGrade[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem('manual_grades');
  return stored ? JSON.parse(stored) : [];
}

export function deleteGradeFromLocalStorage(id: string): void {
  const grades = getGradesFromLocalStorage();
  const filtered = grades.filter(g => g.id !== id);
  localStorage.setItem('manual_grades', JSON.stringify(filtered));
}

export function exportGradesToCSV(grades: ManualGrade[]): string {
  const headers = [
    'ID', 'Timestamp', 'Consumer ID', 'Query', 'Daypart', 'Recommendation',
    'Relevance Score', 'Serendipity Score', 'Weighted Score',
    'Primary Intent Match', 'Descriptive Traits Preserved', 'Category/Dietary Match',
    'Situational Suitability', 'Explicit Constraints Met', 'Profile Compliant',
    'Output Clarity', 'Mainstream Availability', 'Format Correctness', 'Conciseness',
    'Cuisine Dish Novelty', 'Low Discoverability', 'Familiar Ingredients New Context',
    'Context Fit While Novel', 'Aha Moment', 'Creates Curiosity',
    'Notes', 'Grader'
  ];

  const rows = grades.map(g => [
    g.id,
    new Date(g.timestamp).toISOString(),
    g.consumerId || '',
    g.query,
    g.daypart,
    g.recommendation,
    g.relevanceScore.toFixed(2),
    g.serendipityScore.toFixed(2),
    g.weightedScore.toFixed(2),
    g.relevanceChecks.primaryIntentMatch,
    g.relevanceChecks.descriptiveTraitsPreserved,
    g.relevanceChecks.categoryDietaryMatch,
    g.relevanceChecks.situationalSuitability,
    g.relevanceChecks.explicitConstraintsMet,
    g.relevanceChecks.profileCompliant,
    g.relevanceChecks.outputClarity,
    g.relevanceChecks.mainstreamAvailability,
    g.relevanceChecks.formatCorrectness,
    g.relevanceChecks.conciseness,
    g.serendipityChecks.cuisineDishNovelty,
    g.serendipityChecks.lowDiscoverability,
    g.serendipityChecks.familiarIngredientsNewContext,
    g.serendipityChecks.contextFitWhileNovel,
    g.serendipityChecks.ahaMoment,
    g.serendipityChecks.createsCuriosity,
    g.notes || '',
    g.grader || ''
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  return csvContent;
}
