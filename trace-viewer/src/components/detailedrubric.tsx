"use client";

import { FileText } from 'lucide-react';

export default function DetailedRubric() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-black/10 dark:border-gray-700 p-6 sticky top-4 max-h-[calc(100vh-100px)] overflow-y-auto">
      <h3 className="text-lg font-bold mb-4 flex items-center gap-2 sticky top-0 bg-white dark:bg-gray-800 pb-2 border-b border-black/10 dark:border-gray-700 text-black dark:text-white">
        <FileText size={20} />
        Evaluation Rubric v2.0
      </h3>

      <div className="space-y-6">
        {/* Relevance & Format Section */}
        <div>
          <h4 className="font-bold text-base text-black dark:text-white mb-3 flex items-center gap-2">
            <span className="bg-black dark:bg-white text-white dark:text-black rounded-full w-6 h-6 flex items-center justify-center text-sm">1</span>
            Relevance & Format (70%)
          </h4>

          <div className="space-y-3 text-sm">
            <RubricItem
              points="+3"
              title="Primary Intent Match"
              yes="Does the dish or cuisine match the main idea in the query (flavor, vibe, mood)?"
              no="Contradicts intent"
              color="blue"
            />

            <RubricItem
              points="+2"
              title="Descriptive Traits Preserved"
              yes="Does the dish reflect ALL descriptive traits in the query (e.g., spicy AND cheesy)?"
              no="Missing or contradicting traits"
              color="blue"
            />

            <RubricItem
              points="+2"
              title="Category/Dietary Label Match"
              yes="Does the dish match the category or dietary label (e.g., healthy, keto, fast food)?"
              no="Wrong category or label"
              color="blue"
            />

            <RubricItem
              points="+2"
              title="Situational Suitability"
              yes="Is the dish suitable for the situation or use case (e.g., car, group, office)?"
              no="Inappropriate for context"
              color="blue"
            />

            <RubricItem
              points="+2"
              title="Explicit Constraints Met"
              yes="Were explicit constraints (price, delivery time, allergy, group size) correctly carried into the rewrite?"
              no="Constraints violated or ignored"
              color="blue"
            />

            <RubricItem
              points="+1"
              title="Profile Compliant [GATE CHECK]"
              yes="The dish respects consumer preference, esp dietary, allergies, religious restrictions, lifestyle choices"
              no="Violates profile restrictions or preference"
              color="red"
              gate={true}
            />

            <RubricItem
              points="+2"
              title="Output Clarity"
              yes="Does the output directly suggest a cuisine or dish?"
              no="Still vague or ambiguous"
              color="blue"
            />

            <RubricItem
              points="+2"
              title="Mainstream Availability"
              yes="Is the dish something you'd expect on a mainstream U.S. menu (not niche or invented)?"
              no="Too niche or doesn't exist"
              color="blue"
            />

            <RubricItem
              points="+2"
              title="Format Correctness"
              yes="Is the dish formatted correctly (no junk tokens, partial phrases, or cue errors)?"
              no="Contains formatting errors"
              color="blue"
            />

            <RubricItem
              points="+2"
              title="Conciseness"
              yes="Is the rewrite concise, avoiding unnecessary words or repetition?"
              no="Verbose or repetitive"
              color="blue"
            />
          </div>

          <div className="mt-3 p-3 bg-black/[0.02] dark:bg-white/[0.02] rounded-lg border border-black/5 dark:border-white/5">
            <p className="text-xs font-semibold text-black dark:text-white">
              Total: 20 points → Normalized to 10 points
            </p>
            <p className="text-xs text-black/70 dark:text-white/70 mt-1">
              Formula: (Sum of checks / 20) × 10
            </p>
          </div>
        </div>

        {/* Serendipity Section */}
        <div>
          <h4 className="font-bold text-base text-black dark:text-white mb-3 flex items-center gap-2">
            <span className="bg-black dark:bg-white text-white dark:text-black rounded-full w-6 h-6 flex items-center justify-center text-sm">2</span>
            Serendipity (30%)
          </h4>

          {/* Novelty Tiers */}
          <div className="mb-4 p-4 bg-black/[0.02] dark:bg-white/[0.02] rounded-lg border border-black/5 dark:border-white/5">
            <h5 className="font-semibold text-sm mb-2 text-black dark:text-white">Cuisine & Dish Novelty (0-5 points)</h5>
            <div className="space-y-2 text-xs">
              <NoveltyTier
                tier="6"
                points="+5.0"
                title="Completely new dish in CONNECTED new cuisine"
                example="Japanese ramen → Vietnamese spring rolls"
              />
              <NoveltyTier
                tier="5"
                points="+4.0"
                title="Completely new dish in SAME familiar cuisine"
                example="Japanese ramen → Japanese tempura"
              />
              <NoveltyTier
                tier="4"
                points="+3.0"
                title="Same/similar dish in CONNECTED new cuisine"
                example="Japanese ramen → Vietnamese pho (both noodle soups)"
              />
              <NoveltyTier
                tier="3"
                points="+2.0"
                title="Similar dish in SAME familiar cuisine"
                example="Japanese ramen → Japanese udon (both noodles)"
              />
              <NoveltyTier
                tier="2"
                points="+1.0"
                title="SAME dish SAME cuisine (variants only)"
                example="Tonkotsu ramen → Shoyu ramen"
              />
              <NoveltyTier
                tier="1"
                points="+0.0"
                title="Completely new dish in DISCONNECTED cuisine"
                example="Japanese ramen → Ethiopian injera"
              />
            </div>

            <div className="mt-3 p-2 bg-white dark:bg-gray-800 rounded border border-black/10 dark:border-gray-700">
              <p className="text-xs font-semibold mb-1 text-black dark:text-white">Culinary Connection Groups:</p>
              <p className="text-xs text-black/70 dark:text-white/70">East Asian, South/SE Asian, Mediterranean, Latin American, Western</p>
              <p className="text-xs font-semibold mt-2 mb-1 text-black dark:text-white">Shared Flavor Philosophy:</p>
              <p className="text-xs text-black/70 dark:text-white/70">Spicy/bold, Umami, Fresh/herbaceous, Rich/creamy, Comfort</p>
            </div>
          </div>

          {/* Binary Checks */}
          <div className="space-y-3 text-sm">
            <RubricItem
              points="+1"
              title="Low Discoverability"
              yes="Requires knowledge/bridges, not obvious from history"
              no="Obvious or highly discoverable"
              color="purple"
            />

            <RubricItem
              points="+1"
              title="Familiar Ingredients in New Context"
              yes="Uses ingredients the user knows from order history but in new dishes/cuisine (e.g., user orders chicken → Korean fried chicken). DEFAULT YES if unable to determine"
              no="No connection to familiar ingredients"
              color="purple"
            />

            <RubricItem
              points="+1"
              title="Context Fit While Novel"
              yes="Maintains query intent AND novel"
              no="Doesn't fit context or not novel"
              color="purple"
            />

            <RubricItem
              points="+1"
              title='"Aha Moment"'
              yes="Non-obvious but makes sense in hindsight"
              no="Obvious or completely random"
              color="purple"
            />

            <RubricItem
              points="+1"
              title="Creates Curiosity"
              yes='"I want to try this!" personalized feel'
              no="Generic, random, uninteresting"
              color="purple"
            />
          </div>
        </div>

        {/* Weighted Score */}
        <div className="p-4 bg-black dark:bg-white rounded-lg border border-black dark:border-white">
          <h4 className="font-bold text-sm text-white dark:text-black mb-2">Final Weighted Score</h4>
          <p className="text-sm text-white/90 dark:text-black/90 font-mono">
            (Relevance × 0.70) + (Serendipity × 0.30)
          </p>
        </div>

        {/* Gate Warning */}
        <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-400 dark:border-gray-600">
          <p className="text-sm font-bold text-black dark:text-white">
            ⚠️ GATE CHECK: Profile Compliant
          </p>
          <p className="text-xs text-black/70 dark:text-white/70 mt-1">
            If "Profile compliant" is NO (violates dietary restrictions, allergies, religious restrictions), the entire Relevance score = 0
          </p>
        </div>
      </div>
    </div>
  );
}

function RubricItem({
  points,
  title,
  yes,
  no,
  color,
  gate = false,
}: {
  points: string;
  title: string;
  yes: string;
  no: string;
  color: 'blue' | 'purple' | 'red';
  gate?: boolean;
}) {
  const colorClasses = {
    blue: 'bg-black/[0.02] dark:bg-white/[0.02] border-black/5 dark:border-white/5',
    purple: 'bg-black/[0.02] dark:bg-white/[0.02] border-black/5 dark:border-white/5',
    red: 'bg-gray-100 dark:bg-gray-800 border-gray-400 dark:border-gray-600',
  };

  const pointsClasses = {
    blue: 'bg-gray-700 dark:bg-gray-300',
    purple: 'bg-gray-700 dark:bg-gray-300',
    red: 'bg-black dark:bg-white',
  };

  return (
    <div className={`p-3 rounded-lg border ${colorClasses[color]} ${gate ? 'ring-1 ring-black/20 dark:ring-white/20' : ''}`}>
      <div className="flex items-start gap-2 mb-2">
        <span className={`${pointsClasses[color]} ${color === 'red' ? 'text-white dark:text-black' : 'text-white dark:text-black'} text-xs font-bold px-2 py-1 rounded`}>
          {points}
        </span>
        <span className="font-semibold flex-1 text-black dark:text-white">
          {title}
          {gate && <span className="ml-2 text-black dark:text-white text-xs">[GATE]</span>}
        </span>
      </div>
      <div className="ml-12 space-y-1">
        <div className="flex items-start gap-2">
          <span className="text-black dark:text-white font-semibold">✓ YES:</span>
          <span className="text-black/70 dark:text-white/70">{yes}</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-black/60 dark:text-white/60 font-semibold">✗ NO:</span>
          <span className="text-black/60 dark:text-white/60">{no}</span>
        </div>
      </div>
    </div>
  );
}

function NoveltyTier({
  tier,
  points,
  title,
  example,
}: {
  tier: string;
  points: string;
  title: string;
  example: string;
}) {
  return (
    <div className="p-2 bg-white dark:bg-gray-800 rounded border border-black/10 dark:border-gray-700">
      <div className="flex items-start gap-2">
        <span className="bg-gray-700 dark:bg-gray-300 text-white dark:text-black text-xs font-bold px-2 py-1 rounded min-w-[60px] text-center">
          Tier {tier}<br/>{points}
        </span>
        <div className="flex-1">
          <p className="font-semibold text-xs text-black dark:text-white">{title}</p>
          <p className="text-xs text-black/60 dark:text-white/60 italic mt-1">Example: {example}</p>
        </div>
      </div>
    </div>
  );
}
