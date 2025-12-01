export interface GradeRecord {
  consumer_id: number;
  query: string;
  daypart: string;
  recommendation: string;
  relevance_format_score: number;
  serendipity_score: number;
  weighted_score: number;
  ndcg: number;
  set_score: number;
  relevance_format_reasoning: string;
  serendipity_reasoning: string;
  overall_reasoning: string;
}

export interface FilterState {
  consumer_id: string;
  daypart: string;
  query: string;
  recommendation: string;
  relevance_range: [number, number];
  serendipity_range: [number, number];
  weighted_range: [number, number];
}

export interface Stats {
  total: number;
  avgRelevance: number;
  avgSerendipity: number;
  avgWeighted: number;
  avgNdcg: number;
  avgSetScore: number;
}
