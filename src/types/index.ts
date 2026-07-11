// All types used by the API and the pipeline. Pure data — no I/O.

export interface AudioSegment {
  label: "intro" | "verse" | "chorus" | "bridge" | "outro" | string;
  label_index: number;
  name: string;
  start: number;
  end: number;
  duration: number;
  energy: number;
  cluster: number;
}

export interface AudioAnalysis {
  duration: number;
  tempo: number;
  beat_times: number[];
  method: string;
  energy_curve: { t: number; rms: number }[];
  segments: AudioSegment[];
}

export interface InterviewAnswers {
  artist_name?: string;
  track_title?: string;
  track_genre?: string;
  target_audience?: string;
  visual_mood?: string;
  reference_artists?: string;
  budget_currency?: string;  // NGN, USD, EUR, GBP
  budget_cap?: number;
  must_haves?: string;        // free text
}

export interface RateCard {
  currency: string;           // ISO 4217
  // per-line-item base rates in the given currency
  per_location_day: number;
  per_cast_day: number;
  per_dancer_day: number;
  per_camera_day: number;
  per_lighting_day: number;
  per_drone_day: number;
  per_fx_flat: number;
  per_wardrobe_flat: number;
  misc_pct: number;           // multiplier on subtotal, e.g. 0.10 = 10%
}

export interface Scene {
  index: number;
  segment_label: string;      // "verse 1", "chorus 2", "intro"
  segment_start: number;      // seconds in the song
  segment_end: number;
  location: string;
  description: string;
  shots: Shot[];
  cast_size: number;
  dancer_count: number;
  needs_drone: boolean;
  needs_fx: boolean;
}

export interface Shot {
  index: number;
  scene_index: number;
  shot_type: string;          // wide, medium, close, insert, drone
  description: string;
  duration_sec: number;
  camera_movement: string;
}

export interface ConceptInput {
  track_genre?: string;
  artist_name?: string;
  track_title?: string;
  visual_mood?: string;
  reference_artists?: string;
  target_audience?: string;
  must_haves?: string;
  segments: { label: string; name: string; start: number; end: number; duration: number; energy: number }[];
  tempo: number;
  total_duration: number;
}

export interface Concept {
  index: number;
  title: string;
  logline: string;
  visual_style: string;
  pacing: string;
  scenes: Scene[];
}

export interface CostLine {
  category: string;
  description: string;
  unit_cost: number;
  quantity: number;
  total: number;
  currency: string;
}

export interface CostBreakdown {
  currency: string;
  lines: CostLine[];
  subtotal: number;
  misc: number;
  total: number;
  over_budget: boolean;
  budget_cap: number | null;
  optimization_attempts: number;
  final_iteration: number;
}

export interface DayCost {
  day: number;
  location: string;
  scene_indices: number[];
  cost: number;
  currency: string;
}

export interface PackageRequest {
  audio_url: string;          // required: URL to fetch audio
  interview: InterviewAnswers;
  selected_concept_index?: number;
  budget_cap?: number;
  optimize?: boolean;
}

export interface PackageResult {
  job_id: string;
  audio_url: string;
  analysis: AudioAnalysis;
  concepts: Concept[];
  selected_concept_index: number;
  cost: CostBreakdown;
  schedule: DayCost[];
  files: {
    treatment_pdf: string;
    treatment_html: string;
    shot_list_csv: string;
    shooting_schedule_csv: string;
  };
  created_at: string;
}

export interface PackageJob {
  job_id: string;
  status: "queued" | "running" | "complete" | "error";
  progress: number;           // 0..100
  result_json: string | null; // JSON-stringified PackageResult
  error: string | null;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_RATE_CARDS: Record<string, RateCard> = {
  NGN: {
    currency: "NGN",
    per_location_day: 250_000,
    per_cast_day: 80_000,
    per_dancer_day: 60_000,
    per_camera_day: 120_000,
    per_lighting_day: 90_000,
    per_drone_day: 200_000,
    per_fx_flat: 350_000,
    per_wardrobe_flat: 250_000,
    misc_pct: 0.10,
  },
  USD: {
    currency: "USD",
    per_location_day: 1_500,
    per_cast_day: 400,
    per_dancer_day: 300,
    per_camera_day: 700,
    per_lighting_day: 500,
    per_drone_day: 1_200,
    per_fx_flat: 2_000,
    per_wardrobe_flat: 1_500,
    misc_pct: 0.10,
  },
  EUR: {
    currency: "EUR",
    per_location_day: 1_400,
    per_cast_day: 380,
    per_dancer_day: 280,
    per_camera_day: 650,
    per_lighting_day: 470,
    per_drone_day: 1_100,
    per_fx_flat: 1_900,
    per_wardrobe_flat: 1_400,
    misc_pct: 0.10,
  },
  GBP: {
    currency: "GBP",
    per_location_day: 1_200,
    per_cast_day: 350,
    per_dancer_day: 260,
    per_camera_day: 600,
    per_lighting_day: 430,
    per_drone_day: 1_000,
    per_fx_flat: 1_700,
    per_wardrobe_flat: 1_300,
    misc_pct: 0.10,
  },
};
