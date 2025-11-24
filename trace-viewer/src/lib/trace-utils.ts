export interface CsvRow {
  CONVERSATION_ID?: string;
  TRACE_COUNT?: string;
  CONVERSATION_JSON?: string;
  [key: string]: string | undefined;
}

export interface QueryRewrite {
  rewritten_query?: string;
  timestamp?: string;
}

export interface QueryLogEntry {
  original_query?: string;
  rewrites?: QueryRewrite[];
  trace_id?: string;
}

export interface TraceStoreMenuItem {
  item_id?: number | string;
  item_webster_tags?: unknown;
  profile?: unknown;
  [key: string]: unknown;
}

export interface GradingScores {
  is_serving_matched?: "Yes" | "No" | "NA to Query";
  is_serving_more_than_three_items?: "Yes" | "No" | "NA to Query";
  is_primary_serving?: "Yes" | "No" | "NA to Query";
  is_dietary_serving?: "Yes" | "No" | "NA to Query";
  is_flavor_match?: "Yes" | "No" | "NA to Query";
  is_ingredient_present?: "Yes" | "No" | "NA to Query";
  is_prep_style_matched?: "Yes" | "No" | "NA to Query";
  is_exact_restaurant?: "Yes" | "No" | "NA to Query";
  is_similar_restaurant?: "Yes" | "No" | "NA to Query";
  is_portion_matched?: "Yes" | "No" | "NA to Query";
  is_group_matched?: "Yes" | "No" | "NA to Query";
  is_nearby?: "Yes" | "No" | "NA to Query";
  is_fast_delivery?: "Yes" | "No" | "NA to Query";
  is_top_rated?: "Yes" | "No" | "NA to Query";
  is_overall_rating_good?: "Yes" | "No" | "NA to Query";
  is_store_open?: "Yes" | "No" | "NA to Query";
  is_price_match?: "Yes" | "No" | "NA to Query";
  is_fast_delivery_check?: "Yes" | "No" | "NA to Query";
}

export interface GradingResult {
  conversation_id: string;
  trace_index: number;
  rewrite_id: string;
  carousel_index: number;
  query: string;
  original_query: string;
  store_id: string;
  store_name: string;
  scores: GradingScores;
  weighted_score_pct: number;
  earned_pts: number;
  applicable_pts: number;
  label: "relevant" | "not_relevant";
  rationale: string;
  error: string | null;
}

export interface GradingMetadata {
  total_tasks: number;
  timestamp: string;
  score_mapping: Record<string, number>;
}

export interface GradingData {
  metadata: GradingMetadata;
  results: GradingResult[];
}

// Fuzzy Grading Interfaces
export interface FuzzyGradingCheck {
  passed?: boolean;
  points?: number;
  reason?: string;
  tier?: number;
  is_gate_violation?: boolean;
}

export interface FuzzyGradingResult {
  conversation_id: string;
  consumer_id: string;
  trace_index: number;
  rewrite_id: string;
  carousel_index: number;
  query: string;
  recommendation: string;
  normalized_query: string;
  normalized_recommendation: string;

  // Fuzzy matching scores
  fuzzy_query_to_rec: number;
  fuzzy_rec_to_top_item: number;
  fuzzy_max_item_similarity: number;
  fuzzy_passed: boolean;

  // LLM judge scores
  relevance_format_score: number;
  serendipity_score: number;
  weighted_score: number;
  weighted_score_pct: number;

  // Detailed checks
  relevance_checks: Record<string, FuzzyGradingCheck>;
  serendipity_checks: Record<string, FuzzyGradingCheck>;

  // Reasoning
  relevance_format_reasoning: string;
  serendipity_reasoning: string;
  overall_reasoning: string;

  // Label and metadata
  label: "relevant" | "not_relevant";
  judge_model: string;
  elapsed_ms: number;
  status: string;
  error: string | null;
}

export interface FuzzyGradingData {
  metadata: {
    total_tasks: number;
    timestamp: string;
    grading_type: string;
    score_mapping: Record<string, number>;
  };
  results: FuzzyGradingResult[];
}

export interface TraceStore {
  store_name?: string;
  business_id?: string;
  address?: string;
  cuisine?: string;
  eta_minutes?: string;
  distance_miles?: string;
  dietary_options?: string;
  menu_items?: TraceStoreMenuItem[];
  grading?: GradingResult;
  [key: string]: unknown;
}

export interface StoreCarousel {
  carousel_index?: number;
  stores: TraceStore[];
}

export interface TraceDetail {
  original_query?: string;
  rewritten_queries?: QueryRewrite[];
  store_recommendations?: StoreCarousel[];
  [key: string]: unknown;
}

export interface ConsumerProfile {
  profile?: unknown;
  breakdown?: Record<string, unknown>;
  top_ordered_store_ids?: Record<string, string>;
  top_ordered_items?: Record<string, string>;
  lifestyle_inference?: string;
  [key: string]: unknown;
}

export interface ConversationPayload {
  consumer_profile?: ConsumerProfile;
  ids?: Record<string, string>;
  query_log?: QueryLogEntry[];
  timestamps?: {
    beginning?: string;
    ending?: string;
    [key: string]: string | undefined;
  };
  trace_count?: number;
  traces?: TraceDetail[];
  [key: string]: unknown;
}

export interface TraceRecord {
  conversationId: string;
  traceCount: number;
  payload: ConversationPayload;
}

const looksLikeJson = (value: string) => {
  const trimmed = value.trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
};

export const safeParseJson = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  if (!looksLikeJson(value)) return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const parseMenuItems = (items?: TraceStoreMenuItem[]) => {
  if (!items?.length) return [];
  return items.map((item) => ({
    ...item,
    item_webster_tags: safeParseJson(item.item_webster_tags),
    profile: safeParseJson(item.profile),
  }));
};

const parseStoreRecommendations = (recommendations?: StoreCarousel[]) => {
  if (!recommendations?.length) return [];
  return recommendations.map((carousel) => ({
    ...carousel,
    stores: (carousel.stores ?? []).map((store) => ({
      ...store,
      menu_items: parseMenuItems(store.menu_items),
    })),
  }));
};

const hydratePayload = (payload: ConversationPayload): ConversationPayload => {
  const consumerProfile = payload.consumer_profile
    ? {
        ...payload.consumer_profile,
        profile: safeParseJson(payload.consumer_profile.profile),
      }
    : undefined;

  const traces = payload.traces?.map((trace) => ({
    ...trace,
    rewritten_queries: trace.rewritten_queries ?? [],
    store_recommendations: parseStoreRecommendations(
      trace.store_recommendations,
    ),
  }));

  return {
    ...payload,
    consumer_profile: consumerProfile,
    traces,
  };
};

export const buildTraceRecords = (rows: CsvRow[]): TraceRecord[] => {
  const results: TraceRecord[] = [];

  for (const row of rows) {
    if (!row.CONVERSATION_ID || !row.CONVERSATION_JSON) continue;
    try {
      const rawPayload = JSON.parse(row.CONVERSATION_JSON) as ConversationPayload;
      const payload = hydratePayload(rawPayload);
      const derivedCount =
        typeof row.TRACE_COUNT !== "undefined" && row.TRACE_COUNT !== ""
          ? Number(row.TRACE_COUNT)
          : payload.trace_count ?? payload.traces?.length ?? 0;
      const traceCount = Number.isFinite(derivedCount) ? Number(derivedCount) : 0;

      results.push({
        conversationId: row.CONVERSATION_ID,
        traceCount,
        payload: {
          ...payload,
          trace_count: payload.trace_count ?? traceCount,
        },
      });
    } catch (error) {
      console.error("Failed to parse conversation JSON", error);
    }
  }

  return results;
};

