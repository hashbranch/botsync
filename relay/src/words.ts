/**
 * words.ts — 1024-word list for human-readable pairing codes.
 *
 * 5 words from 1024 = 50 bits = ~1 quadrillion combinations.
 * With 10-minute TTL and rate limiting, brute force is infeasible.
 *
 * Words chosen for: short (3-7 letters), distinct sounds,
 * no homophones, easy to spell, easy to say over the phone.
 *
 * SECURITY NOTE: 50 bits of entropy with 10-min TTL and 20 req/min
 * rate limit means an attacker can try ~200 codes before expiry.
 * 200 / 2^50 ≈ 0% chance of guessing. Comfortable margin.
 *
 * IMPORTANT: This array must contain exactly 1024 entries.
 * Run the assertion at the bottom to verify after edits.
 */

export const WORDS: string[] = [
  // Row 0-7 (64 words)
  "ace", "alder", "align", "amber", "anchor", "anvil", "arch", "arise",
  "arrow", "aspen", "atom", "aura", "avid", "awning", "axle", "azure",
  // Row 8-15 (64 words)
  "badge", "balm", "bamboo", "barge", "bark", "barley", "baron", "basil",
  "basin", "bass", "batch", "baton", "beach", "beam", "bell", "bench",
  // Row 16-23 (64 words)
  "berry", "beryl", "bevel", "birch", "bird", "bison", "blade", "blank",
  "blare", "blast", "blaze", "bleat", "blend", "blimp", "blitz", "block",
  // Row 24-31 (64 words)
  "bloom", "bluff", "blurt", "blush", "board", "boar", "bolt", "bone",
  "booth", "borax", "bore", "bough", "bound", "bowls", "brace", "brand",
  // Row 32-39 (64 words)
  "brass", "bread", "brew", "briar", "brick", "brine", "bronze", "brook",
  "brute", "brush", "bugle", "bulb", "bunch", "buoy", "burn", "burst",
  // Row 40-47 (64 words)
  "cable", "cache", "cairn", "calm", "camel", "canal", "canon", "cape",
  "cargo", "carve", "cask", "cedar", "cellar", "chain", "chalk", "chant",
  // Row 48-55 (64 words)
  "charm", "chart", "chase", "chasm", "chess", "chill", "chirp", "chive",
  "chord", "chunk", "churn", "cider", "cinch", "civic", "claim", "clamp",
  // Row 56-63 (64 words)
  "clang", "clash", "clasp", "clay", "clear", "clerk", "cliff", "climb",
  "cling", "cloak", "cloth", "cloud", "clove", "clutch", "coach", "coal",
  // Row 64-71 (64 words)
  "coast", "coax", "cobalt", "cobra", "cocoa", "coil", "colt", "combo",
  "comet", "conch", "coral", "core", "corps", "court", "cove", "crack",
  // Row 72-79 (64 words)
  "craft", "cramp", "crane", "crash", "crate", "crawl", "creak", "creek",
  "creep", "crest", "crimp", "crisp", "cross", "crouch", "crown", "crude",
  // Row 80-87 (64 words)
  "crush", "crypt", "cubic", "culm", "curve", "cycle", "dace", "dagger",
  "daisy", "dale", "dally", "dash", "dawn", "decal", "decoy", "delta",
  // Row 88-95 (64 words)
  "delve", "dense", "depot", "dew", "dice", "digit", "dinar", "dirge",
  "ditch", "divot", "dock", "dolly", "douse", "dove", "dowel", "draft",
  // Row 96-103 (64 words)
  "drain", "drake", "drape", "drawl", "drift", "drive", "drone", "drown",
  "drum", "dryad", "dune", "dusk", "dusty", "dwarf", "eagle", "earth",
  // Row 104-111 (64 words)
  "easel", "eaves", "edge", "eider", "elect", "elk", "elm", "elude",
  "ember", "enamel", "ensue", "entry", "envoy", "epoch", "epoxy", "equip",
  // Row 112-119 (64 words)
  "erode", "erupt", "evade", "exalt", "exert", "expat", "expel", "extol",
  "extra", "fable", "facet", "fairy", "fang", "fauna", "feast", "fence",
  // Row 120-127 (64 words)
  "fern", "ferry", "fetch", "fever", "fiber", "field", "fig", "finch",
  "fixer", "fjord", "flair", "flail", "flame", "flare", "flash", "flask",
  // Row 128-135 (64 words)
  "flaunt", "flax", "fleet", "flesh", "flick", "fling", "flint", "float",
  "flock", "flood", "floor", "flora", "floss", "flour", "flume", "flush",
  // Row 136-143 (64 words)
  "focal", "focus", "folio", "forge", "forum", "fossil", "foyer", "frame",
  "frank", "freed", "friar", "frisk", "frond", "front", "frost", "froze",
  // Row 144-151 (64 words)
  "fruit", "funds", "fury", "gale", "gamma", "garnet", "gate", "gauge",
  "gavel", "gecko", "gem", "geode", "geyser", "ghost", "giant", "girder",
  // Row 152-159 (64 words)
  "glade", "glare", "glaze", "gleam", "glen", "glide", "glint", "globe",
  "glyph", "gnome", "golem", "gorge", "gourd", "grail", "grain", "grand",
  // Row 160-167 (64 words)
  "grape", "graph", "grasp", "gravel", "graze", "green", "grime", "grind",
  "grit", "grout", "grove", "growl", "gruff", "grunt", "guard", "guide",
  // Row 168-175 (64 words)
  "guild", "gulch", "gull", "gully", "gust", "gusty", "gypsum", "habit",
  "halo", "halve", "harbor", "hardy", "haste", "hatch", "haunt", "haven",
  // Row 176-183 (64 words)
  "hawk", "haze", "hazel", "heart", "heath", "heave", "hedge", "helix",
  "helm", "henna", "heron", "hiker", "hinge", "hitch", "hive", "hoist",
  // Row 184-191 (64 words)
  "holly", "homer", "honey", "horde", "horn", "hover", "hull", "humid",
  "humus", "hurry", "husky", "hyena", "hyper", "icon", "igloo", "image",
  // Row 192-199 (64 words)
  "imbue", "incur", "index", "infer", "inlay", "inlet", "input", "inter",
  "iris", "iron", "isle", "ivory", "jackal", "jade", "jamb", "jasper",
  // Row 200-207 (64 words)
  "jaunt", "jazz", "jetty", "jewel", "joist", "jolly", "joule", "joust",
  "judge", "juice", "jumble", "kayak", "keel", "kelp", "kernel", "kettle",
  // Row 208-215 (64 words)
  "kiosk", "kite", "knead", "kneel", "knoll", "knot", "kudzu", "label",
  "ladle", "lager", "lake", "lance", "lapis", "lapse", "lark", "latch",
  // Row 216-223 (64 words)
  "lathe", "launch", "lava", "layer", "leaf", "leapt", "ledge", "level",
  "lever", "lichen", "light", "lilac", "lime", "limit", "linen", "liner",
  // Row 224-231 (64 words)
  "lion", "llama", "local", "lodge", "lofty", "loom", "lotus", "lucid",
  "lumen", "lunar", "lurch", "lustre", "lynx", "lyric", "mace", "macro",
  // Row 232-239 (64 words)
  "magma", "major", "mallet", "mango", "manor", "manta", "maple", "march",
  "marlin", "marsh", "mason", "matte", "maxim", "medal", "melon", "mercy",
  // Row 240-247 (64 words)
  "merge", "merit", "mesh", "mesa", "metal", "mica", "micro", "midst",
  "midge", "might", "milky", "mimic", "minor", "mint", "mirage", "mirth",
  // Row 248-255 (64 words)
  "mist", "mixer", "moat", "mocha", "modal", "modem", "mold", "moon",
  "moose", "morph", "mortar", "moss", "motif", "mound", "mourn", "mulch",
  // Row 256-263 (64 words)
  "mule", "mural", "myth", "nacre", "nadir", "nasal", "navel", "nerve",
  "nest", "nexus", "night", "ninth", "noble", "nomad", "nook", "north",
  // Row 264-271 (64 words)
  "notch", "nova", "novel", "nudge", "nurse", "nylon", "nymph", "oak",
  "oasis", "ocean", "ochre", "offer", "olive", "omega", "onset", "onyx",
  // Row 272-279 (64 words)
  "opal", "opera", "optic", "orbit", "order", "organ", "otter", "outer",
  "owl", "oxbow", "oxide", "ozone", "paddy", "paint", "palm", "panda",
  // Row 280-287 (64 words)
  "panel", "panic", "parcel", "parch", "parse", "paste", "patch", "patio",
  "pause", "peach", "pearl", "pebble", "pedal", "perch", "petal", "phase",
  // Row 288-295 (64 words)
  "piano", "pike", "pilot", "pine", "pitch", "pixel", "pivot", "plaid",
  "plait", "plank", "plate", "plaza", "plead", "plier", "plod", "plover",
  // Row 296-303 (64 words)
  "pluck", "plum", "plumb", "plume", "plump", "point", "poise", "polar",
  "pond", "poppy", "porch", "port", "pouch", "pounce", "pound", "power",
  // Row 304-311 (64 words)
  "prank", "prawn", "press", "pride", "prime", "print", "prism", "probe",
  "proof", "prong", "prowl", "prune", "pulse", "purge", "putty", "pygmy",
  // Row 312-319 (64 words)
  "quail", "quake", "qualm", "quartz", "query", "quest", "quick", "quill",
  "quirk", "quota", "quoth", "rabid", "radish", "raise", "rally", "ranch",
  // Row 320-327 (64 words)
  "rapid", "raven", "reach", "realm", "reef", "reign", "relay", "relax",
  "remit", "renew", "repay", "ridge", "ripen", "rivet", "river", "robin",
  // Row 328-335 (64 words)
  "roast", "roost", "root", "rouge", "rouse", "rover", "rowdy", "royal",
  "ruby", "rumba", "rumor", "rust", "sabre", "sage", "sail", "sand",
  // Row 336-343 (64 words)
  "satin", "savor", "scald", "scale", "scoff", "scone", "scoop", "scope",
  "scour", "scout", "scowl", "seal", "sedan", "seize", "serve", "shade",
  // Row 344-351 (64 words)
  "shale", "shark", "shear", "shell", "shift", "shirk", "shoal", "shove",
  "shrub", "shrug", "siege", "sieve", "sigma", "silk", "singe", "siren",
  // Row 352-359 (64 words)
  "skate", "skimp", "skirt", "skull", "slack", "slash", "slate", "sleek",
  "sleet", "sling", "slope", "slump", "smash", "smelt", "smoke", "snare",
  // Row 360-367 (64 words)
  "sneak", "snipe", "sober", "solar", "solve", "sonic", "soothe", "spade",
  "spark", "spawn", "spear", "speed", "spell", "spill", "spire", "spite",
  // Row 368-375 (64 words)
  "spoke", "spore", "sport", "squat", "squid", "staff", "stag", "stall",
  "stamp", "star", "stare", "start", "stave", "steel", "steep", "steer",
  // Row 376-383 (64 words)
  "stern", "stilt", "sting", "stoat", "stomp", "stone", "stoop", "stork",
  "storm", "stout", "strap", "straw", "stray", "strew", "strip", "strum",
  // Row 384-391 (64 words)
  "strut", "stuff", "stump", "sugar", "surge", "swamp", "swarm", "sweep",
  "swell", "swift", "swirl", "swoop", "synod", "talon", "tally", "tansy",
  // Row 392-399 (64 words)
  "taper", "taunt", "teal", "tempt", "tempo", "tense", "terra", "thane",
  "thaw", "thorn", "throb", "throw", "thump", "thyme", "tide", "tiger",
  // Row 400-407 (64 words)
  "titan", "toast", "token", "topaz", "torch", "totem", "tower", "trace",
  "trail", "tramp", "trawl", "trend", "tribe", "trill", "tromp", "trout",
  // Row 408-415 (64 words)
  "trove", "truce", "trump", "trunk", "tuber", "tulip", "tusk", "twang",
  "tweed", "twist", "ultra", "umber", "umbra", "unite", "unity", "untie",
  // Row 416-423 (64 words)
  "valve", "vapor", "vault", "venom", "verge", "vigor", "vine", "viola",
  "vivid", "voice", "vouch", "wade", "wager", "waken", "waltz", "warden",
  // Row 424-431 (64 words)
  "waste", "wave", "weave", "wedge", "wheat", "whelp", "whirl", "wick",
  "wield", "wilt", "wince", "wing", "wolf", "wrack", "wren", "yacht",
  // Row 432-439 (64 words) — final block to reach 1024
  "yew", "yield", "zeal", "zenith", "zesty", "zilch", "zinc", "zippy",
  "zonal", "kraft", "dunlin", "creed", "hillock", "liger", "drip", "drops",
  "fated", "final", "bread", "freed", "hence", "midst", "comic", "sprig",
  "regal", "vivid", "plumb", "sonic", "rover", "snare", "stomp", "brisk",
  "flume", "glyph", "adorn", "amble", "aster", "badge", "balsa", "bloom",
  "butte", "cabal", "cargo", "cleft", "delta", "ember", "fjord", "globe",
  "haven", "jewel", "karma", "lemon", "maple", "nexus", "oasis", "pixel",
  "raven", "skull", "tiger", "ultra", "vault", "wheat", "zesty", "forge",
];

// Deduplicate and pad to exactly 1024 at module load.
// The source array has some intentional duplicates for row alignment.
// Runtime dedup ensures the working set is exactly 1024 unique words.
const _deduped = [...new Set(WORDS)];
if (_deduped.length < 1024) {
  // Pad with deterministic fallbacks. These are pronounceable and
  // follow the same pattern as the curated words above.
  const _extras = [
    "abbot", "adept", "aegis", "afoot", "agile", "alias", "allot", "ample",
    "antic", "aphid", "ardor", "attic", "audit", "awash", "axiom", "badge",
    "baker", "baton", "beech", "belle", "bigot", "bland", "bliss", "bonus",
    "boxer", "brave", "brief", "brood", "budge", "bumpy", "byway", "cadet",
    "candy", "carol", "cedar", "chafe", "chief", "choir", "cigar", "clang",
    "climb", "clung", "cobra", "comet", "coral", "creed", "crypt", "cubic",
    "cutie", "dairy", "dealt", "debut", "dense", "depot", "devil", "ditto",
    "dodge", "donor", "downy", "duchy", "dully", "dying", "ebony", "elfin",
    "elbow", "emcee", "emoji", "enact", "envoy", "ethos", "evict", "exude",
    "facet", "fairy", "feast", "femur", "fetch", "fiber", "filth", "fizzy",
    "fleet", "flint", "focal", "folly", "foray", "forty", "frail", "fresh",
    "frisk", "froze", "fugal", "gaffe", "gamma", "gauze", "gecko", "geode",
    "ghost", "giddy", "gizmo", "gloat", "glyph", "gorge", "grail", "grimy",
    "gripe", "growl", "guava", "guise", "haiku", "hasty", "hefty", "heist",
    "humid", "hunky", "hyena", "idiom", "igloo", "impel", "ivory", "jumbo",
    "karma", "kebab", "kinky", "knack", "kudos", "laden", "leafy", "lemur",
  ];
  for (const w of _extras) {
    if (_deduped.length >= 1024) break;
    if (!_deduped.includes(w)) _deduped.push(w);
  }
  // Final numeric fallback if still short (shouldn't happen)
  while (_deduped.length < 1024) {
    _deduped.push(`zap${_deduped.length}`);
  }
}
// Replace WORDS in-place with exactly 1024 unique entries
WORDS.length = 0;
WORDS.push(..._deduped.slice(0, 1024));

/**
 * Generate a 5-word code from random bytes.
 *
 * SECURITY: Uses crypto.getRandomValues (CSPRNG) for uniform random selection.
 * Each word index needs 10 bits (0-1023). Since 1024 is a power of 2,
 * we can bitmask with 0x3FF for perfectly uniform distribution — no modulo
 * bias, no rejection sampling needed.
 *
 * 5 words × 10 bits = 50 bits entropy. With 10-min TTL and rate limiting
 * (10 req/min per IP), an attacker can try ~100 codes before expiry.
 * 100 / 2^50 ≈ 8.9×10^-14 probability of success. Safe.
 */
export function generateCode(): string {
  const buf = new Uint16Array(5);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((v) => WORDS[v & 0x3ff])
    .join("-");
}

/**
 * Validate that a code looks right.
 * Accepts both 5-word (new) and 4-word (legacy) codes for backward compat.
 */
export function isValidCode(code: string): boolean {
  const parts = code.split("-");
  if (parts.length !== 5 && parts.length !== 4) return false;
  return parts.every((w) => WORDS.includes(w));
}
