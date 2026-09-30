// Story themes people ask for in their own words ("next life romance", "enemies to lovers"),
// mapped to the words TMDB keywords and overviews actually use ("reincarnation", "past life").
// Mood search matches these as whole ideas, so a specific request is not drowned out by its
// generic genre word.
import type { CatalogItem } from '../shared/types';

export interface Theme {
  id: string;
  label: string; // short description for explanations
  ask: RegExp; // how a person might say it
  terms: string[]; // what the title's keywords / overview would say
}

const T = (id: string, label: string, ask: RegExp, terms: string[]): Theme => ({ id, label, ask, terms });

export const THEMES: Theme[] = [
  T('reincarnation', 'past lives and reincarnation', /\b(next|past|previous|former|another|other|second) (life|lives|lifetimes?)\b|reincarnat\w*|\breborn\b|\brebirth\b|\bpast[- ]life\b|\blifetimes?\b/, ['reincarnation', 'reincarnated', 'past life', 'past lives', 'previous life', 'former life', 'rebirth', 'reborn', 'lifetimes', 'next life', 'another life', 'thousand years', 'centuries']),
  T('afterlife', 'death and the afterlife', /\bafter ?life\b|\bafter death\b|\bgrim reaper\b|\breapers?\b|\bheaven\b|\bghosts?\b|\bspirits?\b/, ['afterlife', 'grim reaper', 'reaper', 'ghost', 'ghosts', 'spirit', 'spirits', 'heaven', 'underworld']),
  T('timetravel', 'time travel', /\btime[- ]?(travel\w*|slip|loop|machine)\b|\bgo(ing)? back in time\b|\bback to the past\b/, ['time travel', 'time traveler', 'time loop', 'time slip', 'time machine', 'back in time', 'timeline']),
  T('regression', 'a second chance at life', /\bsecond chances?\b|\bdo[- ]over\b|\bgo back and\b|\bredo\b|\bregress\w*\b|\bstart(ing)? over\b/, ['second chance', 'regression', 'going back in time', 'redo', 'starting over', 'fresh start', 'do-over']),
  T('bodyswap', 'body swap', /\bbody[- ]?swap\w*\b|\bswitch(ed)? bodies\b|\bswap(ped)? bodies\b/, ['body swap', 'switching bodies', 'body switch', 'soul swap']),
  T('fantasyromance', 'supernatural romance', /\b(goblin|gumiho|nine[- ]tailed|fox spirit|dokkaebi|vampire|immortal|deity|god|angel|mermaid|fairy|supernatural)\b/, ['goblin', 'gumiho', 'nine-tailed fox', 'fox spirit', 'vampire', 'immortal', 'immortality', 'deity', 'angel', 'mermaid', 'supernatural', 'curse', 'fantasy romance']),
  T('fate', 'fate and destined love', /\bfate\b|\bdestin(y|ed)\b|\bsoul ?mates?\b|\bred string\b|\bmeant to be\b/, ['fate', 'destiny', 'destined', 'soulmate', 'soulmates', 'red string']),
  T('enemies', 'enemies to lovers', /\benem(y|ies) to lovers?\b|\bhate to love\b|\brivals? to lovers?\b/, ['enemies to lovers', 'rivals', 'rivalry', 'love hate relationship', 'bickering']),
  T('fakedating', 'a fake or contract relationship', /\bfake (dating|relationship|marriage|girlfriend|boyfriend)\b|\bcontract (marriage|relationship|dating)\b|\bmarriage of convenience\b|\bpretend(ing)? to (date|be)\b/, ['fake relationship', 'fake dating', 'contract marriage', 'contract relationship', 'marriage of convenience', 'pretend relationship', 'arranged marriage']),
  T('arranged', 'arranged marriage', /\barranged marriage\b|\bmarried (to )?a stranger\b|\bmarriage first\b/, ['arranged marriage', 'marriage of convenience', 'contract marriage']),
  T('firstlove', 'first love', /\bfirst loves?\b|\bchildhood (love|sweetheart|friends?)\b|\bpuppy love\b/, ['first love', 'childhood sweetheart', 'childhood friend', 'childhood friends', 'reunion']),
  T('secondchancelove', 'exes and rekindled love', /\bex(es)?\b|\bback together\b|\brekindl\w+\b|\breunit\w+\b|\bold flame\b/, ['ex-girlfriend', 'ex-boyfriend', 'ex-wife', 'ex-husband', 'reunion', 'rekindled romance', 'former lovers']),
  T('lovetriangle', 'a love triangle', /\blove triangle\b|\btwo (guys|girls|men|women|leads)\b/, ['love triangle']),
  T('slowburn', 'slow-burn love', /\bslow[- ]?burn\b/, ['slow burn', 'slow-burn']),
  T('officeromance', 'office romance', /\boffice romance\b|\bworkplace romance\b|\bboss\b|\bco-?workers?\b|\bcolleagues?\b/, ['office romance', 'workplace romance', 'boss', 'coworker', 'office', 'workplace', 'secretary']),
  T('rich', 'rich heirs and class gaps', /\bchaebol\b|\brich (guy|girl|family|heir)\b|\bheir(ess)?\b|\bcinderella\b|\bpoor girl\b|\bclass (gap|difference)\b/, ['chaebol', 'heir', 'heiress', 'rich family', 'wealth', 'cinderella story', 'class differences', 'ceo']),
  T('royal', 'royals and palace life', /\b(prince|princess|king|queen|royal|royalty|palace|crown prince|joseon|goryeo|dynasty|emperor|empress)\b/, ['prince', 'princess', 'king', 'queen', 'royalty', 'royal family', 'palace', 'crown prince', 'joseon dynasty', 'goryeo dynasty', 'emperor', 'empress', 'court intrigue']),
  T('historical', 'a historical setting', /\bhistorical\b|\bperiod (drama|piece)\b|\bsageuk\b|\bcostume drama\b|\bmedieval\b|\bvictorian\b|\b1\d\d0s\b/, ['historical', 'period drama', 'joseon dynasty', 'costume drama', '19th century', 'medieval', 'victorian era']),
  T('school', 'school life', /\bhigh ?school\b|\bschool\b|\bcollege\b|\buniversity\b|\bcampus\b|\bstudents?\b|\bteen\w*\b/, ['high school', 'school', 'student', 'students', 'college', 'university', 'campus', 'teenager', 'coming of age']),
  T('comingofage', 'growing up', /\bcoming[- ]of[- ]age\b|\bgrowing up\b|\byouth\b/, ['coming of age', 'growing up', 'youth', 'adolescence']),
  T('medical', 'doctors and hospitals', /\b(doctors?|hospital|medical|surgeons?|nurses?)\b/, ['doctor', 'hospital', 'medical', 'surgeon', 'nurse', 'medical drama']),
  T('legal', 'lawyers and courtrooms', /\b(lawyers?|attorneys?|legal|court ?room|court|trial|judge|prosecutors?)\b/, ['lawyer', 'attorney', 'courtroom', 'trial', 'judge', 'prosecutor', 'legal drama', 'law firm']),
  T('cooking', 'food and cooking', /\b(cooking|chefs?|food|restaurants?|kitchen|baking|bakery|cafe)\b/, ['cooking', 'chef', 'food', 'restaurant', 'kitchen', 'baking', 'bakery', 'cafe', 'culinary']),
  T('healing', 'slow, healing, small-town life', /\bhealing\b|\bsmall[- ]town\b|\bcountryside\b|\bvillage\b|\bseaside\b|\bslice of life\b|\bslow life\b|\bcomfort\b/, ['healing', 'small town', 'countryside', 'village', 'seaside', 'slice of life', 'rural', 'hometown']),
  T('idol', 'idols and the music industry', /\bidols?\b|\bk-?pop\b|\bgirl group\b|\bboy band\b|\bentertainment industry\b|\bcelebrit\w+\b/, ['idol', 'k-pop', 'kpop', 'boy band', 'girl group', 'entertainment industry', 'celebrity', 'actor', 'actress', 'singer']),
  T('webtoon', 'based on a webtoon or manga', /\bwebtoons?\b|\bmanhwa\b|\bmanga\b|\bbased on (a )?comic\b/, ['based on webtoon', 'webtoon', 'based on manga', 'manga', 'based on comic']),
  T('revenge', 'revenge', /\brevenge\b|\bvengeance\b|\bpayback\b|\bget(ting)? even\b/, ['revenge', 'vengeance', 'avenge', 'payback']),
  T('heist', 'a heist or con', /\bheists?\b|\bcon (artist|men|man)\b|\bscams?\b|\bswindl\w*\b|\brobbery\b/, ['heist', 'con artist', 'scam', 'robbery', 'swindle', 'thief']),
  T('serialkiller', 'a serial killer hunt', /\bserial killers?\b|\bpsychopath\w*\b|\bmurder(er|s)?\b/, ['serial killer', 'psychopath', 'murder', 'murderer', 'killer']),
  T('detective', 'detectives and investigations', /\bdetectives?\b|\binvestigat\w+\b|\bwhodunn?it\b|\bcops?\b|\bpolice\b/, ['detective', 'investigation', 'police', 'police detective', 'whodunit', 'murder investigation', 'cold case']),
  T('zombie', 'zombies', /\bzombies?\b|\bundead\b|\boutbreak\b/, ['zombie', 'zombies', 'undead', 'outbreak', 'infection', 'zombie apocalypse']),
  T('survival', 'survival games and deadly contests', /\bsurvival\b|\bdeath game\b|\bdeadly game\b|\bbattle royale\b|\bsquid game\b/, ['survival', 'death game', 'deadly game', 'game show', 'battle royale', 'survival game']),
  T('superpowers', 'superpowers', /\bsuper ?powers?\b|\bsuperheroe?s?\b|\bpowers\b|\btelepath\w*\b|\bmind[- ]reading\b|\bpsychic\b/, ['superpower', 'superhero', 'super power', 'telepathy', 'mind reading', 'psychic', 'supernatural power']),
  T('amnesia', 'memory loss', /\bamnesia\b|\bmemory loss\b|\blost (his|her|their)? ?memor\w+\b/, ['amnesia', 'memory loss', 'lost memory', 'memories']),
  T('illness', 'love against illness', /\bterminal\b|\billness\b|\bcancer\b|\bdying\b/, ['terminal illness', 'illness', 'cancer', 'disease', 'dying']),
  T('singleparent', 'single parents', /\bsingle (mom|dad|mother|father|parent)\b|\bwidow\w*\b/, ['single mother', 'single father', 'single parent', 'widow', 'widower']),
  T('foundfamily', 'found family and friendship', /\bfound family\b|\bfriendships?\b|\bbest friends?\b|\bfriends\b|\bsiblings?\b/, ['friendship', 'best friend', 'best friends', 'found family', 'siblings', 'brotherhood', 'sisterhood']),
  T('sports', 'sports and underdogs', /\bsports?\b|\bunderdogs?\b|\b(baseball|football|soccer|basketball|boxing|swimming|badminton|volleyball|fencing)\b/, ['sports', 'underdog', 'baseball', 'football', 'soccer', 'basketball', 'boxing', 'swimming', 'badminton', 'volleyball', 'fencing', 'team']),
  T('military', 'soldiers and war', /\bsoldiers?\b|\barmy\b|\bmilitary\b|\bwar\b|\bnorth korea\w*\b/, ['soldier', 'army', 'military', 'war', 'north korea', 'military service']),
  T('politics', 'power and politics', /\bpolitic\w*\b|\bcorrupt\w*\b|\bconspirac\w+\b|\bpresident\b|\belection\b/, ['politics', 'political', 'corruption', 'conspiracy', 'president', 'election', 'power struggle']),
  T('space', 'space', /\bspace\b|\baliens?\b|\bplanets?\b|\bastronauts?\b|\bgalax\w+\b/, ['space', 'alien', 'planet', 'astronaut', 'outer space', 'spaceship']),
  T('dystopia', 'dystopian futures', /\bdystopi\w+\b|\bpost[- ]apocalyptic\b|\bapocalypse\b|\bend of the world\b/, ['dystopia', 'dystopian', 'post-apocalyptic', 'apocalypse', 'end of the world']),
  T('parallel', 'parallel worlds', /\bparallel (world|universe)s?\b|\bmultiverse\b|\balternate (world|universe|reality)\b|\bisekai\b|\btransported to\b|\binside a (book|novel|game|drama)\b/, ['parallel world', 'parallel universe', 'multiverse', 'alternate reality', 'isekai', 'another world', 'trapped in a novel']),
  T('dating', 'dating shows', /\bdating (show|reality)\b|\breality dating\b|\bsingles?\b|\bmatchmak\w+\b/, ['dating show', 'dating', 'reality dating', 'matchmaking', 'singles']),
];

const cache = new WeakMap<CatalogItem, string>();
export function itemText(it: CatalogItem): string {
  let t = cache.get(it);
  if (t == null) {
    t = ' ' + [it.title, it.keywords.join(' | '), it.overview].join(' | ').toLowerCase() + ' ';
    cache.set(it, t);
  }
  return t;
}

const termRe = new Map<string, RegExp>();
function re(term: string): RegExp {
  let r = termRe.get(term);
  if (!r) {
    r = new RegExp('(^|[^a-z])' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z]|$)');
    termRe.set(term, r);
  }
  return r;
}

/** The terms of a theme that this title's keywords or overview actually use. */
export function themeTermsIn(theme: Theme, it: CatalogItem): string[] {
  const text = itemText(it);
  return theme.terms.filter((t) => re(t).test(text));
}

export interface AskedTheme {
  theme: Theme;
  said: string; // the words the person used, e.g. "next life"
}

/** Themes named in a request, most specific first, with the words the person used. */
export function themesIn(query: string): AskedTheme[] {
  const q = query.toLowerCase();
  const out: AskedTheme[] = [];
  for (const theme of THEMES) {
    const m = q.match(theme.ask);
    if (m) out.push({ theme, said: m[0].trim() });
  }
  return out;
}

/** The request plus the words titles would use for it, for the embedding model. */
export function expandQuery(query: string): string {
  const extra = themesIn(query).map(({ theme }) => theme.terms.slice(0, 4).join(', '));
  return extra.length ? `${query}. ${extra.join('. ')}` : query;
}

/** Languages named in a request ("kdrama", "japanese", "bollywood"). */
const LANG_WORDS: [RegExp, string][] = [
  [/\bk-?dramas?\b|\bkorean\b|\bk-?movies?\b/, 'ko'],
  [/\bj-?dramas?\b|\bjapanese\b|\banime\b/, 'ja'],
  [/\bc-?dramas?\b|\bchinese\b|\bmandarin\b/, 'zh'],
  [/\bthai\b|\bthai drama\b/, 'th'],
  [/\bturkish\b|\bdizi\b/, 'tr'],
  [/\bspanish\b|\bmexican\b|\bargentin\w+\b/, 'es'],
  [/\bhindi\b|\bbollywood\b/, 'hi'],
  [/\btamil\b|\bkollywood\b/, 'ta'],
  [/\btelugu\b|\btollywood\b/, 'te'],
  [/\bmalayalam\b/, 'ml'],
  [/\bfrench\b/, 'fr'],
  [/\bgerman\b/, 'de'],
  [/\bitalian\b/, 'it'],
  [/\bportuguese\b|\bbrazilian\b/, 'pt'],
];
export function langsIn(query: string): string[] {
  const q = query.toLowerCase();
  return LANG_WORDS.filter(([r]) => r.test(q)).map(([, l]) => l);
}
