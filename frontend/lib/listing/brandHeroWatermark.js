const BRAND_WATERMARK_FILES = {
  toyota: "/brands/toyota.svg",
  kia: "/brands/kia.svg",
  mazda: "/brands/mazda.svg",
  hyundai: "/brands/hyundai.svg",
  "mercedes-benz": "/brands/mercedes-benz.svg",
  lexus: "/brands/lexus.svg",
  honda: "/brands/honda.svg",
  bmw: "/brands/bmw.svg",
  peugeot: "/brands/peugeot.svg",
  mitsubishi: "/brands/mitsubishi.svg",
  ford: "/brands/ford.svg",
  chevrolet: "/brands/chevrolet.svg",
  audi: "/brands/audi.svg",
  "land-rover": "/brands/land-rover.svg",
  nissan: "/brands/nissan.svg",
  suzuki: "/brands/suzuki.svg",
  daewoo: "/brands/daewoo.svg",
  volkswagen: "/brands/volkswagen.svg",
  vinfast: "/brands/vinfast.svg",
  volvo: "/brands/volvo.svg",
  jaguar: "/brands/jaguar.svg",
  porsche: "/brands/porsche.svg",
  bentley: "/brands/bentley.svg",
  mini: "/brands/mini.svg",
  beijing: "/brands/beijing.svg",
  isuzu: "/brands/isuzu.svg",
  generic: "/brands/generic-car.svg",
};

/** Display / URL brand strings → watermark file key */
const BRAND_ALIASES = {
  toyota: "toyota",
  kia: "kia",
  mazda: "mazda",
  hyundai: "hyundai",
  "mercedes-benz": "mercedes-benz",
  mercedes: "mercedes-benz",
  "mercedes benz": "mercedes-benz",
  mercedesbenz: "mercedes-benz",
  lexus: "lexus",
  honda: "honda",
  bmw: "bmw",
  peugeot: "peugeot",
  mitsubishi: "mitsubishi",
  ford: "ford",
  chevrolet: "chevrolet",
  chevy: "chevrolet",
  audi: "audi",
  "land-rover": "land-rover",
  "land rover": "land-rover",
  landrover: "land-rover",
  nissan: "nissan",
  suzuki: "suzuki",
  daewoo: "daewoo",
  volkswagen: "volkswagen",
  vw: "volkswagen",
  vinfast: "vinfast",
  "vin fast": "vinfast",
  volvo: "volvo",
  jaguar: "jaguar",
  porsche: "porsche",
  bentley: "bentley",
  mini: "mini",
  beijing: "beijing",
  isuzu: "isuzu",
};

const BRAND_KEYS = Object.keys(BRAND_WATERMARK_FILES).filter((k) => k !== "generic");

function normalizeBrandKey(brand) {
  const raw = String(brand || "").trim().toLowerCase();
  if (!raw) return null;

  if (BRAND_ALIASES[raw]) return BRAND_ALIASES[raw];

  const hyphenated = raw.replace(/\s+/g, "-");
  if (BRAND_ALIASES[hyphenated]) return BRAND_ALIASES[hyphenated];

  const compact = raw.replace(/[\s-]+/g, "");
  if (BRAND_ALIASES[compact]) return BRAND_ALIASES[compact];

  if (BRAND_WATERMARK_FILES[hyphenated]) return hyphenated;
  if (BRAND_WATERMARK_FILES[compact]) return compact;
  if (BRAND_WATERMARK_FILES[raw]) return raw;

  return null;
}

export function resolveHeroWatermark(brand) {
  const key = normalizeBrandKey(brand) || "generic";
  return {
    key,
    src: BRAND_WATERMARK_FILES[key] || BRAND_WATERMARK_FILES.generic,
    className: `listing-hero__watermark--${key}`,
  };
}

export { normalizeBrandKey, BRAND_KEYS, BRAND_WATERMARK_FILES, BRAND_ALIASES };
