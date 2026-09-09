# Phase 2: PRD, Architecture, and Data Model
Evidence-Based Specialty Nutrition App
Prepared September 5, 2026

This document turns Phase 1 into a buildable v1. It records the decisions made, the ones Mary delegated, and the reasons. Phase 1 (docs/PHASE-1-evidence-and-regulatory-foundation.md) remains the source of truth for what the app may say and do about any condition. Nothing here loosens it.

## 1. Who this is for and what it must do

Personal wellness tool for Mary and specific family members. Not a commercial product in v1. No registered dietitian involved. Family members' clinicians supply any therapeutic numbers (Tier 2); the app enforces them and never invents them.

The app must:

1. Let each person record conditions, eating patterns, allergens, preferences, medications that change the rules, cooking time and skill, and clinician-provided numbers.
2. Merge the rules for everything that person selected into one plan, show every conflict instead of silently picking a side, and cite the source for every rule.
3. Check a food, ingredient list, or recipe against that plan, with allergens as hard exclusions that no setting can override.
4. Build a week of meals that fit the plan and the person's real cooking time, then produce a grocery list.
5. Track symptoms against meals for the time-limited elimination protocols (low FODMAP, low histamine) and force reintroduction prompts.
6. Screen for disordered eating before any weight-focused or restrictive feature turns on.
7. Explain the evidence honestly, with the rating from Phase 1, in plain language.

## 2. Decisions

| Decision | Choice | Why |
|---|---|---|
| Platform | Single-page progressive web app, static files, no build step | Same shape as Mary's existing Visual Reset app. Runs from GitHub Pages or a local folder. Works offline once loaded. |
| Backend | None | Family health data stays on the device. No accounts, no server, no breach surface. Export and import as a JSON file for backup and moving between devices. |
| Language | Vanilla JavaScript ES modules, no framework | No dependency churn, no build, readable by anyone who opens the file. |
| Rules | Data files (JSON), not code | A clinician can read the rule and its citation without reading JavaScript. The engine is generic; the content is the product. |
| Nutrient data | USDA FoodData Central (SR Legacy and Foundation Foods), imported by script, every food keyed by its FDC ID | Deterministic and traceable. Phase 1 A2 requires this for kidney rules. |
| Language models | None in the app | Phase 1 Part C: the allergen and nutrient paths must never rely on an LLM. There is no LLM anywhere in v1. |
| Tier 2 numbers | Entered by the user from their clinician, stored per person, shown as "clinician-set" | Phase 1 two-tier rule. Without a number, the module runs in Tier 1 only mode with a visible notice. |
| Eating-disorder screen | SCOFF, five items, at onboarding, before weight or elimination features | Phase 1 A9. Mary owns the wording; the shipped text is a placeholder for her to replace. |
| Age gate | Adults only. Caregiver mode for a child's confirmed celiac disease or diagnosed food allergies only | Phase 1 D10. |
| Monash FODMAP data | Not used. FODMAP tags come from published studies and carry a "not Monash-verified" notice | Phase 1 stage note. |
| Hosting | GitHub Pages from the main branch | Free, private repo still allows Pages for the owner's account tier to be checked; fallback is opening index.html locally. |

## 3. Architecture

```
index.html            App shell, loads src/app.js as a module
src/
  app.js              Router and top-level state
  engine/
    plan.js           Merges selected modules into a plan; conflict resolution; tier gating
    checker.js        Checks a food, ingredient string, or recipe against a plan
    nutrition.js      Deterministic nutrient math from foods.json
    planner.js        Weekly meal plan generation and recipe scoring
    grocery.js        Grocery list from a plan
    dictionary.js     Ingredient text to tags, using data/dictionaries
    screen.js         SCOFF scoring and feature gating
  ui/                 One module per screen
  store.js            localStorage persistence, export and import
data/
  sources.json        Every citation, keyed by id
  conditions.json     Every condition, pattern, and restriction module with its rules
  dictionaries.json   Ingredient terms to tags (allergens, hidden gluten, added-sugar names, FODMAP subgroups, and so on)
  foods.json          Curated USDA subset with per-100 g nutrients, portions, and tags
  recipes.json        Seed recipes with time, skill, equipment, and ingredient links to foods
tools/
  build-foods.mjs     Imports USDA CSVs into data/foods.json (run by hand; output is committed)
  validate.mjs        Validates every data file against the contracts below and checks that every rule cites a source that exists
test/                 node:test unit tests for the engine
```

The engine never reads free text to decide anything about safety. The dictionary is a maintained list of terms with exact and word-boundary matching. Unknown ingredients are reported as unknown, not assumed safe.

## 4. Data contracts

All files are JSON. IDs are lowercase kebab-case. Every rule has at least one source id that exists in sources.json; tools/validate.mjs fails the build otherwise.

### 4.1 sources.json

```
[
  { "id": "ada-soc-2026", "citation": "ADA. Standards of Care in Diabetes 2026. Diabetes Care 2026;49(Suppl 1).", "type": "guideline", "year": 2026, "url": "" }
]
```
type is one of guideline, consensus, rct, review, cohort, regulation, patient-material, other.

### 4.2 conditions.json

One entry per module. category is condition, pattern, or restriction.

```
{
  "id": "hypertension",
  "name": "Hypertension",
  "category": "condition",
  "phase1_ref": "Part A, 2",
  "evidence": { "rating": "strong", "summary": "..." },
  "sources": ["aha-acc-htn-2025", "dash-1997", "dash-sodium-2001", "ssass-2021"],
  "tier2": [
    { "param": "potassium_mg_min", "label": "Potassium target", "when": "medication.potassium_retaining or condition ckd", "consensus": "3,500 to 5,000 mg/day from food", "why": "..." }
  ],
  "rules": [
    {
      "id": "htn-sodium",
      "kind": "limit",                 // limit | target | avoid | prefer | timing | behavior | info
      "nutrient": "sodium_mg",         // for limit and target
      "op": "<=", "value": 2300, "per": "day",
      "ideal": 1500,                   // optional secondary value
      "tier": 1,
      "strength": "must",              // must | should | may
      "text": "Keep sodium under 2,300 mg a day, ideally under 1,500 mg.",
      "sources": ["aha-acc-htn-2025", "dash-sodium-2001"]
    },
    {
      "id": "htn-pattern",
      "kind": "prefer", "tags": ["vegetable", "fruit", "whole-grain", "legume", "nut", "fish", "low-fat-dairy"],
      "tier": 1, "strength": "should", "text": "...", "sources": ["aha-acc-htn-2025"]
    },
    {
      "id": "htn-avoid-ssb",
      "kind": "avoid", "tags": ["sugar-sweetened-beverage"], "hard": false,
      "tier": 1, "strength": "should", "text": "...", "sources": ["aha-acc-htn-2025"]
    }
  ],
  "conflicts": [
    { "with": "pots", "type": "hard", "param": "sodium_mg", "resolution": "clinician", "text": "..." },
    { "with": "ckd", "type": "hard", "param": "potassium_mg", "resolution": "suppress:hypertension", "text": "..." }
  ],
  "medication_questions": [
    { "id": "potassium_retaining", "text": "Do you take an ACE inhibitor, ARB, spironolactone, or a potassium-sparing diuretic?", "effect": "suppress:htn-potassium" }
  ],
  "phases": null,
  "modes": null,
  "disables": [],
  "education": {
    "plain": "...",
    "evidence": ["..."],
    "contested": ["..."],
    "do_not_claim": ["..."]
  }
}
```

Elimination protocols carry phases:
```
"phases": [
  { "id": "elimination", "label": "Elimination", "min_weeks": 2, "max_weeks": 6, "rules": ["fodmap-elim-avoid"] },
  { "id": "reintroduction", "label": "Reintroduction", "min_weeks": 6, "max_weeks": 8, "rules": ["fodmap-reintro"] },
  { "id": "personalization", "label": "Personalization", "rules": [] }
]
```
Rules listed under a phase apply only while that phase is active. The engine refuses to keep a person in elimination past max_weeks without an acknowledgment and a reintroduction prompt.

Two-mode conditions (IBD) carry modes with an expiry:
```
"modes": [ { "id": "remission", "default": true }, { "id": "flare", "expires_days": 14, "rules": ["ibd-flare-texture"] } ]
```

disables lists feature ids that the module turns off (pregnancy disables weight-loss, keto, low-carb-under-175, intermittent-fasting, and every elimination protocol except allergen and celiac).

### 4.3 Nutrient keys

kcal, protein_g, carb_g, fiber_g, sugar_g, added_sugar_g, fat_g, satfat_g, transfat_g, cholesterol_mg, sodium_mg, potassium_mg, phosphorus_mg, calcium_mg, iron_mg, magnesium_mg, vitamin_c_mg, vitamin_d_iu, vitamin_b12_ug, folate_ug, zinc_mg, iodine_ug, caffeine_mg, alcohol_g, fluid_ml, purine_est (only where a source supports it; otherwise use tags).

USDA does not carry added sugar for SR Legacy foods; added_sugar_g is null unless a label value is entered by the user for a packaged product.

### 4.4 Tags

Tags are the shared vocabulary between rules, dictionaries, foods, and recipes. Each tag is declared once in dictionaries.json with a label, a description, and sources. Rules reference tags; foods and recipes carry tags; dictionary entries map ingredient text to tags. Tag families:

- Allergens: allergen-milk, allergen-egg, allergen-fish, allergen-crustacean, allergen-tree-nut, allergen-peanut, allergen-wheat, allergen-soy, allergen-sesame. Hard exclusions.
- Gluten: gluten, gluten-hidden, oats-regular, oats-certified-gf.
- Soy: soy, soy-refined-oil, soy-lecithin.
- Dairy: lactose-high, lactose-low, lactose-hidden.
- Sugar: added-sugar, sugar-sweetened-beverage, non-nutritive-sweetener.
- FODMAP: fodmap-fructan, fodmap-gos, fodmap-lactose, fodmap-fructose, fodmap-sorbitol, fodmap-mannitol. Each entry may carry a portion note.
- Histamine: histamine-high, histamine-fermented, histamine-aged. Portion and freshness notes.
- Kidney: phosphate-additive, potassium-additive, potassium-high-food.
- Stones: oxalate-high.
- Gout: purine-high, purine-moderate.
- Pregnancy: unpasteurized, raw-animal, deli-meat, mercury-high, mercury-low-fish, raw-sprouts, alcohol, caffeine.
- Pattern: vegetable, fruit, whole-grain, refined-grain, legume, nut, seed, fish, poultry, red-meat, processed-meat, low-fat-dairy, full-fat-dairy, olive-oil, ultra-processed, fried, high-fiber-insoluble, small-particle-friendly, fermented-live-culture.
- Texture (gastroparesis and IBD flare): large-particle, skin-or-seed, raw-vegetable, tough-meat, bezoar-risk.
- Thyroid timing: iron-supplement, calcium-rich, soy, high-fiber, coffee (used only by the levothyroxine timing rule).

### 4.5 foods.json

```
{
  "id": "fdc-171287",
  "fdcId": 171287,
  "dataset": "sr-legacy",
  "name": "Egg, whole, raw, fresh",
  "short": "Egg, whole",
  "group": "Dairy and Egg Products",
  "per100g": { "kcal": 143, "protein_g": 12.56, ... },
  "portions": [ { "label": "1 large", "grams": 50 } ],
  "tags": ["allergen-egg"],
  "tag_notes": {}
}
```
Every number comes from the USDA file. tools/build-foods.mjs writes this file; nobody edits numbers by hand. Tags are assigned by the dictionary plus a curated overrides file (tools/food-tags.json) that is reviewed like any other content.

### 4.6 recipes.json

```
{
  "id": "sheet-pan-salmon-vegetables",
  "name": "Sheet-pan salmon with vegetables",
  "meal": ["dinner"],
  "servings": 4,
  "active_min": 15, "total_min": 35,
  "skill": "beginner",              // beginner | comfortable | confident
  "equipment": ["oven"],            // stove, oven, microwave, air-fryer, slow-cooker, pressure-cooker, blender, none
  "assembly_only": false,
  "leftovers": "good",              // good | ok | poor
  "ingredients": [ { "food": "fdc-175168", "grams": 450, "display": "1 lb salmon fillet" } ],
  "steps": ["..."],
  "tags": ["fish", "vegetable", "olive-oil"],
  "notes": { "sodium_tip": "...", "swaps": [ { "if_tag": "allergen-fish", "then": "..." } ] }
}
```
Nutrients per serving are computed at runtime from foods.json. The recipe file holds no nutrient numbers.

### 4.7 Profile (stored on device)

```
{
  "version": 1,
  "people": [
    {
      "id": "p1", "name": "Mary", "adult": true,
      "sex": "female", "age": 45, "weight_kg": null, "height_cm": null,
      "modules": ["hypertension", "low-fodmap"],
      "allergens": ["allergen-tree-nut"],
      "preferences": { "avoid_tags": ["red-meat"], "avoid_terms": ["cilantro"], "patterns": ["vegetarian"] },
      "medications": { "potassium_retaining": false, "insulin_or_su": false, "sglt2": false, "levothyroxine": false },
      "pregnancy": false, "breastfeeding": false,
      "tier2": { "sodium_mg_max": null },
      "screen": { "scoff": [false,false,false,false,false], "positive": false, "completed_at": null },
      "phases": { "low-fodmap": { "phase": "elimination", "started": "2026-09-05" } },
      "modes": { "ibd": "remission" },
      "acknowledged": [],
      "cooking": {
        "weekday_minutes": 20, "weekend_minutes": 40,
        "cook_days": ["sun","mon","wed","fri"],
        "interest": "simple",        // learn | simple | minimal | assembly
        "skill": "comfortable",
        "equipment": ["stove","oven","microwave"],
        "leftovers": "ok",
        "household": 2,
        "grocery": "supermarket"
      }
    }
  ],
  "log": [ { "date": "2026-09-05", "person": "p1", "meal": "lunch", "recipe": "...", "symptoms": { "bloating": 2 } } ]
}
```

## 5. Engine behavior that must hold

1. **Allergens are absolute.** A hard exclusion cannot be overridden by any preference, mode, or acknowledgment. The checker reports a hard fail for an allergen match and for an unknown ingredient when an allergen is selected.
2. **Hard conflicts stop the number, not the plan.** Hypertension plus POTS: no sodium limit is generated; the conflict is shown; the rest of the plan still builds.
3. **Tier 2 without a number means Tier 1 only, with a notice.** The notice names the parameter that was not applied.
4. **Elimination phases expire.** Past max_weeks the app prompts reintroduction and requires acknowledgment to continue.
5. **Positive eating-disorder screen disables** calorie targets, weight-loss plans, and new elimination protocols, and shows the referral language. Allergen and celiac rules stay on.
6. **Pregnancy disables** everything Phase 1 D1 lists.
7. **Multiple simultaneous eliminations trigger a restriction-load check-in.** Three or more of: low FODMAP, low histamine, gluten-free (non-celiac), dairy-free (non-allergy), low-carb.
8. **Every displayed rule shows its citation** and evidence rating on tap.
9. **Numbers never come from text.** Nutrients are summed from foods.json by grams.
10. **Unknown is not safe.** Unmatched ingredient text is reported as "not recognized" and never counted as passing.

## 6. Out of scope for v1

Barcode scanning, restaurant lookup, glucose or blood pressure device integration, clinician login (B1 clinician link is a Stage 2 item; v1 uses manual Tier 2 entry), pediatric anything beyond caregiver allergen and celiac mode, dialysis fluid math beyond a clinician-entered limit.

## 7. Open items carried from Phase 1

Seven VERIFY flags remain in Phase 1. None blocks v1 because none is encoded as a numeric rule; the GLP-1 protein range is shown as a range with its flag. They are listed in docs/VERIFY-log.md and should be cleared before the numbers are trusted.


## 8. Wave 2 (September 9, 2026)

Scope changes: removed migraine, CRPS, POTS, non-celiac gluten-free, and the eating-disorder screen; added rheumatoid arthritis, chronic constipation, osteoarthritis, type 1 diabetes, diverticular disease, DASH, Portfolio diet, time-restricted eating, and a pescatarian variant.

New engine modules: `energy.js` (Mifflin-St Jeor, activity factors, MET table, unit conversion), `group.js` (group plans, profile sharing), `pantry.js` (what can I make), grocery adjustments and change log in `grocery.js`, budget overlap and per-day eaters in `planner.js`, user-defined patterns in `plan.js`.

New screens: Today (diary, calorie target, favorites, weight, exercise), Pantry, Together (group planning, guests, sharing). Grocery gains editing and a change log; Learn gains full articles from `data/articles.json`.

Profile schema v2 (see `src/store.js`): weight and height are stored in kg and cm, entered in lb and ft/in; `diary`, `weights`, `exercise`, `pantry`, `grocery_adjustments`, `grocery_changes` live on the profile; `custom_modules`, `goals`, `favorites`, `servings_by_day`, `setup_complete` live on the person. `migrate()` fills new fields on load.

## 9. Wave 3 (September 9, 2026)

Meal slots. Recipes carry a `meal` list; `component` is a new value for sauces, dressings, stocks, doughs, spice mixes, and dips. Components stay in the library (Recipes filter "Sauces and basics") and are never scheduled into any slot. Classification lives in `tools/lib/meal-components.mjs` (title head-noun rules with handling for "X and Y", "X with Y", "X on Y", and parenthetical English descriptions of foreign names). Both importers apply it on the way in; `tools/fix-meal-slots.mjs` re-tags the files on disk and is idempotent. The same pass drops desserts and party food that a source filed under breakfast. Why: 334 basics were being scheduled as lunches and dinners, and a plain hummus was landing in breakfast because the Wikibooks page carries a "Breakfast recipes" category.

Snacks. `planner.js` builds each day from `daySlots(person, plan)`: breakfast, morning snack, lunch, afternoon snack, dinner, evening snack, with the snack slots chosen by `snackPlan()`. Defaults come from the plan's modules and cite their rules: gestational diabetes gets an afternoon and a bedtime snack (gdm-carb: three meals and two to three snacks), reflux gets morning and afternoon and never an evening snack (gerd-small-meals), gastroparesis, GLP-1 users, and cancer treatment get two (gp-small-meals, wm-glp1-meals, ca-tx-symptoms), children get two, everyone else gets one afternoon snack. `cooking.snacks_per_day` (0 to 3) overrides the count; the reflux rule still removes the evening slot. Snack slots take recipes tagged `snack`, never leftovers, never batch-cooked, and are held to a 15 minute window.

Per-day cooking. `cooking.day_minutes` ({ mon: 60 }) overrides the weekday/weekend minutes for that weekday; `cooking.cook_days` is toggled from the Week screen (the last cooking day cannot be removed, since an empty list means every day). Both are edited inline on the Week screen and stick for future weeks.

Spice. `src/engine/spice.js` estimates a heat level (0 none, 1 mild, 2 medium, 3 hot) from the title and ingredient text with three term tiers, a faint tier that only counts in pairs (curry powder, paprika), a zero tier that never counts (black pepper, ginger), and adjustments for "optional", a pinch, sweet chili sauce, and "chile-free". Three medium ingredients add up to hot. `preferences.spice` is one of any, none, mild, medium, hot: recipes above the level are excluded from the week, Recipes (with a "hidden by your settings" link), Pantry, and swaps; recipes inside the level get a small score nudge. The estimate and the terms that drove it are shown on the recipe.

Welcome. The first screen no longer uses the word "rule"; it lists who the app is for and what it does.
