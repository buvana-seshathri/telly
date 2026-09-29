// Text utilities shared by the hash embedder, title matching and vibe search.

const STOP = new Set(
  'a an and are as at be but by for from has have i in into is it its me my of on or our so some something that the their them then there these they this to up was we what when where which who with you your want like watch watching show shows movie movies film films series about feel feeling mood tonight kind sort really very just good great life short quick minutes minute hour hours min mins under less than night new'.split(
    ' ',
  ),
);

export function normalizeTitle(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^the /, '')
    .trim();
}

export function words(s: string): string[] {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function stem(w: string): string {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

export function contentWords(s: string): string[] {
  return words(s).filter((w) => w.length > 2 && !STOP.has(w));
}

/**
 * Small concept lexicon so the no-model (hash) embedder still links related words:
 * "motivational" ~ "perseverance" ~ "underdog". The MiniLM embedder does not need it.
 */
export const CONCEPTS: Record<string, string[]> = {
  work: ['job', 'jobs', 'career', 'careers', 'work', 'working', 'workplace', 'office', 'corporate', 'employment', 'unemployed', 'unemployment', 'fired', 'layoff', 'layoffs', 'hired', 'hiring', 'internship', 'intern', 'boss', 'startup', 'business', 'interview', 'interviews', 'resume', 'entrepreneur'],
  struggle: ['struggle', 'struggles', 'struggling', 'difficult', 'difficulties', 'difficulty', 'hardship', 'hardships', 'setback', 'setbacks', 'homelessness', 'homeless', 'broke', 'poverty', 'adversity', 'tough', 'rejection', 'failure', 'debt'],
  uplift: ['motivational', 'motivating', 'motivation', 'inspiring', 'inspirational', 'inspire', 'uplifting', 'hopeful', 'hope', 'perseverance', 'persevere', 'underdog', 'triumph', 'determination', 'resilience', 'optimism', 'optimistic', 'kindness', 'heartfelt', 'wholesome', 'encouraging', 'dedication', 'passion'],
  funny: ['funny', 'comedy', 'comedic', 'hilarious', 'laugh', 'laughs', 'humor', 'humour', 'sitcom', 'lighthearted', 'silly'],
  scary: ['scary', 'horror', 'creepy', 'terrifying', 'spooky', 'frightening', 'disturbing', 'haunted', 'monsters', 'occult'],
  tense: ['tense', 'suspense', 'suspenseful', 'thriller', 'gripping', 'intense', 'edge', 'nail'],
  mindbend: ['mind', 'bending', 'twist', 'twists', 'twisty', 'puzzle', 'confusing', 'complex', 'nonlinear', 'paradox', 'reality', 'dreams'],
  time: ['time', 'loop', 'timeline', 'timelines', 'travel', 'multiverse'],
  crime: ['crime', 'detective', 'murder', 'killer', 'heist', 'police', 'investigation', 'whodunit', 'mystery', 'cartel', 'fbi', 'gangster', 'hitman'],
  space: ['space', 'alien', 'aliens', 'planet', 'mars', 'galaxy', 'astronaut', 'astronauts', 'starship', 'nasa', 'wormhole'],
  love: ['love', 'romance', 'romantic', 'relationship', 'dating', 'wedding', 'couple', 'couples'],
  family: ['family', 'kids', 'children', 'parenting', 'father', 'mother', 'dad', 'mom', 'son', 'daughter', 'sisters', 'brothers'],
  cozy: ['cozy', 'comfort', 'relaxing', 'relax', 'chill', 'light', 'easy', 'calm', 'soothing', 'comforting'],
  sad: ['sad', 'cry', 'tearjerker', 'grief', 'bittersweet', 'emotional', 'melancholy', 'loneliness', 'lonely', 'loss'],
  food: ['food', 'chef', 'chefs', 'cooking', 'restaurant', 'kitchen', 'sushi', 'cook', 'truck'],
  sports: ['sports', 'sport', 'boxing', 'baseball', 'football', 'soccer', 'basketball', 'coach', 'athlete', 'climbing', 'karate', 'climber'],
  truestory: ['true', 'real', 'based', 'documentary', 'biography', 'biopic', 'historical'],
  dystopia: ['dystopia', 'dystopian', 'apocalypse', 'apocalyptic', 'wasteland', 'survival', 'zombie', 'zombies', 'pandemic', 'totalitarian'],
  action: ['action', 'fight', 'fights', 'explosions', 'chase', 'revenge', 'adrenaline', 'violent', 'stylish'],
  music: ['music', 'musical', 'jazz', 'band', 'singer', 'drummer', 'pianist'],
  youth: ['teen', 'teenage', 'teenager', 'school', 'college', 'coming', 'graduate', 'prodigy'],
  animation: ['animated', 'animation', 'cartoon', 'anime'],
  restart: ['reinvention', 'reinvent', 'rebuild', 'rebuilds', 'rebuilding', 'comeback', 'redemption', 'second', 'fresh', 'restart', 'starting', 'over', 'anew'],
  tech: ['technology', 'tech', 'social', 'media', 'internet', 'hacker', 'ai', 'robot'],
};

const CONCEPT_OF = new Map<string, string>();
for (const [c, ws] of Object.entries(CONCEPTS)) for (const w of ws) CONCEPT_OF.set(w, c);

export function conceptOf(word: string): string | undefined {
  return CONCEPT_OF.get(word) ?? CONCEPT_OF.get(stem(word));
}

/** General genres used across platforms (TMDB genres normalised in the catalog pipeline). */
export const GENRES = [
  'action', 'adventure', 'animation', 'comedy', 'crime', 'documentary', 'drama', 'family', 'fantasy',
  'history', 'horror', 'music', 'mystery', 'romance', 'sci-fi', 'thriller', 'war', 'western', 'reality', 'kids',
];

const GENRE_WORDS: Record<string, string> = {
  action: 'action', adventure: 'adventure', animated: 'animation', animation: 'animation', cartoon: 'animation',
  comedy: 'comedy', comedies: 'comedy', funny: 'comedy', crime: 'crime', documentary: 'documentary', documentaries: 'documentary',
  docs: 'documentary', doc: 'documentary', drama: 'drama', dramas: 'drama', family: 'family', fantasy: 'fantasy',
  history: 'history', historical: 'history', horror: 'horror', scary: 'horror', music: 'music', musical: 'music',
  mystery: 'mystery', romance: 'romance', romantic: 'romance', romcom: 'romance', scifi: 'sci-fi', sci: 'sci-fi',
  thriller: 'thriller', thrillers: 'thriller', war: 'war', western: 'western', reality: 'reality', kids: 'kids',
};

export function genresInText(s: string): string[] {
  const out = new Set<string>();
  for (const w of words(s)) {
    const g = GENRE_WORDS[w];
    if (g) out.add(g);
  }
  if (/science fiction|sci[\s-]?fi/i.test(s)) out.add('sci-fi');
  return [...out];
}

export function genreLabel(g: string): string {
  if (g === 'sci-fi') return 'Sci-fi';
  return g.charAt(0).toUpperCase() + g.slice(1);
}

/** "ko" -> "Korean" (falls back to the code if the browser cannot name it). */
export function langLabel(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}
