// Budget optimizer. Walks a list of strategies, each one is a deterministic transform
// of the concept + recomputed cost. If the new cost is within budget, we accept it.
// If after all strategies we're still over, we accept the cheapest one we found and
// surface it.

import type { Concept, CostBreakdown, RateCard } from "../types/index.js";
import { computeCost } from "./budget.js";
import { refineScenes } from "./generator.js";
import { hasLLM } from "../config/env.js";

export type Strategy =
  | "merge_locations"
  | "cut_dancers"
  | "drop_drone"
  | "drop_fx"
  | "reduce_cast"
  | "simplify_scenes";

export const STRATEGY_ORDER: Strategy[] = [
  "merge_locations",
  "cut_dancers",
  "drop_drone",
  "drop_fx",
  "reduce_cast",
  "simplify_scenes",
];

export interface OptimizeResult {
  concept: Concept;
  cost: CostBreakdown;
  applied: Strategy[];
  final_iteration: number;
  optimization_attempts: number;
}

function applyStrategyDeterministic(concept: Concept, strategy: Strategy): Concept {
  switch (strategy) {
    case "merge_locations": {
      // Merge all scenes into the first location. Cheap and dramatic.
      const first = concept.scenes[0]?.location ?? "single location";
      return {
        ...concept,
        scenes: concept.scenes.map((s) => ({ ...s, location: first })),
      };
    }
    case "cut_dancers":
      return {
        ...concept,
        scenes: concept.scenes.map((s) => ({ ...s, dancer_count: 0 })),
      };
    case "drop_drone":
      return {
        ...concept,
        scenes: concept.scenes.map((s) => ({ ...s, needs_drone: false })),
      };
    case "drop_fx":
      return {
        ...concept,
        scenes: concept.scenes.map((s) => ({ ...s, needs_fx: false })),
      };
    case "reduce_cast":
      return {
        ...concept,
        scenes: concept.scenes.map((s) => ({ ...s, cast_size: Math.max(1, Math.ceil(s.cast_size / 2)) })),
      };
    case "simplify_scenes":
      // Drop every other scene's second half of shots
      return {
        ...concept,
        scenes: concept.scenes.map((s) => ({
          ...s,
          shots: s.shots.slice(0, Math.max(1, Math.ceil(s.shots.length / 2))),
        })),
      };
  }
}

export async function optimizeBudget(
  concept: Concept,
  rate: RateCard,
  budgetCap: number | null,
  maxIterations = 5
): Promise<OptimizeResult> {
  if (budgetCap == null) {
    return {
      concept,
      cost: computeCost(concept, rate, null),
      applied: [],
      final_iteration: 0,
      optimization_attempts: 0,
    };
  }

  let current = concept;
  let currentCost = computeCost(current, rate, budgetCap);
  const applied: Strategy[] = [];
  let iteration = 0;

  // Iter 1: try deterministic strategies in order. Cheap, no LLM.
  for (const strategy of STRATEGY_ORDER) {
    iteration += 1;
    if (!currentCost.over_budget) break;
    if (iteration > maxIterations) break;

    const trial = applyStrategyDeterministic(current, strategy);
    const trialCost = computeCost(trial, rate, budgetCap);
    if (!trialCost.over_budget || trialCost.total < currentCost.total) {
      current = trial;
      currentCost = trialCost;
      applied.push(strategy);
    }
  }

  // Iter 2: if still over budget AND we have an LLM, ask it for a creative revision.
  let attempts = applied.length;
  if (currentCost.over_budget && hasLLM && iteration < maxIterations) {
    iteration += 1;
    attempts += 1;
    try {
      const revised = await refineScenes(current, undefined as never, applied);
      const revisedCost = computeCost(revised, rate, budgetCap);
      if (!revisedCost.over_budget || revisedCost.total < currentCost.total) {
        current = revised;
        currentCost = revisedCost;
      }
    } catch {
      // LLM revision failed — keep the deterministic result
    }
  }

  return {
    concept: current,
    cost: { ...currentCost, optimization_attempts: attempts, final_iteration: iteration },
    applied,
    final_iteration: iteration,
    optimization_attempts: attempts,
  };
}
