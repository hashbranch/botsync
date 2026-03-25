/**
 * words.ts — 256-word list for human-readable pairing codes.
 *
 * 4 words from 256 = 32 bits = ~4 billion combinations.
 * More than enough for ephemeral 10-minute pairing codes.
 *
 * Words chosen for: short (3-7 letters), distinct sounds,
 * no homophones, easy to spell, easy to say over the phone.
 */

export const WORDS: string[] = [
  "ace", "arch", "atom", "axle", "bark", "bass", "beam", "bell",
  "bird", "blade", "blaze", "bloom", "bolt", "bone", "bore", "brace",
  "brass", "brew", "brick", "brook", "brute", "bulb", "burn", "calm",
  "cape", "cargo", "cedar", "chain", "charm", "chess", "chill", "chord",
  "cider", "civic", "claim", "clamp", "clash", "clay", "cliff", "cloud",
  "clove", "coal", "coast", "cobra", "coil", "coral", "core", "craft",
  "crane", "creek", "crest", "crown", "crush", "curve", "dagger", "dale",
  "dash", "dawn", "delta", "dew", "dice", "dock", "dove", "draft",
  "drake", "drift", "drone", "drum", "dusk", "eagle", "earth", "edge",
  "elm", "ember", "fable", "fang", "fern", "fiber", "finch", "fjord",
  "flame", "flare", "flask", "flint", "flora", "forge", "frost", "fury",
  "gale", "gate", "gem", "ghost", "glade", "gleam", "globe", "gnome",
  "grain", "grape", "gravel", "grove", "guild", "gull", "gust", "halo",
  "haven", "hawk", "hazel", "heart", "hedge", "helm", "heron", "hive",
  "holly", "horn", "hull", "icon", "iris", "iron", "ivory", "jade",
  "jazz", "jewel", "kelp", "kite", "knot", "lake", "lance", "lark",
  "latch", "lava", "leaf", "lever", "light", "lilac", "lime", "linen",
  "lion", "lotus", "lunar", "lynx", "mango", "maple", "marsh", "mesa",
  "mint", "mist", "moat", "mold", "moon", "moss", "mule", "myth",
  "nest", "noble", "north", "nova", "oak", "oasis", "olive", "onyx",
  "orbit", "otter", "owl", "oxide", "palm", "pearl", "pebble", "petal",
  "pike", "pilot", "pine", "pixel", "plank", "plume", "polar", "pond",
  "prism", "pulse", "quail", "quake", "raven", "reef", "ridge", "river",
  "robin", "root", "ruby", "rust", "sage", "sail", "sand", "satin",
  "scale", "scout", "seal", "shade", "shell", "slate", "smoke", "solar",
  "spark", "spire", "spoke", "star", "steel", "stone", "storm", "surge",
  "swift", "thorn", "tide", "tiger", "torch", "trail", "trout", "tulip",
  "tusk", "umbra", "valve", "vapor", "vault", "venom", "vine", "viola",
  "vivid", "voice", "waltz", "warden", "wave", "wheat", "wick", "wilt",
  "wing", "wolf", "wren", "yacht", "yew", "zeal", "zenith", "zinc",
  "birch", "bluff", "cask", "dune", "elk", "flax", "grit", "haze",
  "isle", "jade", "keel", "loom", "mace", "nook", "opal", "plum",
];

/**
 * Generate a 4-word code from random bytes.
 * Each word index is one byte (0-255) → picks from the 256-word list.
 */
export function generateCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => WORDS[b])
    .join("-");
}

/**
 * Validate that a code looks right (4 words, all in our list).
 */
export function isValidCode(code: string): boolean {
  const parts = code.split("-");
  if (parts.length !== 4) return false;
  return parts.every((w) => WORDS.includes(w));
}
