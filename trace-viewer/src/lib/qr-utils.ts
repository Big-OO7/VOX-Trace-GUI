export interface QRRecord {
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

export interface QRStats {
  total: number;
  avgRelevance: number;
  avgSerendipity: number;
  avgWeighted: number;
  avgNdcg: number;
  avgSetScore: number;
}

export function calculateQRStats(data: QRRecord[]): QRStats {
  if (data.length === 0) {
    return {
      total: 0,
      avgRelevance: 0,
      avgSerendipity: 0,
      avgWeighted: 0,
      avgNdcg: 0,
      avgSetScore: 0,
    };
  }

  return {
    total: data.length,
    avgRelevance: data.reduce((sum, r) => sum + r.relevance_format_score, 0) / data.length,
    avgSerendipity: data.reduce((sum, r) => sum + r.serendipity_score, 0) / data.length,
    avgWeighted: data.reduce((sum, r) => sum + r.weighted_score, 0) / data.length,
    avgNdcg: data.reduce((sum, r) => sum + r.ndcg, 0) / data.length,
    avgSetScore: data.reduce((sum, r) => sum + r.set_score, 0) / data.length,
  };
}
