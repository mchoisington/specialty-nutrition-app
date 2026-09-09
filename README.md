# Peace Meal

A personal, evidence-based nutrition planner for a household where people have different medical conditions, allergies, eating patterns, and amounts of time to cook. Every rule the app applies cites its source. The app never invents a therapeutic number: if a guideline says a clinician must set it, the app asks for that number and applies it as given.

This is a personal tool for one family. It is not a medical device and does not diagnose or treat anything. See `docs/PHASE-1-evidence-and-regulatory-foundation.md` for the evidence behind every module and `docs/PHASE-2-prd-and-architecture.md` for how the app is built.

## Run it

No install, no build, no server, no account.

- **Single file:** open `dist/nutrition-app.html` in any browser, including on a phone. Everything is inside that one file. Save it to your home screen and it works offline.
- **From the folder:** `npm run serve` then open http://localhost:8123. This mode also registers the offline service worker.
- **GitHub Pages:** pushes to `main` publish the app if Pages is enabled for the repository.

All data stays in the browser on that device. Use Settings to export a backup file and import it on another device.

## What is inside

| Path | What it is |
|---|---|
| `data/conditions.json` | Every condition, pattern, and restriction module: rules, tiers, conflicts, phases, education, citations |
| `data/sources.json` | The citation for every source id used anywhere |
| `data/dictionaries.json` | Ingredient terms to tags. This is the only thing the app uses to recognize allergens and restricted foods |
| `data/foods.json` | Curated USDA FoodData Central subset. Numbers come from USDA files by FDC ID and are never edited by hand |
| `data/recipes.json` | Seed recipes with time, skill, equipment, and ingredient links to foods. Nutrients are computed, not stored |
| `src/engine/` | The deterministic rules engine, checker, planner, and grocery builder |
| `src/ui/` | Screens |
| `tools/` | USDA importer, validator, single-file bundler |
| `test/` | Engine tests |
| `docs/` | Phase 1 evidence, Phase 2 architecture, VERIFY log, screenshots |

## Working on it

```
npm test            # engine tests
npm run validate    # every rule cites a real source, every tag is declared, every recipe ingredient exists
npm run build:foods # regenerate data/foods.json from the USDA CSVs in tools/usda/ (download first; see tools/build-foods.mjs)
npm run bundle      # write dist/nutrition-app.html
```

Content changes go in `data/`. Run `npm run validate` after any edit. The validator fails on a rule without a source, an undeclared tag, or a recipe that stores nutrient numbers.

## Safety rules the code enforces

1. Allergens are absolute. No preference, mode, or acknowledgment overrides them.
2. Hard conflicts (for example hypertension and POTS on sodium) stop the number, not the plan. The app shows the conflict and asks for a clinician's number.
3. Tier 2 numbers are never generated. Without one, the module runs in Tier 1 only, with a visible notice.
4. Elimination phases expire. The app prompts reintroduction and requires acknowledgment to continue past the maximum.
5. A positive eating-disorder screen turns off calorie targets, weight-loss plans, and new elimination protocols. Allergen and celiac rules stay on.
6. Pregnancy disables weight loss, ketogenic and very low carbohydrate patterns, intermittent fasting, and every elimination protocol except allergen and celiac rules.
7. Ingredient text the dictionary does not recognize is reported as not recognized. It is never counted as safe.
8. There is no language model in the app.
