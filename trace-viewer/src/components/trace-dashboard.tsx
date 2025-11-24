"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import {
  AlertCircle,
  Clock,
  FileDown,
  Loader2,
  RefreshCw,
  Search,
  Upload,
} from "lucide-react";

import type {
  CsvRow,
  TraceDetail,
  TraceRecord,
  TraceStore,
  TraceStoreMenuItem,
  GradingData,
  GradingResult,
} from "@/lib/trace-utils";
import { buildTraceRecords } from "@/lib/trace-utils";

const cn = (...classes: Array<string | undefined | null | false>) =>
  classes.filter(Boolean).join(" ");

const friendlyDaypart = (key: string) =>
  key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatDateTime = (value?: string) => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const getRangeLabel = (
  timestamps: Array<{ beginning?: string; ending?: string }>,
) => {
  if (!timestamps.length) return "Not available";
  const begins = timestamps
    .map((item) => (item.beginning ? new Date(item.beginning).getTime() : NaN))
    .filter((value) => !Number.isNaN(value));
  const ends = timestamps
    .map((item) => (item.ending ? new Date(item.ending).getTime() : NaN))
    .filter((value) => !Number.isNaN(value));

  if (!begins.length || !ends.length) return "Not available";
  const min = new Date(Math.min(...begins));
  const max = new Date(Math.max(...ends));
  const formatter = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  if (formatter.format(min) === formatter.format(max)) {
    return `${formatter.format(min)} • ${min.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })} – ${max.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  return `${formatter.format(min)} → ${formatter.format(max)}`;
};

const inferMenuItemName = (item: TraceStoreMenuItem) => {
  if (!item) return "Menu item";
  if (
    typeof item.profile === "object" &&
    item.profile !== null &&
    "identity" in item.profile &&
    typeof (item.profile as Record<string, unknown>).identity === "object"
  ) {
    const identity = (item.profile as { identity?: Record<string, unknown> })
      .identity;
    if (identity?.name && typeof identity.name === "string") {
      return identity.name;
    }
  }
  if ("name" in item && typeof item.name === "string") return item.name;
  return item.item_id ? `Item ${item.item_id}` : "Menu item";
};

const InsightCard = ({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) => (
  <div className="rounded-lg border border-black/10 bg-white p-4">
    <p className="text-xs font-medium uppercase tracking-wider text-black/50">
      {label}
    </p>
    <p className="mt-1 text-2xl font-semibold text-black">
      {value ?? "—"}
    </p>
  </div>
);

const TimelineItem = ({
  title,
  subtitle,
  timestamp,
}: {
  title: string;
  subtitle?: string;
  timestamp?: string;
}) => (
  <div className="relative pl-6 pb-6 last:pb-0">
    <div className="absolute left-0 top-2 h-2 w-2 rounded-full bg-black" />
    <div className="absolute left-[3px] top-4 bottom-0 w-px bg-black/10" />
    <div className="space-y-1">
      <p className="font-semibold text-black">{title}</p>
      {subtitle && (
        <p className="text-sm text-black/60">{subtitle.trim()}</p>
      )}
      {timestamp && (
        <p className="flex items-center gap-1.5 text-xs text-black/40">
          <Clock className="h-3 w-3" /> {formatDateTime(timestamp)}
        </p>
      )}
    </div>
  </div>
);

const StoreCard = ({ store, onDoubleClick }: { store: TraceStore; onDoubleClick?: (store: TraceStore) => void }) => {
  const primaryItems = (store.menu_items ?? []).slice(0, 3);
  const grading = store.grading;

  // Determine border color based on grading score
  let borderClass = "border-black/10";
  if (grading) {
    const score = grading.weighted_score_pct;
    if (score >= 80) borderClass = "border-green-300";
    else if (score >= 60) borderClass = "border-yellow-300";
    else if (score >= 40) borderClass = "border-orange-300";
    else borderClass = "border-red-300";
  }

  return (
    <div
      className={`rounded-lg border ${borderClass} bg-white p-5 transition hover:border-black/30 cursor-pointer`}
      onDoubleClick={() => onDoubleClick?.(store)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-black">
              {store.store_name ?? "Unnamed store"}
            </p>
            {grading ? (
              <GradingBadge grading={grading} />
            ) : (
              <span className="rounded-md bg-gray-100 border border-gray-200 px-2 py-0.5 text-xs text-gray-500">
                No Grade
              </span>
            )}
          </div>
          {store.cuisine && (
            <p className="mt-0.5 text-sm text-black/60">{store.cuisine}</p>
          )}
        </div>
        <span className="rounded-full bg-black px-3 py-1 text-xs font-medium text-white">
          {store.eta_minutes ?? "—"}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-black/50">Distance</dt>
          <dd className="font-medium text-black">
            {store.distance_miles ? `${Number(store.distance_miles).toFixed(2)} mi` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-black/50">Dietary</dt>
          <dd className="font-medium text-black">
            {store.dietary_options ?? "Standard"}
          </dd>
        </div>
      </dl>

      {primaryItems.length > 0 && (
        <div className="mt-4 rounded border border-black/10 bg-black/[0.02] p-3">
          <p className="text-xs font-medium uppercase tracking-wider text-black/50">
            Menu highlights
          </p>
          <ul className="mt-2 space-y-1 text-sm text-black/80">
            {primaryItems.map((item) => (
              <li key={`${store.business_id}-${item.item_id}`}>
                • {inferMenuItemName(item)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const EmptyState = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-black/20 bg-black/[0.02] px-6 py-16 text-center">
    <Upload className="h-10 w-10 text-black/30" />
    <p className="mt-4 text-lg font-semibold text-black/80">{message}</p>
    <p className="mt-2 max-w-md text-sm text-black/50">
      Upload a CSV export from your trace pipeline to view conversations and recommendations.
    </p>
  </div>
);

const GradingBadge = ({ grading }: { grading: GradingResult }) => {
  const score = grading.weighted_score_pct;
  const isRelevant = grading.label === "relevant";

  // Color coding based on score ranges
  let bgColor = "bg-red-100";
  let textColor = "text-red-800";
  let borderColor = "border-red-200";

  if (score >= 80) {
    bgColor = "bg-green-100";
    textColor = "text-green-800";
    borderColor = "border-green-200";
  } else if (score >= 60) {
    bgColor = "bg-yellow-100";
    textColor = "text-yellow-800";
    borderColor = "border-yellow-200";
  } else if (score >= 40) {
    bgColor = "bg-orange-100";
    textColor = "text-orange-800";
    borderColor = "border-orange-200";
  }

  return (
    <div className={`rounded-md border ${borderColor} ${bgColor} px-2 py-1`}>
      <div className="flex items-center gap-1.5">
        <span className={`text-xs font-bold ${textColor}`}>
          {score.toFixed(0)}%
        </span>
        <span className={`text-xs ${textColor} opacity-60`}>
          {isRelevant ? "✓" : "✗"}
        </span>
      </div>
    </div>
  );
};

const GradingDetailPanel = ({ grading }: { grading: GradingResult }) => {
  const [expandedCriterion, setExpandedCriterion] = useState<string | null>(null);
  const score = grading.weighted_score_pct;
  const isRelevant = grading.label === "relevant";

  // Score color for overall display
  let scoreColor = "text-red-600";
  if (score >= 80) scoreColor = "text-green-600";
  else if (score >= 60) scoreColor = "text-yellow-600";
  else if (score >= 40) scoreColor = "text-orange-600";

  // Helper to format criterion name
  const formatCriterion = (key: string) => {
    return key.replace(/_/g, " ").replace(/^is /, "").split(" ").map(
      word => word.charAt(0).toUpperCase() + word.slice(1)
    ).join(" ");
  };

  // Get score icon
  const getScoreIcon = (value: string) => {
    if (value === "Yes") return <span className="text-green-600">✓</span>;
    if (value === "No") return <span className="text-red-600">✗</span>;
    return <span className="text-gray-400">—</span>;
  };

  // Get explanation for each criterion based on the overall rationale and store data
  const getCriterionExplanation = (key: string, value: string) => {
    const explanations: Record<string, string> = {
      is_serving_matched: value === "Yes"
        ? "The store's menu includes items that match the primary food type requested in the query."
        : value === "No"
        ? "The store's menu does not include items matching the primary food type in the query."
        : "This criterion is not applicable to the current query type.",
      is_serving_more_than_three_items: value === "Yes"
        ? "The store offers at least 3 different items that match the query, providing good variety."
        : value === "No"
        ? "The store has fewer than 3 matching items, limiting customer choice."
        : "Not applicable - query doesn't require multiple item availability.",
      is_primary_serving: value === "Yes"
        ? "The matched items are among the store's primary/signature offerings."
        : value === "No"
        ? "The matched items are not primary offerings of this store."
        : "Not applicable to this query context.",
      is_dietary_serving: value === "Yes"
        ? "The store accommodates dietary restrictions or preferences mentioned in the query."
        : value === "No"
        ? "The store does not adequately meet the dietary requirements specified."
        : "No specific dietary requirements in the query.",
      is_flavor_match: value === "Yes"
        ? "Menu items match the flavor profile or taste preferences indicated in the query."
        : value === "No"
        ? "Flavor profiles don't align with query specifications."
        : "Query doesn't specify flavor preferences.",
      is_ingredient_present: value === "Yes"
        ? "The specific ingredients requested are present in the store's menu items."
        : value === "No"
        ? "Required ingredients are not available or present in menu offerings."
        : "No specific ingredients were requested in the query.",
      is_prep_style_matched: value === "Yes"
        ? "The preparation style (e.g., grilled, fried, baked) matches the query."
        : value === "No"
        ? "Preparation styles don't match what was requested."
        : "Query doesn't specify preparation preferences.",
      is_exact_restaurant: value === "Yes"
        ? "This is the exact restaurant/store mentioned in the query."
        : value === "No"
        ? "This is not the specific restaurant requested."
        : "Query didn't request a specific restaurant by name.",
      is_similar_restaurant: value === "Yes"
        ? "This store is similar in type/cuisine to what was requested, even if not exact."
        : value === "No"
        ? "Store type differs from what was implied in the query."
        : "Not applicable - exact match was found or not relevant.",
      is_portion_matched: value === "Yes"
        ? "Portion sizes align with any specifications in the query (e.g., large, family-size)."
        : value === "No"
        ? "Portion sizes don't match the requirements."
        : "No portion specifications in the query.",
      is_group_matched: value === "Yes"
        ? "The store is suitable for group dining or party orders as indicated in the query."
        : value === "No"
        ? "Not suitable for the group size or occasion mentioned."
        : "Query doesn't indicate group or party dining needs.",
      is_nearby: value === "Yes"
        ? `Store is located nearby (${grading.store_name} - check distance in store details).`
        : value === "No"
        ? "Store is located far from the delivery location."
        : "Location proximity wasn't a factor in this query.",
      is_fast_delivery: value === "Yes"
        ? "Store offers quick delivery time meeting user expectations."
        : value === "No"
        ? "Delivery time is longer than optimal."
        : "Delivery speed wasn't specified as a requirement.",
      is_top_rated: value === "Yes"
        ? "Store has high customer ratings indicating quality and reliability."
        : value === "No"
        ? "Store ratings are below the threshold for 'top rated' status."
        : "Rating quality wasn't a consideration for this query.",
      is_overall_rating_good: value === "Yes"
        ? "Store maintains good overall customer satisfaction ratings."
        : value === "No"
        ? "Store has lower customer satisfaction ratings."
        : "Overall rating wasn't evaluated for this match.",
      is_store_open: value === "Yes"
        ? "Store is currently open and accepting orders."
        : value === "No"
        ? "Store is currently closed or not accepting orders."
        : "Store hours weren't a factor in evaluation.",
      is_price_match: value === "Yes"
        ? "Store's price range aligns with budget expectations from the query."
        : value === "No"
        ? "Store pricing doesn't match the indicated budget level."
        : "Price sensitivity wasn't specified in the query.",
      is_fast_delivery_check: value === "Yes"
        ? "Delivery speed check confirms quick delivery capability."
        : value === "No"
        ? "Delivery speed doesn't meet fast delivery criteria."
        : "Fast delivery wasn't required for this query.",
    };

    return explanations[key] || "Evaluation reasoning for this criterion.";
  };

  return (
    <div className="space-y-4">
      {/* Overall Score */}
      <div className="rounded-lg border border-black/10 bg-gradient-to-br from-black/[0.02] to-black/[0.05] p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-black/50">Overall Score</h3>
            <p className={`text-4xl font-bold ${scoreColor} mt-1`}>{score.toFixed(1)}%</p>
            <p className="text-sm text-black/60 mt-1">
              {grading.earned_pts.toFixed(1)} / {grading.applicable_pts.toFixed(1)} points
            </p>
          </div>
          <div className={`rounded-full px-6 py-3 ${isRelevant ? "bg-green-100" : "bg-red-100"}`}>
            <span className={`text-lg font-bold ${isRelevant ? "text-green-800" : "text-red-800"}`}>
              {isRelevant ? "RELEVANT" : "NOT RELEVANT"}
            </span>
          </div>
        </div>
      </div>

      {/* Query Context */}
      <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-black/50 mb-2">Query Context</h3>
        <div className="space-y-2">
          <div>
            <span className="text-xs text-black/50">Original Query:</span>
            <p className="text-sm font-medium text-black">{grading.original_query}</p>
          </div>
          {grading.query !== grading.original_query && (
            <div>
              <span className="text-xs text-black/50">Rewritten Query:</span>
              <p className="text-sm font-medium text-black">{grading.query}</p>
            </div>
          )}
        </div>
      </div>

      {/* Rationale */}
      <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-black/50 mb-2">Rationale</h3>
        <p className="text-sm text-black/80 leading-relaxed">{grading.rationale}</p>
      </div>

      {/* Detailed Scores */}
      <div className="rounded-lg border border-black/10 bg-white p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-black/50 mb-3">Detailed Scores</h3>
        <div className="grid grid-cols-1 gap-1">
          {Object.entries(grading.scores).map(([key, value]) => {
            const isExpanded = expandedCriterion === key;
            return (
              <div key={key} className="border-b border-black/5 last:border-0">
                <button
                  onClick={() => setExpandedCriterion(isExpanded ? null : key)}
                  className="w-full flex items-center justify-between py-2 hover:bg-black/[0.02] transition px-2 rounded"
                >
                  <span className="text-sm text-black/70 flex items-center gap-2">
                    <span className="text-xs text-black/30">{isExpanded ? "▼" : "▶"}</span>
                    {formatCriterion(key)}
                  </span>
                  <div className="flex items-center gap-2">
                    {getScoreIcon(value as string)}
                    <span className="text-xs text-black/40">{value}</span>
                  </div>
                </button>
                {isExpanded && (
                  <div className="px-2 pb-3 pt-1">
                    <div className="rounded bg-black/[0.02] p-3 text-xs text-black/70 leading-relaxed border-l-2 border-black/10">
                      <p className="font-medium text-black/50 mb-1">Chain of Thought:</p>
                      <p>{getCriterionExplanation(key, value as string)}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Metadata */}
      <div className="rounded-lg border border-black/10 bg-black/[0.02] p-3">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-black/50">Trace Index:</span>
            <span className="ml-2 font-mono text-black">{grading.trace_index}</span>
          </div>
          <div>
            <span className="text-black/50">Carousel:</span>
            <span className="ml-2 font-mono text-black">{grading.carousel_index}</span>
          </div>
          <div className="col-span-2">
            <span className="text-black/50">Rewrite ID:</span>
            <span className="ml-2 font-mono text-black text-[10px]">{grading.rewrite_id}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const StoreDetailModal = ({
  store,
  onClose,
}: {
  store: TraceStore;
  onClose: () => void;
}) => {
  const allMenuItems = store.menu_items ?? [];
  const storeAny = store as any;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/10 bg-white p-6">
          <div className="flex-1">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-black">
                  {store.store_name ?? "Unnamed Store"}
                </h2>
                {store.cuisine && (
                  <p className="mt-1 text-black/60">{store.cuisine}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                {storeAny.star_rating && (
                  <div className="flex items-center gap-1 rounded-full bg-black px-3 py-1.5">
                    <span className="text-sm font-bold text-white">★</span>
                    <span className="text-sm font-semibold text-white">{storeAny.star_rating}</span>
                  </div>
                )}
                {storeAny.price_range && (
                  <div className="rounded-full bg-black/10 px-3 py-1.5">
                    <span className="text-sm font-semibold text-black">
                      {'$'.repeat(storeAny.price_range)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-4 rounded-lg p-2 transition hover:bg-black/5"
            aria-label="Close"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Grading Section */}
          {store.grading ? (
            <div>
              <h3 className="text-lg font-bold text-black mb-3">Evaluation Results</h3>
              <GradingDetailPanel grading={store.grading} />
            </div>
          ) : (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-yellow-900">No Grading Available</h3>
                  <p className="text-xs text-yellow-800 mt-1">
                    This store has not been evaluated yet. Grading data may be unavailable for stores in certain carousels or queries.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Store Summary */}
          {storeAny.summary && (
            <div className="rounded-lg border border-black/10 bg-gradient-to-br from-black/[0.02] to-black/[0.05] p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-black/50 mb-2">Store Summary</h3>
              <p className="text-sm text-black/80 leading-relaxed">{storeAny.summary}</p>
            </div>
          )}

          {/* Store Details Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4">
              <dt className="text-xs font-medium uppercase tracking-wider text-black/50">Business ID</dt>
              <dd className="mt-1 text-base font-semibold text-black">{store.business_id ?? "—"}</dd>
            </div>
            {storeAny.store_id && (
              <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4">
                <dt className="text-xs font-medium uppercase tracking-wider text-black/50">Store ID</dt>
                <dd className="mt-1 text-base font-semibold text-black">{storeAny.store_id}</dd>
              </div>
            )}
            <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4">
              <dt className="text-xs font-medium uppercase tracking-wider text-black/50">ETA</dt>
              <dd className="mt-1 text-base font-semibold text-black">{store.eta_minutes ?? "—"}</dd>
            </div>
            <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4">
              <dt className="text-xs font-medium uppercase tracking-wider text-black/50">Distance</dt>
              <dd className="mt-1 text-base font-semibold text-black">
                {store.distance_miles
                  ? `${Number(store.distance_miles).toFixed(2)} mi`
                  : "—"}
              </dd>
            </div>
            {storeAny.positions?.vertical_card_position !== undefined && (
              <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4">
                <dt className="text-xs font-medium uppercase tracking-wider text-black/50">Card Position</dt>
                <dd className="mt-1 text-base font-semibold text-black">{storeAny.positions.vertical_card_position}</dd>
              </div>
            )}
            <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4 col-span-2 lg:col-span-3">
              <dt className="text-xs font-medium uppercase tracking-wider text-black/50">Dietary Options</dt>
              <dd className="mt-1 text-sm text-black">
                {store.dietary_options ?? "Standard"}
              </dd>
            </div>
            {store.address && (
              <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4 col-span-2 lg:col-span-3">
                <dt className="text-xs font-medium uppercase tracking-wider text-black/50">Address</dt>
                <dd className="mt-1 text-sm text-black">{store.address}</dd>
              </div>
            )}
          </div>

          {/* Full Menu Items */}
          {allMenuItems.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-black mb-3">
                Full Menu ({allMenuItems.length} items)
              </h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {allMenuItems.map((item, idx) => {
                  const itemAny = item as any;
                  let itemProfile = null;
                  let itemWebsterTags = null;

                  try {
                    if (itemAny.profile && typeof itemAny.profile === 'string') {
                      itemProfile = JSON.parse(itemAny.profile);
                    }
                  } catch (e) {}

                  try {
                    if (itemAny.item_webster_tags && typeof itemAny.item_webster_tags === 'string') {
                      itemWebsterTags = JSON.parse(itemAny.item_webster_tags);
                    }
                  } catch (e) {}

                  const itemName = inferMenuItemName(item);
                  const description = itemProfile?.identity?.description;
                  const price = itemProfile?.identity?.price;
                  const menuCategory = itemProfile?.identity?.menu_category;
                  const dietaryCompliance = itemWebsterTags?.dietary_compliance;
                  const flavor = itemWebsterTags?.flavor;

                  return (
                    <div
                      key={`${store.business_id}-menu-${idx}`}
                      className="rounded-lg border border-black/10 bg-white p-4 hover:bg-black/[0.02] transition"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <h4 className="font-semibold text-black">{itemName}</h4>
                          {description && (
                            <p className="mt-1 text-sm text-black/60">{description}</p>
                          )}
                          {menuCategory && (
                            <p className="mt-1 text-xs text-black/40">{menuCategory}</p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-2">
                            {dietaryCompliance && Array.isArray(dietaryCompliance) && dietaryCompliance.length > 0 && (
                              dietaryCompliance.map((diet: string, i: number) => (
                                <span key={i} className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                                  {diet}
                                </span>
                              ))
                            )}
                            {flavor && Array.isArray(flavor) && flavor.length > 0 && (
                              flavor.slice(0, 3).map((flav: string, i: number) => (
                                <span key={i} className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-black/60">
                                  {flav}
                                </span>
                              ))
                            )}
                          </div>
                        </div>
                        {price !== undefined && price !== null && (
                          <div className="text-right">
                            <span className="text-sm font-semibold text-black">
                              ${typeof price === 'number' ? price.toFixed(2) : price}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const TraceDashboard = () => {
  const [records, setRecords] = useState<TraceRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [activeTraceIndex, setActiveTraceIndex] = useState(0);
  const [showAllTraces, setShowAllTraces] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sourceLabel, setSourceLabel] = useState("Loading demo data…");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedStoreDetail, setSelectedStoreDetail] = useState<TraceStore | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [gradingData, setGradingData] = useState<GradingData | null>(null);
  const [gradingLookup, setGradingLookup] = useState<Map<string, GradingResult>>(new Map());

  const parseCsv = useCallback(
    (text: string, label: string) => {
      const parsed = Papa.parse<CsvRow>(text, {
        header: true,
        skipEmptyLines: true,
      });

      if (parsed.errors.length) {
        throw new Error(parsed.errors[0].message);
      }

      const nextRecords = buildTraceRecords(parsed.data);
      if (!nextRecords.length) {
        throw new Error("No conversations detected in the CSV.");
      }

      setRecords(nextRecords);
      setSelectedId(nextRecords[0].conversationId);
      setActiveTraceIndex(0);
      setSourceLabel(label);
      setErrorMessage(null);
    },
    [],
  );

  const parseJsonData = useCallback(
    (text: string, label: string) => {
      try {
        const data = JSON.parse(text);

        // Support both array format and object with conversations array
        const conversations = Array.isArray(data) ? data : data.conversations || data.traces || [];

        if (!conversations.length) {
          throw new Error("No conversations found in JSON");
        }

        // Convert JSON format to TraceRecord format
        const nextRecords: TraceRecord[] = conversations.map((conv: Record<string, unknown>) => {
          const conversationId = (conv.conversation_id || conv.conversationId || `conv_${Math.random().toString(36).slice(2)}`) as string;
          const payload = (conv.data || conv.payload || conv) as Record<string, unknown>;

          return {
            conversationId,
            traceCount: (conv.trace_count || conv.traceCount || (payload.traces as unknown[])?.length || 0) as number,
            payload: {
              consumer_profile: payload.consumer_profile as Record<string, unknown>,
              ids: payload.ids as Record<string, string>,
              query_log: payload.query_log as Array<Record<string, unknown>>,
              timestamps: payload.timestamps as Record<string, string>,
              trace_count: (payload.trace_count || conv.trace_count) as number,
              traces: payload.traces as TraceDetail[],
            },
          };
        });

        setRecords(nextRecords);
        setSelectedId(nextRecords[0].conversationId);
        setActiveTraceIndex(0);
        setSourceLabel(label);
        setErrorMessage(null);
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : "Failed to parse JSON");
      }
    },
    [],
  );

  const loadGradingData = useCallback(async () => {
    try {
      const response = await fetch("/VOX_Metis_100_structured_grades.json");
      if (!response.ok) {
        console.warn("Grading data not found, continuing without grades");
        return;
      }
      const data: GradingData = await response.json();
      setGradingData(data);

      // Build lookup map for O(1) access
      // Key format: `${conversation_id}|${trace_index}|${rewrite_id}|${carousel_index}|${store_id}`
      const lookup = new Map<string, GradingResult>();
      for (const result of data.results) {
        const key = `${result.conversation_id}|${result.trace_index}|${result.rewrite_id}|${result.carousel_index}|${result.store_id}`;
        lookup.set(key, result);
      }
      setGradingLookup(lookup);
      console.log(`Loaded ${data.results.length} grading results`);
    } catch (error) {
      console.warn("Failed to load grading data:", error);
    }
  }, []);

  const attachGradingToStores = useCallback(
    (
      conversationId: string,
      traceIndex: number,
      rewriteId: string,
      carouselIndex: number,
      stores: TraceStore[]
    ): TraceStore[] => {
      if (gradingLookup.size === 0) return stores;

      return stores.map((store) => {
        const storeId = (store as any).store_id || store.business_id;
        if (!storeId) return store;

        const key = `${conversationId}|${traceIndex}|${rewriteId}|${carouselIndex}|${storeId}`;
        const grading = gradingLookup.get(key);

        if (grading) {
          return { ...store, grading };
        }
        return store;
      });
    },
    [gradingLookup]
  );

  const loadDemo = useCallback(async () => {
    setIsLoading(true);
    setLoadingProgress(null);
    try {
      // Try to load from chunked manifest first
      const manifestResponse = await fetch("/data/traces/traces_manifest.json");
      if (manifestResponse.ok) {
        const manifest = await manifestResponse.json();
        const totalConversations = manifest.total_conversations;
        const chunks = manifest.chunks;

        setSourceLabel(`Loading ${totalConversations} conversations...`);
        setLoadingProgress({ loaded: 0, total: totalConversations });

        // Load chunks progressively
        const allRecords: TraceRecord[] = [];

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const chunkResponse = await fetch(`/data/traces/${chunk.filename}`);
          if (!chunkResponse.ok) {
            throw new Error(`Failed to load chunk ${i}`);
          }

          const chunkData = await chunkResponse.json();

          // Convert chunk data to TraceRecords
          for (const conv of chunkData) {
            const conversationId = conv.conversation_id || conv.conversationId;
            const payload = conv.data || conv.payload || conv;

            allRecords.push({
              conversationId,
              traceCount: conv.trace_count || conv.traceCount || payload.traces?.length || 0,
              payload: {
                consumer_profile: payload.consumer_profile,
                ids: payload.ids,
                query_log: payload.query_log,
                timestamps: payload.timestamps,
                trace_count: payload.trace_count || conv.trace_count,
                traces: payload.traces,
              },
            });
          }

          // Update progress after each chunk
          setLoadingProgress({ loaded: allRecords.length, total: totalConversations });
          setSourceLabel(`Loading conversations... (${allRecords.length}/${totalConversations})`);

          // Allow UI to update between chunks
          await new Promise(resolve => setTimeout(resolve, 0));
        }

        setRecords(allRecords);
        setSelectedId(allRecords[0]?.conversationId);
        setActiveTraceIndex(0);
        setSourceLabel(`VOX Traces (${allRecords.length} conversations)`);
        setErrorMessage(null);
        setLoadingProgress(null);
        setIsLoading(false);
        return;
      }

      // Fallback: Try to load sample JSON traces
      const response = await fetch("/data/sample_traces.json");
      if (!response.ok) {
        // No sample data available, just show upload prompt
        setSourceLabel("No data loaded");
        setIsLoading(false);
        return;
      }
      const text = await response.text();
      parseJsonData(text, "sample_traces.json (3 conversations)");
    } catch (error) {
      console.error(error);
      // Don't show error, just indicate no data loaded
      setSourceLabel("No data loaded");
    } finally {
      setIsLoading(false);
      setLoadingProgress(null);
    }
  }, [parseJsonData]);

  useEffect(() => {
    loadDemo();
    loadGradingData();
  }, [loadDemo, loadGradingData]);

  const selectedRecord = records.find(
    (record) => record.conversationId === selectedId,
  );

  // Enrich selectedRecord with grading data
  const enrichedRecord = useMemo(() => {
    if (!selectedRecord || gradingLookup.size === 0) return selectedRecord;

    const enrichedTraces = selectedRecord.payload.traces?.map((trace, traceIndex) => {
      const enrichedCarousels = trace.store_recommendations?.map((carousel, carouselIndex) => {
        // Determine rewrite_id for this carousel
        // For carousel_index 0, use "trace_{traceIndex}_rewrite_0" (original query)
        // For carousel_index > 0, use the corresponding rewrite
        let rewriteId = `trace_${traceIndex}_rewrite_0`;
        if (carouselIndex > 0 && trace.rewritten_queries && trace.rewritten_queries.length >= carouselIndex) {
          rewriteId = `trace_${traceIndex}_rewrite_${carouselIndex}`;
        }

        const enrichedStores = attachGradingToStores(
          selectedRecord.conversationId,
          traceIndex,
          rewriteId,
          carousel.carousel_index ?? carouselIndex,
          carousel.stores ?? []
        );

        return {
          ...carousel,
          stores: enrichedStores,
        };
      });

      return {
        ...trace,
        store_recommendations: enrichedCarousels,
      };
    });

    return {
      ...selectedRecord,
      payload: {
        ...selectedRecord.payload,
        traces: enrichedTraces,
      },
    };
  }, [selectedRecord, gradingLookup, attachGradingToStores]);

  useEffect(() => {
    if (
      selectedRecord &&
      selectedRecord.payload.traces &&
      selectedRecord.payload.traces.length <= activeTraceIndex
    ) {
      setActiveTraceIndex(0);
    }
  }, [selectedRecord, activeTraceIndex]);

  const filteredRecords = useMemo(() => {
    if (!searchTerm.trim()) return records;
    const term = searchTerm.toLowerCase();
    return records.filter((record) => {
      if (record.conversationId.toLowerCase().includes(term)) return true;
      const consumerId = record.payload.ids?.consumer_id ?? "";
      if (consumerId.toLowerCase().includes(term)) return true;
      const traceMatch = record.payload.traces?.some((trace) =>
        (trace.original_query ?? "").toLowerCase().includes(term),
      );
      if (traceMatch) return true;
      const queryMatch = record.payload.query_log?.some(
        (item) =>
          item.original_query?.toLowerCase().includes(term) ||
          item.rewrites?.some((rewrite) =>
            rewrite.rewritten_query?.toLowerCase().includes(term),
          ),
      );
      return Boolean(queryMatch);
    });
  }, [records, searchTerm]);

  useEffect(() => {
    if (!filteredRecords.length) return;
    if (!selectedId || !filteredRecords.some((r) => r.conversationId === selectedId)) {
      setSelectedId(filteredRecords[0].conversationId);
    }
  }, [filteredRecords, selectedId]);

  const stats = useMemo(() => {
    const totalTraces = records.reduce(
      (sum, record) => sum + (record.payload.trace_count ?? record.traceCount),
      0,
    );
    const timestamps = records
      .map((record) => record.payload.timestamps)
      .filter(Boolean) as Array<{ beginning?: string; ending?: string }>;
    return {
      totalConversations: records.length,
      totalTraces,
      range: getRangeLabel(timestamps),
    };
  }, [records]);

  const consumerProfile = enrichedRecord?.payload.consumer_profile;
  const overallProfile =
    consumerProfile?.profile && typeof consumerProfile.profile === "object"
      ? (consumerProfile.profile as Record<string, unknown>)
      : undefined;
  const overallDetails =
    overallProfile &&
    "overall_profile" in overallProfile &&
    typeof overallProfile.overall_profile === "object"
      ? (overallProfile.overall_profile as Record<string, unknown>)
      : undefined;

  const dietaryPreferences =
    overallDetails &&
    "dietary_preferences" in overallDetails &&
    typeof overallDetails.dietary_preferences === "object"
      ? (overallDetails.dietary_preferences as Record<string, unknown>)
      : undefined;

  const activeTrace: TraceDetail | undefined =
    enrichedRecord?.payload.traces?.[activeTraceIndex];

  const handleUpload: React.ChangeEventHandler<HTMLInputElement> = async (
    event,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    setLoadingProgress(null);
    setSourceLabel(`Processing ${file.name}...`);

    try {
      const text = await file.text();

      // Detect file type by extension or content
      if (file.name.endsWith('.json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
        // Parse JSON with progress updates (non-blocking)
        await new Promise<void>((resolve, reject) => {
          // Use setTimeout to allow UI to update
          setTimeout(() => {
            try {
              const data = JSON.parse(text);
              const conversations = Array.isArray(data) ? data : data.conversations || data.traces || [];

              if (!conversations.length) {
                reject(new Error("No conversations found in JSON"));
                return;
              }

              setLoadingProgress({ loaded: 0, total: conversations.length });

              // Process in batches to keep UI responsive
              const batchSize = 10;
              const nextRecords: TraceRecord[] = [];

              const processBatch = (startIdx: number) => {
                const endIdx = Math.min(startIdx + batchSize, conversations.length);

                for (let i = startIdx; i < endIdx; i++) {
                  const conv = conversations[i];
                  const conversationId = (conv.conversation_id || conv.conversationId || `conv_${i}`) as string;
                  const payload = (conv.data || conv.payload || conv) as Record<string, unknown>;

                  nextRecords.push({
                    conversationId,
                    traceCount: (conv.trace_count || conv.traceCount || (payload.traces as unknown[])?.length || 0) as number,
                    payload: {
                      consumer_profile: payload.consumer_profile as Record<string, unknown>,
                      ids: payload.ids as Record<string, string>,
                      query_log: payload.query_log as Array<Record<string, unknown>>,
                      timestamps: payload.timestamps as Record<string, string>,
                      trace_count: (payload.trace_count || conv.trace_count) as number,
                      traces: payload.traces as TraceDetail[],
                    },
                  });
                }

                setLoadingProgress({ loaded: nextRecords.length, total: conversations.length });
                setSourceLabel(`Processing ${file.name}... (${nextRecords.length}/${conversations.length})`);

                if (endIdx < conversations.length) {
                  // Continue processing next batch
                  setTimeout(() => processBatch(endIdx), 0);
                } else {
                  // Done processing
                  setRecords(nextRecords);
                  setSelectedId(nextRecords[0].conversationId);
                  setActiveTraceIndex(0);
                  setSourceLabel(`${file.name} (${nextRecords.length} conversations)`);
                  setErrorMessage(null);
                  resolve();
                }
              };

              processBatch(0);
            } catch (error) {
              reject(error instanceof Error ? error : new Error("Failed to parse JSON"));
            }
          }, 0);
        });
      } else {
        parseCsv(text, file.name);
      }
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to read the file.",
      );
    } finally {
      setIsLoading(false);
      setLoadingProgress(null);
    }
  };

  const showEmpty =
    !isLoading && (!records.length || !enrichedRecord || !filteredRecords.length);

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-black/10 bg-white p-4">
        <div className="flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-black/50">
            Data Source
          </p>
          <p className="mt-0.5 font-semibold text-black">{sourceLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="trace-upload"
            type="file"
            accept=".csv,.json,text/csv,application/json"
            className="hidden"
            onChange={handleUpload}
          />
          <label
            htmlFor="trace-upload"
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-black/80"
          >
            <Upload className="h-4 w-4" /> Upload CSV or JSON
          </label>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <InsightCard
          label="Conversations"
          value={stats.totalConversations}
        />
        <InsightCard label="Traces" value={stats.totalTraces} />
        <div className="rounded-lg border border-black/10 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-black/50">
            Activity Window
          </p>
          <p className="mt-1 text-sm font-semibold text-black">{stats.range}</p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Sidebar */}
        <div className="space-y-4 lg:col-span-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40" />
            <input
              type="search"
              placeholder="Search conversations..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full rounded-lg border border-black/10 bg-white py-2.5 pl-10 pr-4 text-sm text-black placeholder:text-black/40 focus:border-black focus:outline-none focus:ring-1 focus:ring-black"
            />
          </div>

          <div className="max-h-[600px] space-y-2 overflow-y-auto rounded-lg border border-black/10 bg-white p-3">
            {filteredRecords.map((record) => (
              <button
                key={record.conversationId}
                onClick={() => setSelectedId(record.conversationId)}
                className={cn(
                  "w-full rounded-lg border p-3 text-left transition",
                  selectedId === record.conversationId
                    ? "border-black bg-black text-white"
                    : "border-black/10 bg-white text-black hover:border-black/30",
                )}
              >
                <p className="text-sm font-semibold">
                  {record.conversationId}
                </p>
                <p className="mt-0.5 text-xs opacity-60">
                  {record.payload.ids?.consumer_id ?? "Unknown"}
                </p>
                <div className="mt-2 flex items-center justify-between text-xs opacity-60">
                  <span>{record.payload.trace_count ?? record.traceCount} traces</span>
                  <span>
                    {formatDateTime(record.payload.timestamps?.ending ?? "")}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="space-y-6 lg:col-span-8">
          {isLoading && (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-black/10 bg-white py-16">
              <Loader2 className="h-6 w-6 animate-spin text-black" />
              <p className="text-sm text-black/60">
                {loadingProgress
                  ? `Loading conversations... (${loadingProgress.loaded}/${loadingProgress.total})`
                  : "Loading trace data..."}
              </p>
              {loadingProgress && (
                <div className="w-64">
                  <div className="h-2 w-full rounded-full bg-black/10">
                    <div
                      className="h-2 rounded-full bg-black transition-all duration-300"
                      style={{
                        width: `${(loadingProgress.loaded / loadingProgress.total) * 100}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-center text-xs text-black/40">
                    {Math.round((loadingProgress.loaded / loadingProgress.total) * 100)}%
                  </p>
                </div>
              )}
            </div>
          )}

          {errorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              {errorMessage}
            </div>
          )}

          {showEmpty && !errorMessage && (
            <EmptyState message="No conversation selected" />
          )}

          {!showEmpty && enrichedRecord && (
            <div className="space-y-6">
              {/* Conversation Header */}
              <div className="rounded-lg border border-black/10 bg-white p-6">
                <div className="mb-4 border-b border-black/10 pb-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-black/50">
                    Conversation
                  </p>
                  <h2 className="mt-1 text-2xl font-bold text-black">
                    {enrichedRecord.conversationId}
                  </h2>
                  {enrichedRecord.payload.ids?.consumer_id && (
                    <p className="mt-1 text-sm text-black/60">
                      Consumer: {enrichedRecord.payload.ids.consumer_id}
                    </p>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-black/50">
                      Session ID
                    </p>
                    <p className="mt-1 text-sm font-mono text-black">
                      {enrichedRecord.payload.ids?.session_id ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-black/50">
                      Last Updated
                    </p>
                    <p className="mt-1 text-sm text-black">
                      {formatDateTime(enrichedRecord.payload.timestamps?.ending ?? "")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Consumer Profile */}
              {overallDetails && (
                <div className="rounded-lg border border-black/10 bg-white p-6">
                  <h3 className="mb-4 text-lg font-bold text-black">Consumer Profile</h3>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4">
                      <p className="text-xs font-medium uppercase tracking-wider text-black/50">
                        Cuisine Preferences
                      </p>
                      <p className="mt-2 text-sm text-black">
                        {(overallDetails.cuisine_preferences as string) ?? "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4">
                      <p className="text-xs font-medium uppercase tracking-wider text-black/50">
                        Meal Tendencies
                      </p>
                      <p className="mt-2 text-sm text-black">
                        {(overallDetails.food_preferences as string) ?? "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4">
                      <p className="text-xs font-medium uppercase tracking-wider text-black/50">
                        Price Sensitivity
                      </p>
                      <p className="mt-2 text-sm text-black">
                        {(overallDetails.price_sensitivity as string) ?? "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4">
                      <p className="text-xs font-medium uppercase tracking-wider text-black/50">
                        Reordering Pattern
                      </p>
                      <p className="mt-2 text-sm text-black">
                        {(overallDetails.reordering_tendency as string) ?? "—"}
                      </p>
                    </div>
                  </div>

                  {dietaryPreferences && (
                    <div className="mt-4 rounded-lg border border-black/10 bg-black/[0.02] p-4">
                      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-black/50">
                        Dietary Profile
                      </p>
                      <dl className="grid gap-3 md:grid-cols-3">
                        {Object.entries(dietaryPreferences).map(([key, value]) => (
                          <div key={key}>
                            <dt className="text-xs text-black/50">
                              {friendlyDaypart(key)}
                            </dt>
                            <dd className="mt-0.5 text-sm font-medium text-black">
                              {String(value)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}
                </div>
              )}

              {/* Daypart Breakdown */}
              {consumerProfile?.breakdown && (
                <div className="rounded-lg border border-black/10 bg-white p-6">
                  <h3 className="mb-4 text-lg font-bold text-black">Daypart Analysis</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    {Object.entries(consumerProfile.breakdown).map(([key, value]) => {
                      const detail =
                        typeof value === "object" && value !== null
                          ? (value as Record<string, unknown>)
                          : {};
                      return (
                        <div
                          key={key}
                          className="rounded-lg border border-black/10 bg-black/[0.02] p-4"
                        >
                          <p className="font-semibold text-black">
                            {friendlyDaypart(key)}
                          </p>
                          <p className="mt-1 text-xs text-black/50">
                            {detail.cuisine_preferences ? String(detail.cuisine_preferences) : "—"}
                          </p>
                          <p className="mt-2 text-sm text-black/80">
                            {detail.food_preferences ? String(detail.food_preferences) : "No data"}
                          </p>
                          {Boolean(detail.lifestyle_summary) && (
                            <p className="mt-2 text-xs text-black/50">
                              {String(detail.lifestyle_summary)}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Query Timeline */}
              {enrichedRecord.payload.query_log && (
                <div className="rounded-lg border border-black/10 bg-white p-6">
                  <h3 className="mb-4 text-lg font-bold text-black">Query Timeline</h3>
                  <div className="space-y-0">
                    {enrichedRecord.payload.query_log.map((entry, index) => (
                      <TimelineItem
                        key={`${entry.trace_id ?? index}-timeline`}
                        title={entry.original_query ?? "Unknown query"}
                        subtitle={
                          entry.rewrites && entry.rewrites.length > 0
                            ? `→ ${entry.rewrites
                                .map((rewrite) => rewrite.rewritten_query)
                                .join(", ")}`
                            : undefined
                        }
                        timestamp={entry.rewrites?.[0]?.timestamp}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Trace Explorer */}
              {enrichedRecord.payload.traces && enrichedRecord.payload.traces.length > 0 && (
                <div className="rounded-lg border border-black/10 bg-white p-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-bold text-black">Trace Explorer</h3>
                      <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black">
                        {enrichedRecord.payload.traces.length} {enrichedRecord.payload.traces.length === 1 ? 'trace' : 'traces'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setShowAllTraces(!showAllTraces)}
                        className={cn(
                          "rounded-lg px-4 py-1.5 text-sm font-medium transition",
                          showAllTraces
                            ? "bg-black text-white"
                            : "border border-black/10 bg-white text-black hover:bg-black/5",
                        )}
                      >
                        {showAllTraces ? "Single View" : "All Traces"}
                      </button>
                      {!showAllTraces && enrichedRecord.payload.traces.map((_trace, index) => (
                        <button
                          key={`trace-pill-${index}`}
                          onClick={() => setActiveTraceIndex(index)}
                          className={cn(
                            "rounded-lg px-4 py-1.5 text-sm font-medium transition",
                            activeTraceIndex === index
                              ? "bg-black text-white"
                              : "border border-black/10 bg-white text-black hover:border-black/30",
                          )}
                        >
                          Trace {index + 1}
                        </button>
                      ))}
                    </div>
                  </div>

                  {showAllTraces ? (
                    <div className="space-y-8">
                      {enrichedRecord.payload.traces.map((trace, traceIdx) => (
                        <div key={`all-trace-${traceIdx}`} className="relative">
                          {/* Trace Number Badge */}
                          <div className="mb-4 flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-sm font-bold text-white">
                              {traceIdx + 1}
                            </div>
                            <div className="h-px flex-1 bg-black/10" />
                          </div>

                          {/* Query and Rewrites */}
                          <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4">
                            <div className="flex items-start gap-3">
                              <div className="mt-1 flex-shrink-0">
                                <Search className="h-5 w-5 text-black/40" />
                              </div>
                              <div className="flex-1 space-y-2">
                                <div>
                                  <p className="text-xs font-medium uppercase tracking-wider text-black/50">
                                    Original Query
                                  </p>
                                  <p className="mt-1 text-xl font-semibold text-black">
                                    {trace.original_query || "No query"}
                                  </p>
                                </div>
                                {trace.rewritten_queries && trace.rewritten_queries.length > 0 && (
                                  <div className="border-t border-black/10 pt-2">
                                    <p className="text-xs font-medium uppercase tracking-wider text-black/50">
                                      Rewrites
                                    </p>
                                    <div className="mt-1 flex flex-wrap gap-2">
                                      {trace.rewritten_queries.map((rewrite, rwIdx) => (
                                        <span
                                          key={`rw-${traceIdx}-${rwIdx}`}
                                          className="rounded-md border border-black/10 bg-white px-3 py-1 text-sm text-black"
                                        >
                                          {rewrite.rewritten_query}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Store Recommendations */}
                          {trace.store_recommendations && trace.store_recommendations.length > 0 && (
                            <div className="mt-4 space-y-4">
                              {trace.store_recommendations
                                .sort((a, b) => (a.carousel_index ?? 0) - (b.carousel_index ?? 0))
                                .map((carousel, carIdx) => (
                                  <div key={`carousel-${traceIdx}-${carIdx}`} className="rounded-lg border border-black/5 bg-black/[0.01] p-4">
                                    <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-black">
                                      <span className="rounded bg-black/10 px-2 py-0.5">
                                        {(carousel as any).carousel_name || (carousel as any).title || `Carousel ${carousel.carousel_index ?? carIdx}`}
                                      </span>
                                      <span className="text-black/40">
                                        {carousel.stores?.length || 0} stores
                                      </span>
                                    </p>
                                    <div className="overflow-x-auto">
                                      <div className="flex gap-4 pb-2" style={{ minWidth: 'min-content' }}>
                                        {(carousel.stores ?? []).map((store, storeIdx) => (
                                          <div key={`${traceIdx}-${carIdx}-${storeIdx}-${store.business_id}`} className="w-80 flex-shrink-0">
                                            <StoreCard
                                              store={store}
                                              onDoubleClick={setSelectedStoreDetail}
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}

                          {/* Divider between traces */}
                          {enrichedRecord.payload.traces && traceIdx < enrichedRecord.payload.traces.length - 1 && (
                            <div className="mt-8 flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-black/30">
                              <div className="h-px flex-1 bg-black/10" />
                              <span>Follow-up Trace</span>
                              <div className="h-px flex-1 bg-black/10" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : activeTrace ? (
                    <div className="space-y-4">
                      <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4">
                        <p className="text-xs font-medium uppercase tracking-wider text-black/50">
                          Original Query
                        </p>
                        <p className="mt-2 text-xl font-semibold text-black">
                          {activeTrace.original_query}
                        </p>
                        {activeTrace.rewritten_queries &&
                          activeTrace.rewritten_queries.length > 0 && (
                            <div className="mt-3 border-t border-black/10 pt-3">
                              <p className="text-xs font-medium uppercase tracking-wider text-black/50">
                                Rewrites
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {activeTrace.rewritten_queries.map((rewrite, idx) => (
                                  <span
                                    key={`rewrite-${idx}`}
                                    className="rounded-md border border-black/10 bg-white px-3 py-1 text-sm text-black"
                                  >
                                    {rewrite.rewritten_query}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                      </div>

                      {activeTrace.store_recommendations && activeTrace.store_recommendations.length > 0 && (
                        <div className="space-y-4">
                          {activeTrace.store_recommendations
                            .sort((a, b) => (a.carousel_index ?? 0) - (b.carousel_index ?? 0))
                            .map((carousel, carIdx) => (
                              <div key={`carousel-${carIdx}`} className="rounded-lg border border-black/5 bg-black/[0.01] p-4">
                                <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-black">
                                  <span className="rounded bg-black/10 px-2 py-0.5">
                                    {(carousel as any).carousel_name || (carousel as any).title || `Carousel ${carousel.carousel_index ?? carIdx}`}
                                  </span>
                                  <span className="text-black/40">
                                    {carousel.stores?.length || 0} stores
                                  </span>
                                </p>
                                <div className="overflow-x-auto">
                                  <div className="flex gap-4 pb-2" style={{ minWidth: 'min-content' }}>
                                    {(carousel.stores ?? []).map((store, storeIdx) => (
                                      <div key={`${carIdx}-${storeIdx}-${store.business_id}`} className="w-80 flex-shrink-0">
                                        <StoreCard
                                          store={store}
                                          onDoubleClick={setSelectedStoreDetail}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <EmptyState message="Select a trace to view details" />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Store Detail Modal */}
      {selectedStoreDetail && (
        <StoreDetailModal
          store={selectedStoreDetail}
          onClose={() => setSelectedStoreDetail(null)}
        />
      )}
    </div>
  );
};

export default TraceDashboard;
