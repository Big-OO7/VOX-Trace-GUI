"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { FileDown, Loader2, Search, Target, TrendingUp } from "lucide-react";
import type { QRRecord, QRStats } from "@/lib/qr-utils";
import { calculateQRStats } from "@/lib/qr-utils";

const cn = (...classes: Array<string | undefined | null | false>) =>
  classes.filter(Boolean).join(" ");

const friendlyDaypart = (key: string) =>
  key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const ScoreBadge = ({ score }: { score: number }) => {
  let colorClass = "bg-gray-100 text-gray-800";

  if (score >= 9) {
    colorClass = "bg-black text-white";
  } else if (score >= 7) {
    colorClass = "bg-gray-700 text-white";
  } else if (score >= 5) {
    colorClass = "bg-gray-400 text-black";
  } else {
    colorClass = "bg-gray-200 text-gray-800";
  }

  return (
    <span className={`px-2 py-1 rounded font-medium text-xs ${colorClass}`}>
      {score.toFixed(1)}
    </span>
  );
};

const StatCard = ({
  label,
  value,
  color = "gray",
}: {
  label: string;
  value: string;
  color?: string;
}) => {
  const colorClasses = {
    gray: "bg-white border-black/10",
    blue: "bg-white border-black/10",
    purple: "bg-white border-black/10",
    green: "bg-white border-black/10",
    orange: "bg-white border-black/10",
    pink: "bg-white border-black/10",
  };

  return (
    <div
      className={`${colorClasses[color as keyof typeof colorClasses]} border rounded-lg p-4`}
    >
      <div className="text-xs font-medium uppercase tracking-wider text-black/50 mb-1">
        {label}
      </div>
      <div className="text-2xl font-bold text-black">{value}</div>
    </div>
  );
};

const DetailModal = ({
  record,
  onClose,
}: {
  record: QRRecord | null;
  onClose: () => void;
}) => {
  if (!record) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-black/10 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-black mb-2">
                {record.recommendation}
              </h2>
              <p className="text-sm text-black/60">
                Query: {record.query} • {friendlyDaypart(record.daypart)}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-black/40 hover:text-black transition"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Scores */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-black/10 bg-white p-4">
              <div className="text-xs font-medium uppercase tracking-wider text-black/50 mb-1">
                Relevance
              </div>
              <div className="text-3xl font-bold text-black">
                {record.relevance_format_score.toFixed(1)}
              </div>
            </div>
            <div className="rounded-lg border border-black/10 bg-white p-4">
              <div className="text-xs font-medium uppercase tracking-wider text-black/50 mb-1">
                Serendipity
              </div>
              <div className="text-3xl font-bold text-black">
                {record.serendipity_score.toFixed(1)}
              </div>
            </div>
            <div className="rounded-lg border border-black/10 bg-black p-4">
              <div className="text-xs font-medium uppercase tracking-wider text-white/70 mb-1">
                Weighted
              </div>
              <div className="text-3xl font-bold text-white">
                {record.weighted_score.toFixed(1)}
              </div>
            </div>
          </div>

          {/* Reasonings */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-black mb-2">
                Relevance & Format Reasoning
              </h3>
              <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4">
                <p className="text-sm text-black/80 leading-relaxed">
                  {record.relevance_format_reasoning}
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-black mb-2">
                Serendipity Reasoning
              </h3>
              <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4">
                <p className="text-sm text-black/80 leading-relaxed">
                  {record.serendipity_reasoning}
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-black mb-2">
                Overall Reasoning
              </h3>
              <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4">
                <p className="text-sm text-black/80 leading-relaxed">
                  {record.overall_reasoning}
                </p>
              </div>
            </div>
          </div>

          {/* Additional Metrics */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-black/10 bg-black/[0.02] p-3">
              <div className="text-xs text-black/50">NDCG</div>
              <div className="text-lg font-semibold text-black">
                {record.ndcg.toFixed(3)}
              </div>
            </div>
            <div className="rounded-lg border border-black/10 bg-black/[0.02] p-3">
              <div className="text-xs text-black/50">Set Score</div>
              <div className="text-lg font-semibold text-black">
                {record.set_score.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function QREvaluation() {
  const [records, setRecords] = useState<QRRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDaypart, setSelectedDaypart] = useState<string>("All");
  const [selectedRecord, setSelectedRecord] = useState<QRRecord | null>(null);

  const loadData = useCallback(async () => {
    try {
      const response = await fetch("/qr-data.csv");
      const csvText = await response.text();

      Papa.parse<QRRecord>(csvText, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim(),
        complete: (results) => {
          const data = results.data.map((row: any) => ({
            consumer_id: Number(row.consumer_id),
            query: String(row.query || ""),
            daypart: String(row.daypart || ""),
            recommendation: String(row.recommendation || ""),
            relevance_format_score: Number(row.relevance_format_score),
            serendipity_score: Number(row.serendipity_score),
            weighted_score: Number(row.weighted_score),
            ndcg: Number(row.ndcg),
            set_score: Number(row.set_score),
            relevance_format_reasoning: String(
              row.relevance_format_reasoning || "",
            ),
            serendipity_reasoning: String(row.serendipity_reasoning || ""),
            overall_reasoning: String(row.overall_reasoning || ""),
          }));
          setRecords(data);
          setIsLoading(false);
        },
        error: (error: Error) => {
          setErrorMessage(error.message);
          setIsLoading(false);
        },
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load data",
      );
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredRecords = useMemo(() => {
    let filtered = records;

    if (selectedDaypart !== "All") {
      filtered = filtered.filter((r) => r.daypart === selectedDaypart);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.query.toLowerCase().includes(term) ||
          r.recommendation.toLowerCase().includes(term) ||
          r.consumer_id.toString().includes(term),
      );
    }

    return filtered;
  }, [records, searchTerm, selectedDaypart]);

  const stats = useMemo(() => calculateQRStats(filteredRecords), [filteredRecords]);

  const dayparts = useMemo(() => {
    const unique = [...new Set(records.map((r) => r.daypart))];
    return unique.sort();
  }, [records]);

  const exportToCSV = () => {
    const csv = Papa.unparse(filteredRecords);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qr-evaluation-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-black/40 mx-auto mb-4" />
          <p className="text-sm text-black/60">Loading QR evaluation data...</p>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="rounded-lg border border-gray-300 bg-gray-50 p-6">
        <p className="text-sm text-black">Error: {errorMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg border border-black/10 bg-white p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-black/5 rounded-lg shadow-sm">
            <Target className="w-8 h-8 text-black" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-black mb-2">
              Query Rewriting Evaluation
            </h2>
            <p className="text-sm text-black/70 mb-3">
              Comprehensive analysis of query rewriting performance across
              relevance, serendipity, and weighted metrics.
            </p>
            <div className="flex items-center gap-2 text-xs text-black/60">
              <TrendingUp className="w-4 h-4" />
              <span>{records.length} QR evaluations from real user queries</span>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-black/10 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black/40" />
            <input
              type="text"
              placeholder="Search query or recommendation..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10"
            />
          </div>
          <select
            value={selectedDaypart}
            onChange={(e) => setSelectedDaypart(e.target.value)}
            className="px-4 py-2 text-sm border border-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10"
          >
            <option value="All">All Dayparts</option>
            {dayparts.map((d) => (
              <option key={d} value={d}>
                {friendlyDaypart(d)}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={exportToCSV}
          className="inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black hover:bg-black/5 transition"
        >
          <FileDown className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Total Records" value={stats.total.toString()} />
        <StatCard
          label="Avg Relevance"
          value={stats.avgRelevance.toFixed(2)}
          color="blue"
        />
        <StatCard
          label="Avg Serendipity"
          value={stats.avgSerendipity.toFixed(2)}
          color="purple"
        />
        <StatCard
          label="Avg Weighted"
          value={stats.avgWeighted.toFixed(2)}
          color="green"
        />
        <StatCard
          label="Avg NDCG"
          value={stats.avgNdcg.toFixed(3)}
          color="orange"
        />
        <StatCard
          label="Avg Set Score"
          value={stats.avgSetScore.toFixed(2)}
          color="pink"
        />
      </div>

      {/* Data Table */}
      <div className="rounded-lg border border-black/10 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-black/10 bg-black/[0.02]">
          <h3 className="text-sm font-semibold text-black">
            QR Evaluation Results ({filteredRecords.length} records)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-black/[0.02] border-b border-black/10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-black/70 uppercase tracking-wider">
                  Consumer
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-black/70 uppercase tracking-wider">
                  Query
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-black/70 uppercase tracking-wider">
                  Daypart
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-black/70 uppercase tracking-wider">
                  Recommendation
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-black/70 uppercase tracking-wider">
                  Relevance
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-black/70 uppercase tracking-wider">
                  Serendipity
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-black/70 uppercase tracking-wider">
                  Weighted
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-black/70 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {filteredRecords.map((record, idx) => (
                <tr
                  key={idx}
                  className="hover:bg-black/[0.02] transition cursor-pointer"
                  onClick={() => setSelectedRecord(record)}
                >
                  <td className="px-4 py-3 text-sm text-black">
                    {record.consumer_id}
                  </td>
                  <td className="px-4 py-3 text-sm text-black max-w-xs truncate">
                    {record.query}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="px-2 py-1 bg-gray-100 text-black rounded text-xs">
                      {friendlyDaypart(record.daypart)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-black">
                    {record.recommendation}
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    <ScoreBadge score={record.relevance_format_score} />
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    <ScoreBadge score={record.serendipity_score} />
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    <ScoreBadge score={record.weighted_score} />
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRecord(record);
                      }}
                      className="text-xs text-black/60 hover:text-black transition"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      <DetailModal
        record={selectedRecord}
        onClose={() => setSelectedRecord(null)}
      />
    </div>
  );
}
