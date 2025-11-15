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

export interface TraceStore {
  store_name?: string;
  business_id?: string;
  address?: string;
  cuisine?: string;
  eta_minutes?: string;
  distance_miles?: string;
  dietary_options?: string;
  menu_items?: TraceStoreMenuItem[];
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

