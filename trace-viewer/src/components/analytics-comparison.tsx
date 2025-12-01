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
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-700 p-12 text-center">
        <AlertCircle size={48} className="mx-auto mb-4 text-gray-400" />
        <h3 className="text-xl font-semibold mb-2">No Manual Grades Yet</h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Start grading recommendations manually to see analytics and comparisons here.
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-500">
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
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-700 p-6">
      <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
        <TrendingUp size={24} className="text-blue-600 dark:text-blue-400" />
        Overall Comparison
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
          <h4 className="font-semibold text-blue-900 dark:text-blue-300 mb-3">Dataset Grades (AI)</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Total Records:</span>
              <span className="font-semibold">{datasetStats.count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Avg Relevance:</span>
              <span className="font-semibold">{datasetStats.avgRelevance.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Avg Serendipity:</span>
              <span className="font-semibold">{datasetStats.avgSerendipity.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Avg Weighted:</span>
              <span className="font-semibold">{datasetStats.avgWeighted.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
          <h4 className="font-semibold text-green-900 dark:text-green-300 mb-3">Manual Grades (Human)</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Total Records:</span>
              <span className="font-semibold">{manualStats.count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Avg Relevance:</span>
              <span className="font-semibold">{manualStats.avgRelevance.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Avg Serendipity:</span>
              <span className="font-semibold">{manualStats.avgSerendipity.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Avg Weighted:</span>
              <span className="font-semibold">{manualStats.avgWeighted.toFixed(2)}</span>
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
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="metric" />
            <YAxis domain={[0, 10]} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Dataset" fill="#3b82f6" name="Dataset (AI)" />
            <Bar dataKey="Manual" fill="#10b981" name="Manual (Human)" />
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
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-700 p-6">
      <h3 className="text-xl font-semibold mb-4">Score Distribution Comparison</h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h4 className="font-semibold mb-3">Relevance Score Distribution</h4>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={relevanceComparison}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="score" label={{ value: 'Score', position: 'insideBottom', offset: -5 }} />
              <YAxis label={{ value: 'Count', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Dataset" fill="#3b82f6" name="Dataset (AI)" />
              <Bar dataKey="Manual" fill="#10b981" name="Manual (Human)" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div>
          <h4 className="font-semibold mb-3">Serendipity Score Distribution</h4>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={serendipityComparison}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="score" label={{ value: 'Score', position: 'insideBottom', offset: -5 }} />
              <YAxis label={{ value: 'Count', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Dataset" fill="#a855f7" name="Dataset (AI)" />
              <Bar dataKey="Manual" fill="#ec4899" name="Manual (Human)" />
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
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-700 p-6">
      <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
        <CheckCircle size={24} className="text-green-600 dark:text-green-400" />
        Matched Pairs Analysis ({pairs.length} pairs)
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Avg Relevance Difference</div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {avgRelevanceDiff > 0 ? '+' : ''}{avgRelevanceDiff.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            {avgRelevanceDiff > 0 ? 'AI scores higher' : 'Human scores higher'}
          </div>
        </div>

        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Avg Serendipity Difference</div>
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {avgSerendipityDiff > 0 ? '+' : ''}{avgSerendipityDiff.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            {avgSerendipityDiff > 0 ? 'AI scores higher' : 'Human scores higher'}
          </div>
        </div>

        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Avg Weighted Difference</div>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {avgWeightedDiff > 0 ? '+' : ''}{avgWeightedDiff.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            {avgWeightedDiff > 0 ? 'AI scores higher' : 'Human scores higher'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h4 className="font-semibold mb-3">Relevance: AI vs Human</h4>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="datasetRelevance" type="number" domain={[0, 10]} label={{ value: 'Dataset (AI)', position: 'insideBottom', offset: -5 }} />
              <YAxis dataKey="manualRelevance" type="number" domain={[0, 10]} label={{ value: 'Manual (Human)', angle: -90, position: 'insideLeft' }} />
              <Tooltip
                content={({ payload }) => {
                  if (payload && payload.length > 0) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded p-3 shadow-lg">
                        <p className="font-semibold text-sm">{data.recommendation}</p>
                        <p className="text-xs">AI: {data.datasetRelevance} | Human: {data.manualRelevance}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Scatter data={scatterData} fill="#3b82f6" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        <div>
          <h4 className="font-semibold mb-3">Serendipity: AI vs Human</h4>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="datasetSerendipity" type="number" domain={[0, 10]} label={{ value: 'Dataset (AI)', position: 'insideBottom', offset: -5 }} />
              <YAxis dataKey="manualSerendipity" type="number" domain={[0, 10]} label={{ value: 'Manual (Human)', angle: -90, position: 'insideLeft' }} />
              <Tooltip
                content={({ payload }) => {
                  if (payload && payload.length > 0) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded p-3 shadow-lg">
                        <p className="font-semibold text-sm">{data.recommendation}</p>
                        <p className="text-xs">AI: {data.datasetSerendipity} | Human: {data.manualSerendipity}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Scatter data={scatterData} fill="#a855f7" />
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
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-700 overflow-hidden">
      <div className="p-4 border-b border-gray-300 dark:border-gray-700">
        <h3 className="text-lg font-semibold">Matched Pairs Details</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Query</th>
              <th className="px-4 py-3 text-left font-semibold">Recommendation</th>
              <th className="px-4 py-3 text-center font-semibold">AI Rel</th>
              <th className="px-4 py-3 text-center font-semibold">Human Rel</th>
              <th className="px-4 py-3 text-center font-semibold">Δ Rel</th>
              <th className="px-4 py-3 text-center font-semibold">AI Ser</th>
              <th className="px-4 py-3 text-center font-semibold">Human Ser</th>
              <th className="px-4 py-3 text-center font-semibold">Δ Ser</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {pairs.map((pair, idx) => {
              const relDiff = pair.dataset.relevance_format_score - pair.manual.relevanceScore;
              const serDiff = pair.dataset.serendipity_score - pair.manual.serendipityScore;

              return (
                <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 max-w-xs truncate">{pair.dataset.query}</td>
                  <td className="px-4 py-3 font-medium">{pair.dataset.recommendation}</td>
                  <td className="px-4 py-3 text-center">{pair.dataset.relevance_format_score.toFixed(1)}</td>
                  <td className="px-4 py-3 text-center">{pair.manual.relevanceScore.toFixed(1)}</td>
                  <td className={`px-4 py-3 text-center font-semibold ${relDiff > 0 ? 'text-blue-600' : relDiff < 0 ? 'text-green-600' : ''}`}>
                    {relDiff > 0 ? '+' : ''}{relDiff.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-center">{pair.dataset.serendipity_score.toFixed(1)}</td>
                  <td className="px-4 py-3 text-center">{pair.manual.serendipityScore.toFixed(1)}</td>
                  <td className={`px-4 py-3 text-center font-semibold ${serDiff > 0 ? 'text-purple-600' : serDiff < 0 ? 'text-pink-600' : ''}`}>
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
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-700 p-6">
      <h3 className="text-xl font-semibold mb-4">Manual Grading Insights</h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Perfect Relevance Scores</div>
          <div className="text-3xl font-bold text-green-600 dark:text-green-400">{perfectRelevance}</div>
          <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            {((perfectRelevance / manualGrades.length) * 100).toFixed(1)}% of all grades
          </div>
        </div>

        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Perfect Serendipity Scores</div>
          <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">{perfectSerendipity}</div>
          <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            {((perfectSerendipity / manualGrades.length) * 100).toFixed(1)}% of all grades
          </div>
        </div>

        <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">GATE Violations</div>
          <div className="text-3xl font-bold text-red-600 dark:text-red-400">{gateViolations}</div>
          <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            Profile non-compliant (score = 0)
          </div>
        </div>
      </div>

      {graders.length > 0 && (
        <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded">
          <h4 className="font-semibold mb-2">Active Graders</h4>
          <div className="flex flex-wrap gap-2">
            {graders.map((grader, idx) => (
              <span key={idx} className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded-full text-sm">
                {grader}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
