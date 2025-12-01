"use client";

import { useEffect, useState } from 'react';
import { GradeRecord } from '@/lib/grade-types';
import { ManualGrade } from '@/lib/manual-grade-types';
import { getGradesFromLocalStorage } from '@/lib/grading-utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter, ZAxis } from 'recharts';
import { TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';

interface AnalyticsComparisonProps {
  datasetGrades: GradeRecord[];
}

export default function AnalyticsComparison({ datasetGrades }: AnalyticsComparisonProps) {
  const [manualGrades, setManualGrades] = useState<ManualGrade[]>([]);
  const [matchedPairs, setMatchedPairs] = useState<Array<{ dataset: GradeRecord; manual: ManualGrade }>>([]);

  useEffect(() => {
    const grades = getGradesFromLocalStorage();
    setManualGrades(grades);

    // Find matched pairs (same query + recommendation)
    const pairs: Array<{ dataset: GradeRecord; manual: ManualGrade }> = [];
    grades.forEach(manual => {
      const match = datasetGrades.find(
        d => d.query.toLowerCase() === manual.query.toLowerCase() &&
             d.recommendation.toLowerCase() === manual.recommendation.toLowerCase()
      );
      if (match) {
        pairs.push({ dataset: match, manual });
      }
    });
    setMatchedPairs(pairs);
  }, [datasetGrades]);

  if (manualGrades.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-black/10 dark:border-gray-700 p-12 text-center">
        <AlertCircle size={48} className="mx-auto mb-4 text-black/20 dark:text-white/20" />
        <h3 className="text-xl font-semibold mb-2 text-black dark:text-white">No Manual Grades Yet</h3>
        <p className="text-black/60 dark:text-white/60 mb-4">
          Start grading recommendations manually to see analytics and comparisons here.
        </p>
        <p className="text-sm text-black/50 dark:text-white/50">
          Switch to the "Manual Grading" tab to create your first grade.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OverallComparison datasetGrades={datasetGrades} manualGrades={manualGrades} />

      <ScoreDistributionComparison datasetGrades={datasetGrades} manualGrades={manualGrades} />

      {matchedPairs.length > 0 && (
        <>
          <MatchedPairsAnalysis pairs={matchedPairs} />
          <MatchedPairsTable pairs={matchedPairs} />
        </>
      )}

      <GraderInsights manualGrades={manualGrades} />
    </div>
  );
}

function OverallComparison({
  datasetGrades,
  manualGrades,
}: {
  datasetGrades: GradeRecord[];
  manualGrades: ManualGrade[];
}) {
  const datasetStats = {
    count: datasetGrades.length,
    avgRelevance: datasetGrades.reduce((sum, g) => sum + g.relevance_format_score, 0) / datasetGrades.length,
    avgSerendipity: datasetGrades.reduce((sum, g) => sum + g.serendipity_score, 0) / datasetGrades.length,
    avgWeighted: datasetGrades.reduce((sum, g) => sum + g.weighted_score, 0) / datasetGrades.length,
  };

  const manualStats = {
    count: manualGrades.length,
    avgRelevance: manualGrades.reduce((sum, g) => sum + g.relevanceScore, 0) / manualGrades.length,
    avgSerendipity: manualGrades.reduce((sum, g) => sum + g.serendipityScore, 0) / manualGrades.length,
    avgWeighted: manualGrades.reduce((sum, g) => sum + g.weightedScore, 0) / manualGrades.length,
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-black/10 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold mb-6 flex items-center gap-2 text-black dark:text-white">
        <div className="p-1.5 bg-black/5 dark:bg-white/5 rounded">
          <TrendingUp size={20} />
        </div>
        Overall Comparison
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-black/[0.02] dark:bg-white/[0.02] rounded-lg p-5 border border-black/5 dark:border-white/5">
          <h4 className="font-semibold text-black dark:text-white mb-4 text-sm">Dataset Grades (AI)</h4>
          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-black/60 dark:text-white/60">Total Records:</span>
              <span className="font-semibold text-black dark:text-white">{datasetStats.count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-black/60 dark:text-white/60">Avg Relevance:</span>
              <span className="font-semibold text-black dark:text-white">{datasetStats.avgRelevance.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-black/60 dark:text-white/60">Avg Serendipity:</span>
              <span className="font-semibold text-black dark:text-white">{datasetStats.avgSerendipity.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-black/60 dark:text-white/60">Avg Weighted:</span>
              <span className="font-semibold text-black dark:text-white">{datasetStats.avgWeighted.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="bg-black dark:bg-white rounded-lg p-5 border border-black dark:border-white">
          <h4 className="font-semibold text-white dark:text-black mb-4 text-sm">Manual Grades (Human)</h4>
          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-white/70 dark:text-black/70">Total Records:</span>
              <span className="font-semibold text-white dark:text-black">{manualStats.count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/70 dark:text-black/70">Avg Relevance:</span>
              <span className="font-semibold text-white dark:text-black">{manualStats.avgRelevance.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/70 dark:text-black/70">Avg Serendipity:</span>
              <span className="font-semibold text-white dark:text-black">{manualStats.avgSerendipity.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/70 dark:text-black/70">Avg Weighted:</span>
              <span className="font-semibold text-white dark:text-black">{manualStats.avgWeighted.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={[
              {
                metric: 'Relevance',
                Dataset: datasetStats.avgRelevance,
                Manual: manualStats.avgRelevance,
              },
              {
                metric: 'Serendipity',
                Dataset: datasetStats.avgSerendipity,
                Manual: manualStats.avgSerendipity,
              },
              {
                metric: 'Weighted',
                Dataset: datasetStats.avgWeighted,
                Manual: manualStats.avgWeighted,
              },
            ]}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="metric" />
            <YAxis domain={[0, 10]} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Dataset" fill="#9ca3af" name="Dataset (AI)" />
            <Bar dataKey="Manual" fill="#000000" name="Manual (Human)" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ScoreDistributionComparison({
  datasetGrades,
  manualGrades,
}: {
  datasetGrades: GradeRecord[];
  manualGrades: ManualGrade[];
}) {
  const createHistogram = (scores: number[]) => {
    const bins: { [key: number]: number } = {};
    for (let i = 0; i <= 10; i++) bins[i] = 0;
    scores.forEach(score => {
      const bin = Math.round(score);
      if (bin >= 0 && bin <= 10) bins[bin]++;
    });
    return Object.entries(bins).map(([score, count]) => ({
      score: Number(score),
      count
    }));
  };

  const datasetRelevance = createHistogram(datasetGrades.map(g => g.relevance_format_score));
  const manualRelevance = createHistogram(manualGrades.map(g => g.relevanceScore));

  const datasetSerendipity = createHistogram(datasetGrades.map(g => g.serendipity_score));
  const manualSerendipity = createHistogram(manualGrades.map(g => g.serendipityScore));

  // Merge histograms for comparison
  const relevanceComparison = datasetRelevance.map((d, i) => ({
    score: d.score,
    Dataset: d.count,
    Manual: manualRelevance[i].count,
  }));

  const serendipityComparison = datasetSerendipity.map((d, i) => ({
    score: d.score,
    Dataset: d.count,
    Manual: manualSerendipity[i].count,
  }));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-black/10 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold mb-6 text-black dark:text-white">Score Distribution Comparison</h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h4 className="font-semibold mb-4 text-sm text-black dark:text-white">Relevance Score Distribution</h4>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={relevanceComparison}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="score" label={{ value: 'Score', position: 'insideBottom', offset: -5 }} />
              <YAxis label={{ value: 'Count', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Dataset" fill="#9ca3af" name="Dataset (AI)" />
              <Bar dataKey="Manual" fill="#000000" name="Manual (Human)" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div>
          <h4 className="font-semibold mb-4 text-sm text-black dark:text-white">Serendipity Score Distribution</h4>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={serendipityComparison}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="score" label={{ value: 'Score', position: 'insideBottom', offset: -5 }} />
              <YAxis label={{ value: 'Count', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Dataset" fill="#6b7280" name="Dataset (AI)" />
              <Bar dataKey="Manual" fill="#1f2937" name="Manual (Human)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function MatchedPairsAnalysis({
  pairs,
}: {
  pairs: Array<{ dataset: GradeRecord; manual: ManualGrade }>;
}) {
  const relevanceDiffs = pairs.map(p => p.dataset.relevance_format_score - p.manual.relevanceScore);
  const serendipityDiffs = pairs.map(p => p.dataset.serendipity_score - p.manual.serendipityScore);
  const weightedDiffs = pairs.map(p => p.dataset.weighted_score - p.manual.weightedScore);

  const avgRelevanceDiff = relevanceDiffs.reduce((a, b) => a + b, 0) / relevanceDiffs.length;
  const avgSerendipityDiff = serendipityDiffs.reduce((a, b) => a + b, 0) / serendipityDiffs.length;
  const avgWeightedDiff = weightedDiffs.reduce((a, b) => a + b, 0) / weightedDiffs.length;

  const scatterData = pairs.map(p => ({
    datasetRelevance: p.dataset.relevance_format_score,
    manualRelevance: p.manual.relevanceScore,
    datasetSerendipity: p.dataset.serendipity_score,
    manualSerendipity: p.manual.serendipityScore,
    query: p.dataset.query,
    recommendation: p.dataset.recommendation,
  }));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-black/10 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold mb-6 flex items-center gap-2 text-black dark:text-white">
        <div className="p-1.5 bg-black/5 dark:bg-white/5 rounded">
          <CheckCircle size={20} />
        </div>
        Matched Pairs Analysis ({pairs.length} pairs)
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-black/[0.02] dark:bg-white/[0.02] rounded-lg p-4 border border-black/5 dark:border-white/5">
          <div className="text-xs text-black/60 dark:text-white/60 mb-1.5 font-medium">Avg Relevance Difference</div>
          <div className="text-2xl font-bold text-black dark:text-white">
            {avgRelevanceDiff > 0 ? '+' : ''}{avgRelevanceDiff.toFixed(2)}
          </div>
          <div className="text-xs text-black/50 dark:text-white/50 mt-1">
            {avgRelevanceDiff > 0 ? 'AI scores higher' : 'Human scores higher'}
          </div>
        </div>

        <div className="bg-black/[0.02] dark:bg-white/[0.02] rounded-lg p-4 border border-black/5 dark:border-white/5">
          <div className="text-xs text-black/60 dark:text-white/60 mb-1.5 font-medium">Avg Serendipity Difference</div>
          <div className="text-2xl font-bold text-black dark:text-white">
            {avgSerendipityDiff > 0 ? '+' : ''}{avgSerendipityDiff.toFixed(2)}
          </div>
          <div className="text-xs text-black/50 dark:text-white/50 mt-1">
            {avgSerendipityDiff > 0 ? 'AI scores higher' : 'Human scores higher'}
          </div>
        </div>

        <div className="bg-black dark:bg-white rounded-lg p-4">
          <div className="text-xs text-white/70 dark:text-black/70 mb-1.5 font-medium">Avg Weighted Difference</div>
          <div className="text-2xl font-bold text-white dark:text-black">
            {avgWeightedDiff > 0 ? '+' : ''}{avgWeightedDiff.toFixed(2)}
          </div>
          <div className="text-xs text-white/60 dark:text-black/60 mt-1">
            {avgWeightedDiff > 0 ? 'AI scores higher' : 'Human scores higher'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h4 className="font-semibold mb-4 text-sm text-black dark:text-white">Relevance: AI vs Human</h4>
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="datasetRelevance" type="number" domain={[0, 10]} label={{ value: 'Dataset (AI)', position: 'insideBottom', offset: -5 }} />
              <YAxis dataKey="manualRelevance" type="number" domain={[0, 10]} label={{ value: 'Manual (Human)', angle: -90, position: 'insideLeft' }} />
              <Tooltip
                content={({ payload }) => {
                  if (payload && payload.length > 0) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-white dark:bg-gray-900 border border-black/10 dark:border-gray-700 rounded p-3 shadow-sm">
                        <p className="font-semibold text-sm text-black dark:text-white">{data.recommendation}</p>
                        <p className="text-xs text-black/60 dark:text-white/60">AI: {data.datasetRelevance} | Human: {data.manualRelevance}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Scatter data={scatterData} fill="#000000" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        <div>
          <h4 className="font-semibold mb-4 text-sm text-black dark:text-white">Serendipity: AI vs Human</h4>
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="datasetSerendipity" type="number" domain={[0, 10]} label={{ value: 'Dataset (AI)', position: 'insideBottom', offset: -5 }} />
              <YAxis dataKey="manualSerendipity" type="number" domain={[0, 10]} label={{ value: 'Manual (Human)', angle: -90, position: 'insideLeft' }} />
              <Tooltip
                content={({ payload }) => {
                  if (payload && payload.length > 0) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-white dark:bg-gray-900 border border-black/10 dark:border-gray-700 rounded p-3 shadow-sm">
                        <p className="font-semibold text-sm text-black dark:text-white">{data.recommendation}</p>
                        <p className="text-xs text-black/60 dark:text-white/60">AI: {data.datasetSerendipity} | Human: {data.manualSerendipity}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Scatter data={scatterData} fill="#4b5563" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function MatchedPairsTable({
  pairs,
}: {
  pairs: Array<{ dataset: GradeRecord; manual: ManualGrade }>;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-black/10 dark:border-gray-700 overflow-hidden">
      <div className="p-5 border-b border-black/10 dark:border-gray-700">
        <h3 className="text-base font-semibold text-black dark:text-white">Matched Pairs Details</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] dark:bg-white/[0.02]">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-black dark:text-white text-xs">Query</th>
              <th className="px-4 py-3 text-left font-semibold text-black dark:text-white text-xs">Recommendation</th>
              <th className="px-4 py-3 text-center font-semibold text-black dark:text-white text-xs">AI Rel</th>
              <th className="px-4 py-3 text-center font-semibold text-black dark:text-white text-xs">Human Rel</th>
              <th className="px-4 py-3 text-center font-semibold text-black dark:text-white text-xs">Δ Rel</th>
              <th className="px-4 py-3 text-center font-semibold text-black dark:text-white text-xs">AI Ser</th>
              <th className="px-4 py-3 text-center font-semibold text-black dark:text-white text-xs">Human Ser</th>
              <th className="px-4 py-3 text-center font-semibold text-black dark:text-white text-xs">Δ Ser</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 dark:divide-white/5">
            {pairs.map((pair, idx) => {
              const relDiff = pair.dataset.relevance_format_score - pair.manual.relevanceScore;
              const serDiff = pair.dataset.serendipity_score - pair.manual.serendipityScore;

              return (
                <tr key={idx} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 max-w-xs truncate text-black dark:text-white">{pair.dataset.query}</td>
                  <td className="px-4 py-3 font-medium text-black dark:text-white">{pair.dataset.recommendation}</td>
                  <td className="px-4 py-3 text-center text-black/80 dark:text-white/80">{pair.dataset.relevance_format_score.toFixed(1)}</td>
                  <td className="px-4 py-3 text-center text-black/80 dark:text-white/80">{pair.manual.relevanceScore.toFixed(1)}</td>
                  <td className={`px-4 py-3 text-center font-semibold ${relDiff > 0 ? 'text-black dark:text-white' : relDiff < 0 ? 'text-gray-600 dark:text-gray-400' : 'text-black/60 dark:text-white/60'}`}>
                    {relDiff > 0 ? '+' : ''}{relDiff.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-center text-black/80 dark:text-white/80">{pair.dataset.serendipity_score.toFixed(1)}</td>
                  <td className="px-4 py-3 text-center text-black/80 dark:text-white/80">{pair.manual.serendipityScore.toFixed(1)}</td>
                  <td className={`px-4 py-3 text-center font-semibold ${serDiff > 0 ? 'text-black dark:text-white' : serDiff < 0 ? 'text-gray-600 dark:text-gray-400' : 'text-black/60 dark:text-white/60'}`}>
                    {serDiff > 0 ? '+' : ''}{serDiff.toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GraderInsights({ manualGrades }: { manualGrades: ManualGrade[] }) {
  const graders = Array.from(new Set(manualGrades.map(g => g.grader).filter(Boolean)));

  const perfectRelevance = manualGrades.filter(g => g.relevanceScore === 10).length;
  const perfectSerendipity = manualGrades.filter(g => g.serendipityScore === 10).length;
  const gateViolations = manualGrades.filter(g => !g.relevanceChecks.profileCompliant).length;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-black/10 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold mb-6 text-black dark:text-white">Manual Grading Insights</h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-black/[0.02] dark:bg-white/[0.02] rounded-lg p-4 border border-black/5 dark:border-white/5">
          <div className="text-xs text-black/60 dark:text-white/60 mb-1.5 font-medium">Perfect Relevance Scores</div>
          <div className="text-3xl font-bold text-black dark:text-white">{perfectRelevance}</div>
          <div className="text-xs text-black/50 dark:text-white/50 mt-1">
            {((perfectRelevance / manualGrades.length) * 100).toFixed(1)}% of all grades
          </div>
        </div>

        <div className="bg-black/[0.02] dark:bg-white/[0.02] rounded-lg p-4 border border-black/5 dark:border-white/5">
          <div className="text-xs text-black/60 dark:text-white/60 mb-1.5 font-medium">Perfect Serendipity Scores</div>
          <div className="text-3xl font-bold text-black dark:text-white">{perfectSerendipity}</div>
          <div className="text-xs text-black/50 dark:text-white/50 mt-1">
            {((perfectSerendipity / manualGrades.length) * 100).toFixed(1)}% of all grades
          </div>
        </div>

        <div className="bg-black dark:bg-white rounded-lg p-4">
          <div className="text-xs text-white/70 dark:text-black/70 mb-1.5 font-medium">GATE Violations</div>
          <div className="text-3xl font-bold text-white dark:text-black">{gateViolations}</div>
          <div className="text-xs text-white/60 dark:text-black/60 mt-1">
            Profile non-compliant (score = 0)
          </div>
        </div>
      </div>

      {graders.length > 0 && (
        <div className="mt-6 p-4 bg-black/[0.02] dark:bg-white/[0.02] rounded-lg border border-black/5 dark:border-white/5">
          <h4 className="font-semibold mb-3 text-sm text-black dark:text-white">Active Graders</h4>
          <div className="flex flex-wrap gap-2">
            {graders.map((grader, idx) => (
              <span key={idx} className="px-3 py-1.5 bg-black/5 dark:bg-white/5 text-black dark:text-white rounded-lg text-sm font-medium">
                {grader}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
