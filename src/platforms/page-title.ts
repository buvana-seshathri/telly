// Turn a streaming page's <title>/og:title into a show or movie name for passive logging.

const SUFFIX = /\s*[|\-–—:]\s*(Hulu|Disney\+|Disney Plus|Max|HBO Max|Apple TV\+?|Peacock|Paramount\+|Prime Video|Netflix)\s*$/i;

export function cleanPageTitle(raw: string): string | null {
  let t = raw.replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i++) t = t.replace(SUFFIX, '').trim();
  t = t.replace(/^(Watch|Stream|Now Playing:?)\s+/i, '');
  t = t.replace(/\s*[|\-–—]\s*(Watch|Stream).*$/i, '');
  t = t.replace(/\s*\(\d{4}\)\s*$/, '');
  // "Show - S1 E3 - Episode name" / "Show: Season 1 Episode 3"
  t = t.replace(/\s*[|\-–—:]\s*S(eason)?\s*\d+\s*[,:]?\s*E(p(isode)?)?\s*\d+.*$/i, '');
  t = t.trim();
  if (!t || t.length > 120) return null;
  if (/^(home|browse|search|watchlist|my stuff|settings|account|sign in|hulu|max|disney\+|peacock|paramount\+|apple tv\+?)$/i.test(t)) return null;
  return t;
}
