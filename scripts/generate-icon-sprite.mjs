/**
 * Generates public/icons/fluent-emoji.svg sprite and src/lib/notes/icon-metadata.json
 * from the @iconify-json/fluent-emoji-flat package.
 *
 * Run: node scripts/generate-icon-sprite.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const pkg = JSON.parse(
  readFileSync(resolve(root, "node_modules/@iconify-json/fluent-emoji-flat/icons.json"), "utf8")
);

const width = pkg.width || 32;
const height = pkg.height || 32;
const icons = pkg.icons;
const names = Object.keys(icons);

// ── Build SVG sprite ──
const symbols = names.map((name) => {
  const body = icons[name].body;
  return `<symbol id="${name}" viewBox="0 0 ${width} ${height}">${body}</symbol>`;
});

const sprite = [
  `<?xml version="1.0" encoding="utf-8"?>`,
  `<svg xmlns="http://www.w3.org/2000/svg">`,
  ...symbols,
  `</svg>`,
].join("\n");

mkdirSync(resolve(root, "public/icons"), { recursive: true });
writeFileSync(resolve(root, "public/icons/fluent-emoji.svg"), sprite, "utf8");

// ── Build metadata ──
const CATEGORY_RULES = [
  { category: "faces", match: ["face", "smile", "grin", "laugh", "wink", "tear", "cry", "angry", "sad", "pout", "scream", "skull", "ghost", "alien", "robot", "kiss-mark", "love", "tongue", "mouth", "lip", "biting", "monocle", "sunglasses", "disguise", "clown", "ogre", "goblin", "poop", "jack-o", "santa", "troll"] },
  { category: "people", match: ["person", "man", "woman", "boy", "girl", "baby", "child", "adult", "older", "people", "family", "couple", "kiss", "handshake", "hand", "finger", "fist", "palm", "wave", "clap", "thumbs", "punch", "backhand", "pinch", "foot", "leg", "ear", "nose", "eye", "brain", "tooth", "bone", "anatomical", "ninja", "superhero", "supervillain", "mage", "fairy", "vampire", "zombie", "genie", "merperson", "elf", "angel", "pregnant", "breast", "crown"] },
  { category: "animals", match: ["dog", "cat", "mouse", "hamster", "rabbit", "fox", "bear", "panda", "koala", "tiger", "lion", "cow", "pig", "frog", "chicken", "penguin", "bird", "eagle", "owl", "bat", "wolf", "horse", "unicorn", "bee", "bug", "butterfly", "snail", "worm", "ant", "cricket", "spider", "turtle", "snake", "lizard", "dinosaur", "whale", "dolphin", "fish", "shark", "octopus", "crab", "lobster", "shrimp", "squid", "elephant", "rhino", "hippo", "camel", "giraffe", "zebra", "gorilla", "deer", "bison", "ram", "goat", "sheep", "chipmunk", "beaver", "otter", "sloth", "hedgehog", "badger", "skunk", "kangaroo", "parrot", "swan", "peacock", "flamingo", "dodo", "seal", "poodle", "rooster", "turkey", "dove", "feather", "dragon", "mammoth", "orangutan", "monkey", "leopard"] },
  { category: "food", match: ["apple", "banana", "grape", "lemon", "orange", "watermelon", "strawberry", "peach", "cherry", "mango", "pineapple", "coconut", "tomato", "avocado", "potato", "carrot", "corn", "pepper", "broccoli", "garlic", "onion", "mushroom", "peanut", "chestnut", "bread", "croissant", "bagel", "pancake", "waffle", "cheese", "meat", "bacon", "hamburger", "fries", "pizza", "hotdog", "sandwich", "taco", "burrito", "egg", "cooking", "popcorn", "butter", "salt", "rice", "noodle", "spaghetti", "dumpling", "soup", "stew", "salad", "sushi", "bento", "pie", "cupcake", "cake", "cookie", "doughnut", "chocolate", "candy", "lollipop", "custard", "ice", "honey", "milk", "tea", "coffee", "mate", "bubble", "juice", "beverage", "cup", "wine", "cocktail", "beer", "champagne", "bottle", "glass", "fork", "knife", "spoon", "chopsticks", "plate", "pretzel", "flatbread", "falafel", "fondue", "tamale", "olive", "blueberr", "bell-pepper", "beans", "jar"] },
  { category: "nature", match: ["sun", "moon", "star", "cloud", "rain", "snow", "thunder", "wind", "tornado", "fog", "rainbow", "umbrella", "comet", "fire", "water", "ocean", "wave", "globe", "earth", "volcano", "mountain", "desert", "island", "sunrise", "sunset", "dusk", "night", "milky", "thermometer", "droplet", "snowflake", "cyclone", "ringed-planet", "shooting", "glowing"] },
  { category: "plants", match: ["flower", "blossom", "bouquet", "rose", "wilted", "hibiscus", "sunflower", "tulip", "seedling", "tree", "leaf", "herb", "shamrock", "clover", "cactus", "palm", "evergreen", "deciduous", "wood", "potted", "nest", "lotus", "hyacinth", "sheaf"] },
  { category: "travel", match: ["car", "taxi", "bus", "trolley", "race", "police", "ambulance", "fire-engine", "truck", "tractor", "motor", "bicycle", "scooter", "skateboard", "roller", "canoe", "ship", "boat", "ferry", "speedboat", "sailboat", "airplane", "helicopter", "rocket", "satellite", "flying", "parachute", "seat", "anchor", "fuel", "construction", "railway", "train", "metro", "tram", "station", "monorail", "locomotive", "suspension"] },
  { category: "places", match: ["house", "building", "office", "hospital", "bank", "hotel", "school", "church", "mosque", "temple", "castle", "stadium", "factory", "tower", "statue", "fountain", "tent", "hut", "derelict", "japanese-", "wedding", "european", "convenience", "love-hotel", "department", "post-office", "cityscape", "camping", "national-park"] },
  { category: "activities", match: ["sport", "soccer", "basketball", "football", "baseball", "softball", "tennis", "volleyball", "rugby", "badminton", "lacrosse", "cricket-game", "hockey", "golf", "ping", "bowling", "boxing", "martial", "wrestling", "fencing", "swimming", "diving", "surfing", "climbing", "skiing", "snowboard", "sled", "curling", "fishing", "running", "yoga", "lifting", "biking", "gymnastics", "trophy", "medal", "prize", "ticket", "admission", "game", "puzzle", "chess", "dice", "dart", "kite", "pool", "joystick", "slot", "magic", "crystal", "nazar", "pinata", "nesting", "sewing", "knot", "performing", "art", "palette", "music", "microphone", "headphone", "saxophone", "accordion", "guitar", "trumpet", "violin", "banjo", "drum", "maracas", "flute", "ball", "racquet"] },
  { category: "objects", match: ["phone", "computer", "laptop", "keyboard", "desktop", "printer", "camera", "video", "television", "radio", "clock", "watch", "hourglass", "alarm", "stopwatch", "timer", "compass", "calendar", "bell", "battery", "plug", "bulb", "flashlight", "candle", "lamp", "book", "notebook", "ledger", "scroll", "newspaper", "bookmark", "label", "money", "coin", "credit", "receipt", "envelope", "email", "inbox", "package", "mailbox", "pencil", "pen", "paintbrush", "crayon", "memo", "briefcase", "folder", "clipboard", "pushpin", "paperclip", "ruler", "scissors", "toolbox", "wrench", "hammer", "axe", "pick", "screwdriver", "nut-and", "gear", "magnet", "key", "lock", "link", "chain", "hook", "broom", "basket", "wastebasket", "soap", "sponge", "lotion", "thread", "yarn", "needle", "ribbon", "gift", "balloon", "confetti", "party", "doll", "teddy", "mirror", "frame", "vase", "door", "window", "bed", "couch", "chair", "toilet", "shower", "bathtub", "razor", "toothbrush", "bucket", "plunger", "abacus", "microscope", "telescope", "satellite-antenna", "syringe", "pill", "stethoscope", "dna", "petri", "test-tube", "x-ray", "adhesive", "crutch", "wheelchair"] },
  { category: "symbols", match: ["warning", "prohibited", "no-entry", "recycle", "check", "cross-mark", "question", "exclamation", "hundred", "multiply", "plus", "minus", "divide", "infinity", "copyright", "trademark", "registered", "currency", "dollar", "euro", "pound", "yen", "arrow", "radio-button", "diamond", "circle", "square", "triangle", "heart-decoration", "peace", "yin", "star-of", "wheel", "atom", "om", "menorah", "dotted", "fleur", "trident", "japanese-symbol", "ideograph", "button", "cool", "free", "congratulations", "secret", "input", "vs", "sign", "keycap", "letter", "number", "end", "back", "top", "soon", "new-button"] },
  { category: "flags", match: ["flag", "pennant", "banner", "pirate", "checkered", "triangular", "crossed"] },
];

function categorize(name) {
  const lower = name.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.match.some((m) => lower.includes(m))) {
      return rule.category;
    }
  }
  return "objects";
}

// ── Build emojibase keyword index ──
// Cross-reference Fluent Emoji icon names with official Unicode CLDR keywords.
import emojibaseData from "emojibase-data/en/data.json" with { type: "json" };

// Build lookup: normalized label → tags array
// emojibase labels use spaces ("grinning face"), Fluent Emoji names use hyphens ("grinning-face")
const emojibaseLookup = {};
for (const entry of emojibaseData) {
  if (!entry.label || !entry.tags) continue;
  const key = entry.label.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  emojibaseLookup[key] = entry.tags;
}

// For skin-tone variants (e.g. "waving-hand-dark"), try base name too
function getEmojibaseTags(name) {
  if (emojibaseLookup[name]) return emojibaseLookup[name];
  // Strip skin tone suffixes and retry
  const base = name.replace(/-(dark|light|medium-dark|medium-light|medium)$/, "");
  if (base !== name && emojibaseLookup[base]) return emojibaseLookup[base];
  return [];
}

function tagsFromName(name) {
  const nameWords = name.split("-").filter((w) => w.length > 1);
  const emojiTags = getEmojibaseTags(name);
  // Deduplicate: emojibase tags that aren't already in nameWords
  const nameSet = new Set(nameWords);
  const extra = emojiTags.filter((t) => !nameSet.has(t));
  return [...nameWords, ...extra];
}

const metadata = names.map((name) => ({
  n: name,
  t: tagsFromName(name),
  c: categorize(name),
}));

metadata.sort((a, b) => a.c.localeCompare(b.c) || a.n.localeCompare(b.n));

mkdirSync(resolve(root, "src/lib/notes"), { recursive: true });
writeFileSync(resolve(root, "src/lib/notes/icon-metadata.json"), JSON.stringify(metadata), "utf8");

console.log(`✓ Generated Fluent Emoji sprite: ${names.length} icons (${(sprite.length / 1024).toFixed(0)}KB)`);
console.log(`✓ Metadata: src/lib/notes/icon-metadata.json (${(JSON.stringify(metadata).length / 1024).toFixed(0)}KB)`);
console.log(`  Categories: ${[...new Set(metadata.map((m) => m.c))].join(", ")}`);
