// apps/api/src/ai-validation/units.ts — NEW (ai-signals C1)
//
// Pure, no I/O. Only exact, well-defined conversions — anything else
// returns null, which cost.ts/service.ts treat as "units aren't
// comparable", one of the standard no-match reasons (S-3).

type UnitFamily = "area" | "length" | "volume" | "mass" | "count";

interface NormalizedUnit {
  family: UnitFamily;
  // Canonical unit within the family that all conversions route through.
  canonical: string;
}

// Alias -> canonical unit name. Keys are lowercased, punctuation-stripped
// forms (see normalizeUnit's own cleanup) so "sq ft", "sqft" and "sf" all
// land on the same entry.
const UNIT_ALIASES: Record<string, NormalizedUnit> = {
  // Area
  sqm: { family: "area", canonical: "sqm" },
  m2: { family: "area", canonical: "sqm" },
  sqmeter: { family: "area", canonical: "sqm" },
  sqmeters: { family: "area", canonical: "sqm" },
  squaremeter: { family: "area", canonical: "sqm" },
  squaremeters: { family: "area", canonical: "sqm" },
  sqft: { family: "area", canonical: "sqft" },
  sf: { family: "area", canonical: "sqft" },
  squarefoot: { family: "area", canonical: "sqft" },
  squarefeet: { family: "area", canonical: "sqft" },

  // Length
  m: { family: "length", canonical: "m" },
  meter: { family: "length", canonical: "m" },
  meters: { family: "length", canonical: "m" },
  lf: { family: "length", canonical: "lf" },
  lnft: { family: "length", canonical: "lf" },
  linearft: { family: "length", canonical: "lf" },
  linearfoot: { family: "length", canonical: "lf" },
  linearfeet: { family: "length", canonical: "lf" },
  ft: { family: "length", canonical: "lf" },
  foot: { family: "length", canonical: "lf" },
  feet: { family: "length", canonical: "lf" },

  // Volume
  cy: { family: "volume", canonical: "cy" },
  cuyd: { family: "volume", canonical: "cy" },
  cubicyard: { family: "volume", canonical: "cy" },
  cubicyards: { family: "volume", canonical: "cy" },
  m3: { family: "volume", canonical: "m3" },
  cum: { family: "volume", canonical: "m3" },
  cubicmeter: { family: "volume", canonical: "m3" },
  cubicmeters: { family: "volume", canonical: "m3" },

  // Mass
  kg: { family: "mass", canonical: "kg" },
  kilogram: { family: "mass", canonical: "kg" },
  kilograms: { family: "mass", canonical: "kg" },
  lb: { family: "mass", canonical: "lb" },
  lbs: { family: "mass", canonical: "lb" },
  pound: { family: "mass", canonical: "lb" },
  pounds: { family: "mass", canonical: "lb" },

  // Count
  each: { family: "count", canonical: "each" },
  ea: { family: "count", canonical: "each" },
  pc: { family: "count", canonical: "each" },
  pcs: { family: "count", canonical: "each" },
  piece: { family: "count", canonical: "each" },
  pieces: { family: "count", canonical: "each" },
  unit: { family: "count", canonical: "each" },
  units: { family: "count", canonical: "each" },
  bag: { family: "count", canonical: "bag" },
  bags: { family: "count", canonical: "bag" },
  project: { family: "count", canonical: "project" },
};

// Lowercase, strip everything but letters/digits so "sq. ft.", "Sq Ft",
// "SQ-FT" and "sqft" all key the same lookup.
const cleanKey = (raw: string): string => raw.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

export const normalizeUnit = (raw: string): NormalizedUnit | null => {
  const key = cleanKey(raw);
  return UNIT_ALIASES[key] ?? null;
};

// Conversion factors between two canonical units in the SAME family, i.e.
// "1 <from> = factor <to>". Only exact, well-defined pairs — anything not
// listed here is not convertible.
const CONVERSIONS: Record<string, number> = {
  "sqm->sqft": 10.7639,
  "sqft->sqm": 1 / 10.7639,
  "m->lf": 3.28084,
  "lf->m": 1 / 3.28084,
  "m3->cy": 1.30795,
  "cy->m3": 1 / 1.30795,
  "kg->lb": 2.20462,
  "lb->kg": 1 / 2.20462,
};

// Converts a quantity from one unit string to another. Returns null when
// either unit is unrecognized, they're in different families, or (for a
// same-family pair) no exact factor is defined — never a guessed or
// approximate answer.
export const convertQuantity = (quantity: number, fromUnit: string, toUnit: string): number | null => {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (!from || !to) return null;
  if (from.family !== to.family) return null;
  if (from.canonical === to.canonical) return quantity;

  const factor = CONVERSIONS[`${from.canonical}->${to.canonical}`];
  if (factor == null) return null;
  return quantity * factor;
};
