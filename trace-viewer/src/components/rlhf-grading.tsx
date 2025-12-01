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
import { ChevronLeft, ChevronRight, Check, SkipForward, Download, User, List, Sparkles, PlayCircle } from 'lucide-react';
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
  const [showRubric, setShowRubric] = useState(true);
  const [gradesCache, setGradesCache] = useState<Map<number, ManualGrade>>(new Map());

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
      setGradesCache(new Map());
    } else {
      setBatchItems([]);
    }
  }, [selectedConsumerId, datasetGrades]);

  // Load current item into grading form
  const loadCurrentItem = () => {
    if (batchItems.length === 0 || currentIndex >= batchItems.length) return;

    // Check if we have a cached grade for this item
    const cachedGrade = gradesCache.get(currentIndex);
    if (cachedGrade) {
      setCurrentGrade(cachedGrade);
      return;
    }

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
        profileCompliant: false,
        outputClarity: false,
        mainstreamAvailability: false,
        formatCorrectness: false,
        conciseness: false,
      },
      serendipityChecks: {
        cuisineDishNovelty: 0,
        lowDiscoverability: false,
        familiarIngredientsNewContext: false,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // Update cache with saved grade
    setGradesCache(new Map(gradesCache.set(currentIndex, gradeToSave)));

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
      // Save current state to cache before moving
      if (currentGrade) {
        setGradesCache(new Map(gradesCache.set(currentIndex, currentGrade)));
      }
      setCurrentIndex(currentIndex + 1);
      // Quick skip feedback
      setToast({ message: 'Skipped', type: 'info' });
      setTimeout(() => setToast(null), 600);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      // Save current state to cache before moving
      if (currentGrade) {
        setGradesCache(new Map(gradesCache.set(currentIndex, currentGrade)));
      }
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
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-black/10 dark:border-gray-700 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-black/5 dark:bg-white/5 rounded-lg">
                  <User className="text-black dark:text-white" size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-black dark:text-white">Consumer {selectedConsumerId}</h3>
                  <p className="text-sm text-black/60 dark:text-white/60">
                    Grading {currentIndex + 1} of {batchItems.length}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowRubric(!showRubric)}
                  className="flex items-center gap-2 px-3 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg hover:bg-black/90 dark:hover:bg-white/90 transition-colors text-sm font-medium"
                  title="Toggle rubric"
                >
                  {showRubric ? 'Hide' : 'Show'} Rubric
                </button>
                <button
                  onClick={handleExportBatch}
                  className="flex items-center gap-2 px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg hover:bg-black/90 dark:hover:bg-white/90 transition-colors text-sm font-medium"
                >
                  <Download size={16} /> Export
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between text-sm text-black/80 dark:text-white/80">
                <span className="font-medium">Progress: {completedGrades.size} / {batchItems.length} completed</span>
                <span className="font-bold text-black dark:text-white">{progress}%</span>
              </div>
              <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-black dark:bg-white h-full transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex gap-1">
                {batchItems.map((_, idx) => (
                  <div
                    key={idx}
                    className={`flex-1 h-1.5 rounded-full transition-all duration-200 ${
                      completedGrades.has(idx)
                        ? 'bg-black dark:bg-white'
                        : idx === currentIndex
                        ? 'bg-gray-400 dark:bg-gray-500'
                        : 'bg-gray-200 dark:bg-gray-700'
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
        <h2 className="text-3xl font-bold text-black mb-2">
          RLHF Grading Platform
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Select a consumer and batch to start grading recommendations
        </p>
      </div>

      <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-xl border border-gray-300 dark:border-gray-700 p-8 shadow-xl">
        <div className="space-y-6">
          <div>
            <label className="block text-base font-semibold mb-3 flex items-center gap-2 text-black dark:text-white">
              <div className="p-1.5 bg-black/5 dark:bg-white/5 rounded">
                <User size={18} />
              </div>
              Step 1: Select Consumer
            </label>
            <select
              value={selectedConsumerId}
              onChange={(e) => onSelectConsumer(e.target.value)}
              className="w-full border border-black/10 dark:border-gray-600 rounded-lg px-4 py-3 bg-white dark:bg-gray-700 text-black dark:text-white focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent transition-all cursor-pointer"
            >
              <option value="">Select a consumer ID...</option>
              {consumerIds.map(id => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          </div>

          {selectedConsumerId && (
            <div className="animate-slideUp">
              <label className="block text-base font-semibold mb-3 flex items-center gap-2 text-black dark:text-white">
                <div className="p-1.5 bg-black/5 dark:bg-white/5 rounded">
                  <List size={18} />
                </div>
                Step 2: Review Batch
              </label>
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-black/10 dark:border-gray-700 p-5">
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <p className="text-xs text-black/60 dark:text-white/60 mb-1">Total Items</p>
                    <p className="text-2xl font-bold text-black dark:text-white">{batchItems.length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-black/60 dark:text-white/60 mb-1">Already Graded</p>
                    <p className="text-2xl font-bold text-black dark:text-white">{completedCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-black/60 dark:text-white/60 mb-1">Remaining</p>
                    <p className="text-2xl font-bold text-black dark:text-white">{batchItems.length - completedCount}</p>
                  </div>
                </div>

                <div className="max-h-64 overflow-y-auto space-y-1.5">
                  {batchItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] rounded-lg border border-black/5 dark:border-white/5 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-black dark:text-white truncate">{item.recommendation}</div>
                          <div className="text-xs text-black/60 dark:text-white/60 truncate mt-0.5">
                            "{item.query}" • {item.daypart}
                          </div>
                        </div>
                        <div className="text-xs font-medium text-black/40 dark:text-white/40">
                          #{idx + 1}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={onStartGrading}
                className="w-full mt-6 flex items-center justify-center gap-3 px-8 py-4 bg-black dark:bg-white text-white dark:text-black rounded-lg hover:bg-black/90 dark:hover:bg-white/90 transition-colors text-base font-semibold"
              >
                <PlayCircle size={20} />
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
  }, [canGoPrevious, canGoNext, onPrevious, onSkip, onSaveAndNext]);

  const relevanceScore = calculateRelevanceScore(grade.relevanceChecks);
  const serendipityScore = calculateSerendipityScore(grade.serendipityChecks);
  const weightedScore = calculateWeightedScore(relevanceScore, serendipityScore);

  return (
    <div className={`grid grid-cols-1 ${showRubric ? 'xl:grid-cols-5' : 'lg:grid-cols-3'} gap-6`}>
      <div className={`${showRubric ? 'xl:col-span-2' : 'lg:col-span-2'} space-y-4`}>
        {/* Item Info */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-black/10 dark:border-gray-700 p-5">
          <div className="space-y-3">
            <div>
              <span className="text-xs font-medium text-black/60 dark:text-white/60 uppercase tracking-wide">Query</span>
              <p className="font-semibold text-base text-black dark:text-white mt-1">{grade.query}</p>
            </div>
            <div>
              <span className="text-xs font-medium text-black/60 dark:text-white/60 uppercase tracking-wide">Recommendation</span>
              <p className="font-bold text-lg text-black dark:text-white mt-1">{grade.recommendation}</p>
            </div>
            <div>
              <span className="inline-flex px-2.5 py-1 bg-black/5 dark:bg-white/5 text-black dark:text-white rounded text-sm font-medium">
                {grade.daypart}
              </span>
            </div>
          </div>
        </div>

        {/* Relevance Checks */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-black/10 dark:border-gray-700 p-5">
          <h4 className="font-semibold text-base text-black dark:text-white mb-3">
            Relevance & Format (70%)
          </h4>
          <div className="space-y-2">
            <CheckboxItem label="Primary intent match (+3)" checked={grade.relevanceChecks.primaryIntentMatch} onChange={(v) => updateRelevanceCheck('primaryIntentMatch', v)} />
            <CheckboxItem label="Descriptive traits preserved (+2)" checked={grade.relevanceChecks.descriptiveTraitsPreserved} onChange={(v) => updateRelevanceCheck('descriptiveTraitsPreserved', v)} />
            <CheckboxItem label="Category/dietary match (+2)" checked={grade.relevanceChecks.categoryDietaryMatch} onChange={(v) => updateRelevanceCheck('categoryDietaryMatch', v)} />
            <CheckboxItem label="Situational suitability (+2)" checked={grade.relevanceChecks.situationalSuitability} onChange={(v) => updateRelevanceCheck('situationalSuitability', v)} />
            <CheckboxItem label="Explicit constraints met (+2)" checked={grade.relevanceChecks.explicitConstraintsMet} onChange={(v) => updateRelevanceCheck('explicitConstraintsMet', v)} />
            <CheckboxItem label="Profile compliant (+1) [GATE]" checked={grade.relevanceChecks.profileCompliant} onChange={(v) => updateRelevanceCheck('profileCompliant', v)} highlight={!grade.relevanceChecks.profileCompliant} />
            <CheckboxItem label="Output clarity (+2)" checked={grade.relevanceChecks.outputClarity} onChange={(v) => updateRelevanceCheck('outputClarity', v)} />
            <CheckboxItem label="Mainstream availability (+2)" checked={grade.relevanceChecks.mainstreamAvailability} onChange={(v) => updateRelevanceCheck('mainstreamAvailability', v)} />
            <CheckboxItem label="Format correctness (+2)" checked={grade.relevanceChecks.formatCorrectness} onChange={(v) => updateRelevanceCheck('formatCorrectness', v)} />
            <CheckboxItem label="Conciseness (+2)" checked={grade.relevanceChecks.conciseness} onChange={(v) => updateRelevanceCheck('conciseness', v)} />
          </div>
        </div>

        {/* Serendipity Checks */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-black/10 dark:border-gray-700 p-5">
          <h4 className="font-semibold text-base text-black dark:text-white mb-3">
            Serendipity (30%)
          </h4>
          <div className="space-y-2 mb-3">
            <label className="block text-sm font-medium text-black dark:text-white">Cuisine & Dish Novelty (0-5 points)</label>
            <select
              value={grade.serendipityChecks.cuisineDishNovelty}
              onChange={(e) => updateSerendipityCheck('cuisineDishNovelty', Number(e.target.value) as 0 | 1 | 2 | 3 | 4 | 5)}
              className="w-full border border-black/10 dark:border-gray-600 rounded-lg px-3 py-2.5 bg-white dark:bg-gray-700 text-black dark:text-white focus:ring-2 focus:ring-black dark:focus:ring-white cursor-pointer transition-all"
            >
              {NOVELTY_TIERS.map((tier) => (
                <option key={tier.value} value={tier.value}>{tier.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <CheckboxItem label="Low discoverability (+1)" checked={grade.serendipityChecks.lowDiscoverability} onChange={(v) => updateSerendipityCheck('lowDiscoverability', v)} />
            <CheckboxItem label="Familiar ingredients new context (+1)" checked={grade.serendipityChecks.familiarIngredientsNewContext} onChange={(v) => updateSerendipityCheck('familiarIngredientsNewContext', v)} />
            <CheckboxItem label="Context fit while novel (+1)" checked={grade.serendipityChecks.contextFitWhileNovel} onChange={(v) => updateSerendipityCheck('contextFitWhileNovel', v)} />
            <CheckboxItem label='"Aha moment" (+1)' checked={grade.serendipityChecks.ahaMoment} onChange={(v) => updateSerendipityCheck('ahaMoment', v)} />
            <CheckboxItem label="Creates curiosity (+1)" checked={grade.serendipityChecks.createsCuriosity} onChange={(v) => updateSerendipityCheck('createsCuriosity', v)} />
          </div>
        </div>

        {/* Navigation */}
        <div className="flex gap-2">
          <button
            onClick={onPrevious}
            disabled={!canGoPrevious}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-black dark:text-white rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-1 font-medium text-sm"
          >
            <ChevronLeft size={18} /> Previous
          </button>
          <button
            onClick={onSkip}
            disabled={!canGoNext}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-black dark:text-white rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-1 font-medium text-sm"
          >
            Skip <SkipForward size={18} />
          </button>
          <button
            onClick={onSaveAndNext}
            className="flex items-center gap-2 px-6 py-2.5 bg-black dark:bg-white text-white dark:text-black rounded-lg hover:bg-black/90 dark:hover:bg-white/90 transition-colors flex-[2] font-semibold text-sm"
          >
            <Check size={18} /> {isLastItem ? 'Complete Batch' : 'Save & Next'} (⌘↵)
          </button>
        </div>
      </div>

      {/* Score Preview */}
      <div className={`${showRubric ? 'xl:col-span-1' : 'lg:col-span-1'}`}>
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-black/10 dark:border-gray-700 p-6 sticky top-4">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-black dark:text-white">
            <Sparkles size={20} />
            Live Score
          </h3>

          <div className="space-y-3">
            <div className="bg-black/[0.02] dark:bg-white/[0.02] rounded-lg p-4 border border-black/5 dark:border-white/5">
              <div className="text-xs text-black/60 dark:text-white/60 mb-1.5 font-medium">Relevance (70%)</div>
              <div className="text-3xl font-bold text-black dark:text-white">{relevanceScore.toFixed(2)}</div>
            </div>

            <div className="bg-black/[0.02] dark:bg-white/[0.02] rounded-lg p-4 border border-black/5 dark:border-white/5">
              <div className="text-xs text-black/60 dark:text-white/60 mb-1.5 font-medium">Serendipity (30%)</div>
              <div className="text-3xl font-bold text-black dark:text-white">{serendipityScore.toFixed(2)}</div>
            </div>

            <div className="bg-black dark:bg-white rounded-lg p-4">
              <div className="text-xs text-white/70 dark:text-black/70 mb-1.5 font-medium">Weighted Score</div>
              <div className="text-3xl font-bold text-white dark:text-black">{weightedScore.toFixed(2)}</div>
            </div>
          </div>

          {!grade.relevanceChecks.profileCompliant && (
            <div className="mt-4 bg-gray-100 dark:bg-gray-800 border border-gray-400 dark:border-gray-600 rounded-lg p-3">
              <p className="text-black dark:text-white font-semibold text-sm">
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
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  highlight?: boolean;
}) {
  return (
    <label
      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/30 transition-all ${
        highlight ? 'bg-gray-100 dark:bg-gray-800 border border-gray-400 dark:border-gray-600' : ''
      } ${checked ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-black border border-gray-800 dark:border-gray-300' : 'border border-transparent'}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 text-black rounded focus:ring-2 focus:ring-black"
      />
      <span className="flex-1 font-medium text-sm">{label}</span>
    </label>
  );
}
