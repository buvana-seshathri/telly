// Core data shapes shared by the extension pages, the engine and the catalog pipeline.

export type PlatformId =
  | 'netflix'
  | 'prime'
  | 'hulu'
  | 'disney'
  | 'max'
  | 'appletv'
  | 'peacock'
  | 'paramount';

export type TitleType = 'movie' | 'tv';

/** One title in the catalog (built weekly by scripts/build-catalog.mjs). */
export interface CatalogItem {
  id: string; // "movie:603" / "tv:70523" (TMDB type + id)
  tmdbId: number;
  type: TitleType;
  title: string;
  year: number | null;
  genres: string[]; // general genres, lowercased ("thriller", "comedy")
  overview: string;
  keywords: string[];
  creators: string[]; // directors (movies) or creators (tv)
  cast: string[]; // top-billed only
  runtime: number | null; // minutes (movie) or typical episode length (tv)
  seasons?: number | null;
  rating: number | null; // 0–10 audience rating
  popularity: number; // 0–1 normalised
  providers: PlatformId[]; // where it streams (flatrate) in the catalog's region
  poster?: string | null; // full image URL
  aliases?: string[]; // alternative titles, used when matching history
  lang?: string; // original language, ISO 639-1 ("en", "ko", "ja")
  countries?: string[]; // origin countries, ISO 3166-1 ("KR", "US")
  studios?: string[]; // TV networks (tvN, JTBC) or production companies
  links?: Partial<Record<PlatformId, string>>; // direct title pages where known (else "Watch" opens that platform's search)
  recs?: number[]; // catalog indexes of "people who liked this also liked" (from TMDB), best first
}

export interface CatalogFile {
  version: number;
  embedder: string; // "hash-384-v1" | "minilm-l6-v2"
  dims: number;
  region: string;
  generatedAt: string;
  sample?: boolean;
  hasRecs?: boolean; // items carry collaborative neighbours (recs)
  items: CatalogItem[];
}

/** A catalog with embeddings attached, ready for the engine. */
export interface Catalog {
  meta: Omit<CatalogFile, 'items'>;
  items: CatalogItem[];
  vectors: Float32Array[]; // same order as items, L2-normalised
  byId: Map<string, number>;
}

/** One raw viewing event read from a platform (an episode or a movie). */
export interface WatchEvent {
  platform: PlatformId;
  profileKey: string; // `${platform}:${profileId}`
  rawTitle: string; // as the platform shows it ("Dark: Season 1: Secrets")
  seriesTitle?: string | null; // when the platform tells us directly
  date: number; // epoch ms
  progress?: number | null; // 0–1 if known (bookmark / duration)
  source: 'history' | 'passive' | 'csv' | 'manual';
}

export interface Profile {
  key: string; // `${platform}:${id}`
  platform: PlatformId;
  id: string;
  name: string;
  isMe: boolean;
  confirmed?: boolean; // user answered "is this you?"
  lastSynced: number | null;
  eventCount: number;
}

export type FeedbackKind = 'like' | 'nope' | 'watch' | 'seen' | 'notme' | 'favorite';

export interface Feedback {
  itemId: string;
  kind: FeedbackKind;
  at: number;
}

export type RefreshCadence = 'every-visit' | 'daily' | 'manual';

export type LlmProvider = 'gemini' | 'groq' | 'openai' | 'anthropic' | 'openrouter';

export interface LlmSettings {
  enabled: boolean;
  provider: LlmProvider;
  apiKey: string;
  model: string;
}

export interface Settings {
  onboarded: boolean;
  platforms: Record<PlatformId, boolean>;
  region: string;
  refresh: RefreshCadence;
  passiveLogging: boolean;
  cornerButton: boolean;
  picksPerShelf: 3 | 5 | 10; // how many picks each shelf holds (the stack shows the top 3 at a time)
  catalogUrl: string; // where the weekly catalog is hosted ('' = bundled sample)
  llm: LlmSettings;
}

/** Why a title was recommended — each piece is real evidence. */
export interface Evidence {
  kind:
    | 'similar-to'
    | 'collab'
    | 'language'
    | 'same-creator'
    | 'same-cast'
    | 'genre-fit'
    | 'vibe-match'
    | 'fits-time'
    | 'well-rated'
    | 'stretch'
    | 'llm';
  text: string;
  anchorId?: string;
}

export interface Rec {
  item: CatalogItem;
  score: number;
  why: string; // the one-line reason shown on the card
  evidence: Evidence[];
  anchorId?: string; // the watched title this pick is closest to (for the "Like X" chip)
}

export interface Filters {
  type: 'any' | TitleType;
  maxMinutes: number | null; // null = no limit
  genre: string | null;
  platforms: PlatformId[]; // which platforms to pull from
  lang?: string | null; // only titles originally in this language
}
