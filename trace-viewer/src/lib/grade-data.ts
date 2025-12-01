import Papa from 'papaparse';
import { GradeRecord } from '@/lib/grade-types';

export async function loadGradeData(): Promise<GradeRecord[]> {
  const response = await fetch('/data.csv');
  const csvText = await response.text();

  return new Promise((resolve, reject) => {
    Papa.parse<GradeRecord>(csvText, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        const data = results.data.map((row: any) => ({
          consumer_id: Number(row.consumer_id),
          query: String(row.query || ''),
          daypart: String(row.daypart || ''),
          recommendation: String(row.recommendation || ''),
          relevance_format_score: Number(row.relevance_format_score),
          serendipity_score: Number(row.serendipity_score),
          weighted_score: Number(row.weighted_score),
          ndcg: Number(row.ndcg),
          set_score: Number(row.set_score),
          relevance_format_reasoning: String(row.relevance_format_reasoning || ''),
          serendipity_reasoning: String(row.serendipity_reasoning || ''),
          overall_reasoning: String(row.overall_reasoning || ''),
        }));
        resolve(data);
      },
      error: (error: Error) => {
        reject(error);
      }
    });
  });
}

export async function loadQRData(): Promise<GradeRecord[]> {
  const response = await fetch('/qr-data.csv');
  const csvText = await response.text();

  return new Promise((resolve, reject) => {
    Papa.parse<GradeRecord>(csvText, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        const data = results.data.map((row: any) => ({
          consumer_id: Number(row.consumer_id),
          query: String(row.query || ''),
          daypart: String(row.daypart || ''),
          recommendation: String(row.recommendation || ''),
          relevance_format_score: Number(row.relevance_format_score),
          serendipity_score: Number(row.serendipity_score),
          weighted_score: Number(row.weighted_score),
          ndcg: Number(row.ndcg),
          set_score: Number(row.set_score),
          relevance_format_reasoning: String(row.relevance_format_reasoning || ''),
          serendipity_reasoning: String(row.serendipity_reasoning || ''),
          overall_reasoning: String(row.overall_reasoning || ''),
        }));
        resolve(data);
      },
      error: (error: Error) => {
        reject(error);
      }
    });
  });
}

export function calculateStats(data: GradeRecord[]) {
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
