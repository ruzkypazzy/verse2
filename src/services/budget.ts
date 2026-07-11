// Deterministic budget engine. No LLM. Reads the rate card, walks the concept's
// scenes, groups into shooting days by location, sums the line items.

import type {
  Concept,
  CostBreakdown,
  CostLine,
  DayCost,
  RateCard,
  Scene,
} from "../types/index.js";

export function computeCost(concept: Concept, rate: RateCard, budgetCap: number | null): CostBreakdown {
  const lines: CostLine[] = [];

  // 1. Group scenes into shooting days by location.
  //    One location = one day. If the same location appears multiple times, merge.
  const dayMap = new Map<string, Scene[]>();
  for (const s of concept.scenes) {
    const key = s.location;
    if (!dayMap.has(key)) dayMap.set(key, []);
    dayMap.get(key)!.push(s);
  }

  for (const [location, scenes] of dayMap) {
    // Location day
    lines.push({
      category: "locations",
      description: `${location} — 1 day`,
      unit_cost: rate.per_location_day,
      quantity: 1,
      total: rate.per_location_day,
      currency: rate.currency,
    });

    // Cast, dancers, camera, lighting (per day)
    const maxCast = Math.max(...scenes.map((s) => s.cast_size), 0);
    const maxDancers = Math.max(...scenes.map((s) => s.dancer_count), 0);
    if (maxCast > 0) {
      lines.push({
        category: "cast",
        description: `${location} — ${maxCast} principal cast × 1 day`,
        unit_cost: rate.per_cast_day,
        quantity: maxCast,
        total: rate.per_cast_day * maxCast,
        currency: rate.currency,
      });
    }
    if (maxDancers > 0) {
      lines.push({
        category: "dancers",
        description: `${location} — ${maxDancers} dancers × 1 day`,
        unit_cost: rate.per_dancer_day,
        quantity: maxDancers,
        total: rate.per_dancer_day * maxDancers,
        currency: rate.currency,
      });
    }
    lines.push({
      category: "camera",
      description: `${location} — camera package × 1 day`,
      unit_cost: rate.per_camera_day,
      quantity: 1,
      total: rate.per_camera_day,
      currency: rate.currency,
    });
    lines.push({
      category: "lighting",
      description: `${location} — lighting package × 1 day`,
      unit_cost: rate.per_lighting_day,
      quantity: 1,
      total: rate.per_lighting_day,
      currency: rate.currency,
    });
  }

  // 2. Drone (any scene that needs it)
  const needsDroneScenes = concept.scenes.filter((s) => s.needs_drone);
  if (needsDroneScenes.length > 0) {
    lines.push({
      category: "drone",
      description: `Drone operator × ${needsDroneScenes.length} location(s)`,
      unit_cost: rate.per_drone_day,
      quantity: Math.min(needsDroneScenes.length, dayMap.size),
      total: rate.per_drone_day * Math.min(needsDroneScenes.length, dayMap.size),
      currency: rate.currency,
    });
  }

  // 3. VFX flat
  const needsFx = concept.scenes.some((s) => s.needs_fx);
  if (needsFx) {
    lines.push({
      category: "fx",
      description: "VFX compositing pass (flat)",
      unit_cost: rate.per_fx_flat,
      quantity: 1,
      total: rate.per_fx_flat,
      currency: rate.currency,
    });
  }

  // 4. Wardrobe flat
  lines.push({
    category: "wardrobe",
    description: "Wardrobe / styling flat (per concept)",
    unit_cost: rate.per_wardrobe_flat,
    quantity: 1,
    total: rate.per_wardrobe_flat,
    currency: rate.currency,
  });

  // 5. Sum
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const misc = Math.round(subtotal * rate.misc_pct);
  const total = subtotal + misc;

  return {
    currency: rate.currency,
    lines,
    subtotal,
    misc,
    total,
    over_budget: budgetCap != null && total > budgetCap,
    budget_cap: budgetCap,
    optimization_attempts: 0,
    final_iteration: 0,
  };
}

export function computeSchedule(concept: Concept, _rate: RateCard): DayCost[] {
  const dayMap = new Map<string, number[]>();
  concept.scenes.forEach((s, i) => {
    if (!dayMap.has(s.location)) dayMap.set(s.location, []);
    dayMap.get(s.location)!.push(s.index);
  });
  let day = 1;
  const out: DayCost[] = [];
  for (const [location, sceneIdx] of dayMap) {
    out.push({
      day: day++,
      location,
      scene_indices: sceneIdx,
      cost: 0, // cost is on CostBreakdown, not duplicated here
      currency: _rate.currency,
    });
  }
  return out;
}
