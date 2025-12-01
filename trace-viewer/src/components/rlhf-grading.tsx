"use client";

import { useState, useEffect } from 'react';
import { GradeRecord } from '@/lib/grade-types';
import { ManualGrade, RelevanceChecks, SerendipityChecks, NOVELTY_TIERS } from '@/lib/manual-grade-types';
import {
  calculateRelevanceScore,
  calculateSerendipityScore,
  calculateWeightedScore,
  saveGradeToLocalStorage,
  getGradesFromLocalStorage,
  exportGradesToCSV,
} from '@/lib/grading-utils';
import { ChevronLeft, ChevronRight, Check, SkipForward, Download, User, List, Sparkles, Eye, EyeOff, PlayCircle } from 'lucide-react';
import Toast from './toast';
import DetailedRubric from './detailedrubric';

interface RLHFGradingProps {
  datasetGrades: GradeRecord[];
}

export default function RLHFGrading({ datasetGrades }: RLHFGradingProps) {
  // Selection state
  const [selectedConsumerId, setSelectedConsumerId] = useState<string>('');
  const [batchItems, setBatchItems] = useState<GradeRecord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [gradingStarted, setGradingStarted] = useState(false);

  // Grading state
  const [currentGrade, setCurrentGrade] = useState<ManualGrade | null>(null);
  const [completedGrades, setCompletedGrades] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [compactView, setCompactView] = useState(false);
  const [showRubric, setShowRubric] = useState(true);

  // Get unique consumer IDs
  const consumerIds = Array.from(new Set(datasetGrades.map(d => d.consumer_id.toString()))).sort();

  // When consumer is selected, load their batch
  useEffect(() => {
    if (selectedConsumerId) {
      const items = datasetGrades.filter(d => d.consumer_id.toString() === selectedConsumerId);
      setBatchItems(items);
      setCurrentIndex(0);
      setGradingStarted(false);
      setCompletedGrades(new Set());
    } else {
      setBatchItems([]);
    }
  }, [selectedConsumerId, datasetGrades]);

  // Load current item into grading form
  const loadCurrentItem = () => {
    if (batchItems.length === 0 || currentIndex >= batchItems.length) return;

    const item = batchItems[currentIndex];
    const newGrade: ManualGrade = {
      id: `grade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      consumerId: item.consumer_id.toString(),
      query: item.query,
      daypart: item.daypart,
      recommendation: item.recommendation,
      relevanceChecks: {
        primaryIntentMatch: false,
        descriptiveTraitsPreserved: false,
        categoryDietaryMatch: false,
        situationalSuitability: false,
        explicitConstraintsMet: false,
        profileCompliant: true,
        outputClarity: false,
        mainstreamAvailability: false,
        formatCorrectness: false,
        conciseness: false,
      },
      serendipityChecks: {
        cuisineDishNovelty: 0,
        lowDiscoverability: false,
        familiarIngredientsNewContext: true,
        contextFitWhileNovel: false,
        ahaMoment: false,
        createsCuriosity: false,
      },
      relevanceScore: 0,
      serendipityScore: 0,
      weightedScore: 0,
    };
    setCurrentGrade(newGrade);
  };

  useEffect(() => {
    if (gradingStarted) {
      loadCurrentItem();
    }
  }, [currentIndex, gradingStarted]);

  const handleStartGrading = () => {
    if (batchItems.length === 0) {
      showToast('Please select a consumer first', 'error');
      return;
    }
    setGradingStarted(true);
    loadCurrentItem();
  };

  const handleSaveAndNext = () => {
    if (!currentGrade) return;

    const relevanceScore = calculateRelevanceScore(currentGrade.relevanceChecks);
    const serendipityScore = calculateSerendipityScore(currentGrade.serendipityChecks);
    const weightedScore = calculateWeightedScore(relevanceScore, serendipityScore);

    const gradeToSave: ManualGrade = {
      ...currentGrade,
      relevanceScore,
      serendipityScore,
      weightedScore,
      timestamp: Date.now(),
    };

    saveGradeToLocalStorage(gradeToSave);
    setCompletedGrades(new Set([...completedGrades, currentIndex]));

    if (currentIndex < batchItems.length - 1) {
      setCurrentIndex(currentIndex + 1);
      // Quick toast - auto-dismisses fast
      setToast({ message: '✓ Saved', type: 'success' });
      setTimeout(() => setToast(null), 800);
    } else {
      showToast('Batch complete!', 'success');
      setGradingStarted(false);
    }
  };

  const handleSkip = () => {
    if (currentIndex < batchItems.length - 1) {
      setCurrentIndex(currentIndex + 1);
      // Quick skip feedback
      setToast({ message: 'Skipped', type: 'info' });
      setTimeout(() => setToast(null), 600);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleExportBatch = () => {
    const allGrades = getGradesFromLocalStorage();
    const batchGrades = allGrades.filter(g => g.consumerId === selectedConsumerId);

    if (batchGrades.length === 0) {
      showToast('No grades found for this consumer', 'error');
      return;
    }

    const csv = exportGradesToCSV(batchGrades);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `consumer-${selectedConsumerId}-grades-${Date.now()}.csv`;
    a.click();
    showToast('Batch exported successfully!', 'success');
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
  };

  const progress = batchItems.length > 0 ? ((completedGrades.size / batchItems.length) * 100).toFixed(0) : 0;

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {!gradingStarted ? (
        <BatchSelector
          consumerIds={consumerIds}
          selectedConsumerId={selectedConsumerId}
          onSelectConsumer={setSelectedConsumerId}
          batchItems={batchItems}
          onStartGrading={handleStartGrading}
          completedCount={completedGrades.size}
        />
      ) : (
        <div className="space-y-4">
          {/* Progress Bar */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-300 dark:border-gray-700 p-6 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <User className="text-blue-600 dark:text-blue-400" size={24} />
                <div>
                  <h3 className="text-lg font-semibold">Consumer {selectedConsumerId}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Grading {currentIndex + 1} of {batchItems.length}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowRubric(!showRubric)}
                  className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all"
                  title="Toggle rubric"
                >
                  {showRubric ? 'Hide' : 'Show'} Rubric
                </button>
                <button
                  onClick={() => setCompactView(!compactView)}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all"
                  title="Toggle compact view"
                >
                  {compactView ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
                <button
                  onClick={handleExportBatch}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"
                >
                  <Download size={16} /> Export
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">Progress: {completedGrades.size} / {batchItems.length} completed</span>
                <span className="font-bold text-green-600 dark:text-green-400">{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-green-500 to-emerald-500 h-full transition-all duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex gap-1 mt-2">
                {batchItems.map((_, idx) => (
                  <div
                    key={idx}
                    className={`flex-1 h-2 rounded ${
                      completedGrades.has(idx)
                        ? 'bg-green-500'
                        : idx === currentIndex
                        ? 'bg-blue-500 animate-pulse'
                        : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Grading Form */}
          {currentGrade && (
            <GradingInterface
              grade={currentGrade}
              onChange={setCurrentGrade}
              onSaveAndNext={handleSaveAndNext}
              onSkip={handleSkip}
              onPrevious={handlePrevious}
              canGoPrevious={currentIndex > 0}
              canGoNext={currentIndex < batchItems.length - 1}
              isLastItem={currentIndex === batchItems.length - 1}
              compactView={compactView}
              showRubric={showRubric}
            />
          )}
        </div>
      )}
    </div>
  );
}

function BatchSelector({
  consumerIds,
  selectedConsumerId,
  onSelectConsumer,
  batchItems,
  onStartGrading,
  completedCount,
}: {
  consumerIds: string[];
  selectedConsumerId: string;
  onSelectConsumer: (id: string) => void;
  batchItems: GradeRecord[];
  onStartGrading: () => void;
  completedCount: number;
}) {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
          RLHF Grading Platform
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Select a consumer and batch to start grading recommendations
        </p>
      </div>

      <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-xl border border-gray-300 dark:border-gray-700 p-8 shadow-xl">
        <div className="space-y-6">
          <div>
            <label className="block text-lg font-semibold mb-3 flex items-center gap-2">
              <User className="text-blue-600 dark:text-blue-400" size={20} />
              Step 1: Select Consumer
            </label>
            <select
              value={selectedConsumerId}
              onChange={(e) => onSelectConsumer(e.target.value)}
              className="w-full border-2 border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer text-lg"
            >
              <option value="">Select a consumer ID...</option>
              {consumerIds.map(id => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          </div>

          {selectedConsumerId && (
            <div className="animate-slideUp">
              <label className="block text-lg font-semibold mb-3 flex items-center gap-2">
                <List className="text-purple-600 dark:text-purple-400" size={20} />
                Step 2: Review Batch
              </label>
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-700 p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Total Items</p>
                    <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{batchItems.length}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Already Graded</p>
                    <p className="text-3xl font-bold text-green-600 dark:text-green-400">{completedCount}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Remaining</p>
                    <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">{batchItems.length - completedCount}</p>
                  </div>
                </div>

                <div className="max-h-64 overflow-y-auto space-y-2">
                  {batchItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded border border-gray-200 dark:border-gray-600"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm truncate">{item.recommendation}</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400 truncate">
                            "{item.query}" • {item.daypart}
                          </div>
                        </div>
                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
                          #{idx + 1}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={onStartGrading}
                className="w-full mt-6 flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg hover:shadow-xl transform hover:scale-[1.02] text-lg font-semibold"
              >
                <PlayCircle size={24} />
                Start Grading Batch
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GradingInterface({
  grade,
  onChange,
  onSaveAndNext,
  onSkip,
  onPrevious,
  canGoPrevious,
  canGoNext,
  isLastItem,
  compactView,
  showRubric,
}: {
  grade: ManualGrade;
  onChange: (grade: ManualGrade) => void;
  onSaveAndNext: () => void;
  onSkip: () => void;
  onPrevious: () => void;
  canGoPrevious: boolean;
  canGoNext: boolean;
  isLastItem: boolean;
  compactView: boolean;
  showRubric: boolean;
}) {
  const updateRelevanceCheck = (key: keyof RelevanceChecks, value: boolean) => {
    onChange({
      ...grade,
      relevanceChecks: { ...grade.relevanceChecks, [key]: value },
    });
  };

  const updateSerendipityCheck = (key: keyof SerendipityChecks, value: boolean | number) => {
    onChange({
      ...grade,
      serendipityChecks: { ...grade.serendipityChecks, [key]: value },
    });
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && canGoPrevious) {
        onPrevious();
      } else if (e.key === 'ArrowRight' && canGoNext) {
        onSkip();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        onSaveAndNext();
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [canGoPrevious, canGoNext]);

  const relevanceScore = calculateRelevanceScore(grade.relevanceChecks);
  const serendipityScore = calculateSerendipityScore(grade.serendipityChecks);
  const weightedScore = calculateWeightedScore(relevanceScore, serendipityScore);

  return (
    <div className={`grid grid-cols-1 ${showRubric ? 'xl:grid-cols-5' : 'lg:grid-cols-3'} gap-6`}>
      <div className={`${showRubric ? 'xl:col-span-2' : 'lg:col-span-2'} space-y-4`}>
        {/* Item Info */}
        <div className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/10 dark:to-purple-900/10 rounded-lg border border-blue-200 dark:border-blue-800 p-4">
          <div className="space-y-2">
            <div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Query:</span>
              <p className="font-semibold text-lg">{grade.query}</p>
            </div>
            <div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Recommendation:</span>
              <p className="font-bold text-xl text-blue-600 dark:text-blue-400">{grade.recommendation}</p>
            </div>
            <div className="flex gap-4 text-sm">
              <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded">
                {grade.daypart}
              </span>
            </div>
          </div>
        </div>

        {/* Relevance Checks */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-300 dark:border-gray-700 p-4 shadow-lg">
          <h4 className="font-semibold text-lg text-blue-600 dark:text-blue-400 mb-3">
            Relevance & Format (70%)
          </h4>
          <div className={`space-y-${compactView ? '1' : '2'}`}>
            <CheckboxItem label="Primary intent match (+3)" checked={grade.relevanceChecks.primaryIntentMatch} onChange={(v) => updateRelevanceCheck('primaryIntentMatch', v)} compact={compactView} />
            <CheckboxItem label="Descriptive traits preserved (+2)" checked={grade.relevanceChecks.descriptiveTraitsPreserved} onChange={(v) => updateRelevanceCheck('descriptiveTraitsPreserved', v)} compact={compactView} />
            <CheckboxItem label="Category/dietary match (+2)" checked={grade.relevanceChecks.categoryDietaryMatch} onChange={(v) => updateRelevanceCheck('categoryDietaryMatch', v)} compact={compactView} />
            <CheckboxItem label="Situational suitability (+2)" checked={grade.relevanceChecks.situationalSuitability} onChange={(v) => updateRelevanceCheck('situationalSuitability', v)} compact={compactView} />
            <CheckboxItem label="Explicit constraints met (+2)" checked={grade.relevanceChecks.explicitConstraintsMet} onChange={(v) => updateRelevanceCheck('explicitConstraintsMet', v)} compact={compactView} />
            <CheckboxItem label="Profile compliant (+1) [GATE]" checked={grade.relevanceChecks.profileCompliant} onChange={(v) => updateRelevanceCheck('profileCompliant', v)} highlight={!grade.relevanceChecks.profileCompliant} compact={compactView} />
            <CheckboxItem label="Output clarity (+2)" checked={grade.relevanceChecks.outputClarity} onChange={(v) => updateRelevanceCheck('outputClarity', v)} compact={compactView} />
            <CheckboxItem label="Mainstream availability (+2)" checked={grade.relevanceChecks.mainstreamAvailability} onChange={(v) => updateRelevanceCheck('mainstreamAvailability', v)} compact={compactView} />
            <CheckboxItem label="Format correctness (+2)" checked={grade.relevanceChecks.formatCorrectness} onChange={(v) => updateRelevanceCheck('formatCorrectness', v)} compact={compactView} />
            <CheckboxItem label="Conciseness (+2)" checked={grade.relevanceChecks.conciseness} onChange={(v) => updateRelevanceCheck('conciseness', v)} compact={compactView} />
          </div>
        </div>

        {/* Serendipity Checks */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-300 dark:border-gray-700 p-4 shadow-lg">
          <h4 className="font-semibold text-lg text-purple-600 dark:text-purple-400 mb-3">
            Serendipity (30%)
          </h4>
          <div className="space-y-2 mb-3">
            <label className="block text-sm font-medium">Cuisine & Dish Novelty (0-5 points)</label>
            <select
              value={grade.serendipityChecks.cuisineDishNovelty}
              onChange={(e) => updateSerendipityCheck('cuisineDishNovelty', Number(e.target.value) as 0 | 1 | 2 | 3 | 4 | 5)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 focus:ring-2 focus:ring-purple-500 cursor-pointer"
            >
              {NOVELTY_TIERS.map((tier) => (
                <option key={tier.value} value={tier.value}>{tier.label}</option>
              ))}
            </select>
          </div>
          <div className={`space-y-${compactView ? '1' : '2'}`}>
            <CheckboxItem label="Low discoverability (+1)" checked={grade.serendipityChecks.lowDiscoverability} onChange={(v) => updateSerendipityCheck('lowDiscoverability', v)} compact={compactView} />
            <CheckboxItem label="Familiar ingredients new context (+1)" checked={grade.serendipityChecks.familiarIngredientsNewContext} onChange={(v) => updateSerendipityCheck('familiarIngredientsNewContext', v)} compact={compactView} />
            <CheckboxItem label="Context fit while novel (+1)" checked={grade.serendipityChecks.contextFitWhileNovel} onChange={(v) => updateSerendipityCheck('contextFitWhileNovel', v)} compact={compactView} />
            <CheckboxItem label='"Aha moment" (+1)' checked={grade.serendipityChecks.ahaMoment} onChange={(v) => updateSerendipityCheck('ahaMoment', v)} compact={compactView} />
            <CheckboxItem label="Creates curiosity (+1)" checked={grade.serendipityChecks.createsCuriosity} onChange={(v) => updateSerendipityCheck('createsCuriosity', v)} compact={compactView} />
          </div>
        </div>

        {/* Navigation */}
        <div className="flex gap-3">
          <button
            onClick={onPrevious}
            disabled={!canGoPrevious}
            className="flex items-center gap-2 px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex-1"
          >
            <ChevronLeft size={20} /> Previous
          </button>
          <button
            onClick={onSkip}
            disabled={!canGoNext}
            className="flex items-center gap-2 px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex-1"
          >
            Skip <SkipForward size={20} />
          </button>
          <button
            onClick={onSaveAndNext}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all flex-[2] font-semibold shadow-lg"
          >
            <Check size={20} /> {isLastItem ? 'Complete Batch' : 'Save & Next'} (⌘↵)
          </button>
        </div>
      </div>

      {/* Score Preview */}
      <div className={`${showRubric ? 'xl:col-span-1' : 'lg:col-span-1'}`}>
        <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-xl border border-gray-300 dark:border-gray-700 p-6 sticky top-4 shadow-lg">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Sparkles className="text-yellow-500" />
            Live Score
          </h3>

          <div className="space-y-4">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-4 shadow-md">
              <div className="text-sm text-blue-100 mb-1">Relevance (70%)</div>
              <div className="text-4xl font-bold text-white">{relevanceScore.toFixed(2)}</div>
            </div>

            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-4 shadow-md">
              <div className="text-sm text-purple-100 mb-1">Serendipity (30%)</div>
              <div className="text-4xl font-bold text-white">{serendipityScore.toFixed(2)}</div>
            </div>

            <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg p-4 shadow-md">
              <div className="text-sm text-green-100 mb-1">Weighted Score</div>
              <div className="text-4xl font-bold text-white">{weightedScore.toFixed(2)}</div>
            </div>
          </div>

          {!grade.relevanceChecks.profileCompliant && (
            <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg p-3">
              <p className="text-red-800 dark:text-red-300 font-semibold text-sm">
                ⚠ GATE FAILED - Score = 0
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Rubric Reference */}
      {showRubric && (
        <div className="xl:col-span-2">
          <DetailedRubric />
        </div>
      )}
    </div>
  );
}

function CheckboxItem({
  label,
  checked,
  onChange,
  highlight = false,
  compact = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  highlight?: boolean;
  compact?: boolean;
}) {
  return (
    <label
      className={`flex items-center gap-3 ${compact ? 'p-2' : 'p-3'} rounded-lg cursor-pointer hover:bg-white/50 dark:hover:bg-gray-700/30 transition-all ${
        highlight ? 'bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700' : ''
      } ${checked ? 'bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800' : 'border border-transparent'}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 text-green-600 rounded focus:ring-2 focus:ring-green-500"
      />
      <span className={`flex-1 font-medium ${compact ? 'text-xs' : 'text-sm'}`}>{label}</span>
    </label>
  );
}
