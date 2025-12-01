"use client";

import { useState } from 'react';
import { GradeRecord } from '@/lib/grade-types';
import { Search, ChevronDown, CheckCircle2 } from 'lucide-react';

interface DatasetSelectorProps {
  data: GradeRecord[];
  onSelect: (record: GradeRecord) => void;
  onClose: () => void;
}

export default function DatasetSelector({ data, onSelect, onClose }: DatasetSelectorProps) {
  const [search, setSearch] = useState('');
  const [selectedDaypart, setSelectedDaypart] = useState('All');

  const dayparts = ['All', ...Array.from(new Set(data.map(d => d.daypart)))];

  const filtered = data.filter(d => {
    const matchesSearch =
      d.query.toLowerCase().includes(search.toLowerCase()) ||
      d.recommendation.toLowerCase().includes(search.toLowerCase());
    const matchesDaypart = selectedDaypart === 'All' || d.daypart === selectedDaypart;
    return matchesSearch && matchesDaypart;
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fadeIn" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl max-w-4xl w-full max-h-[85vh] overflow-hidden shadow-2xl animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
          <h3 className="text-2xl font-bold mb-4">Load from Dataset</h3>

          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/70" size={20} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search query or recommendation..."
                className="w-full pl-10 pr-4 py-3 rounded-lg bg-white/20 backdrop-blur text-white placeholder-white/60 border border-white/30 focus:outline-none focus:ring-2 focus:ring-white/50"
                autoFocus
              />
            </div>

            <select
              value={selectedDaypart}
              onChange={(e) => setSelectedDaypart(e.target.value)}
              className="px-4 py-3 rounded-lg bg-white/20 backdrop-blur text-white border border-white/30 focus:outline-none focus:ring-2 focus:ring-white/50 cursor-pointer"
            >
              {dayparts.map(d => <option key={d} value={d} className="text-gray-900">{d}</option>)}
            </select>
          </div>

          <div className="text-sm text-white/80 mt-3">
            Showing {filtered.length} of {data.length} records
          </div>
        </div>

        <div className="overflow-y-auto max-h-[calc(85vh-180px)] p-6">
          <div className="grid grid-cols-1 gap-3">
            {filtered.map((record, idx) => (
              <button
                key={idx}
                onClick={() => {
                  onSelect(record);
                  onClose();
                }}
                className="text-left p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-200 hover:shadow-lg group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded text-xs font-medium">
                        {record.daypart}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Consumer {record.consumer_id}
                      </span>
                    </div>

                    <div className="font-semibold text-gray-900 dark:text-white mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {record.recommendation}
                    </div>

                    <div className="text-sm text-gray-600 dark:text-gray-400 truncate">
                      Query: "{record.query}"
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 dark:text-gray-400">Rel:</span>
                      <span className="font-semibold text-blue-600 dark:text-blue-400">{record.relevance_format_score.toFixed(1)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 dark:text-gray-400">Ser:</span>
                      <span className="font-semibold text-purple-600 dark:text-purple-400">{record.serendipity_score.toFixed(1)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 dark:text-gray-400">Wgt:</span>
                      <span className="font-semibold text-green-600 dark:text-green-400">{record.weighted_score.toFixed(1)}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <Search size={48} className="mx-auto mb-4 opacity-30" />
              <p>No records found matching your search</p>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-4">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
