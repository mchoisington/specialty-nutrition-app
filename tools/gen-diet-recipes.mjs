// Writes Peace Meal's own low FODMAP and low histamine recipes into data/recipes.json.
// Every ingredient links to a USDA FoodData Central record (or one of the four derived lactose-free dairy records), so
// nutrition is exact. Each recipe states which diet it was written for; the checker still decides, this is only the intent.
// Re-running replaces the earlier set (ids lf-*, lh-*, lfh-*). Prints any recipe that fails its own diet's check.
//
// Usage: node tools/gen-diet-recipes.mjs
import fs from 'node:fs';
import { buildMatcher } from '../src/engine/dictionary.js';
import { buildPlan } from '../src/engine/plan.js';
import { checkRecipe } from '../src/engine/checker.js';

const J = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const OUT = new URL('../data/recipes.json', import.meta.url);

// USDA FoodData Central ids used below (looked up by name in data/foods.json)
const F = {
  chicken: 'fdc-171052', turkey: 'fdc-174493', beef: 'fdc-2514743', lamb: 'fdc-172487', cod: 'fdc-174191', haddock: 'fdc-171964', trout: 'fdc-173717', tilapia: 'fdc-2684442', halibut: 'fdc-174200', salmon: 'fdc-171998', tuna: 'fdc-334194', shrimp: 'fdc-171971', egg: 'fdc-171287',
  rice: 'fdc-168877', brownRice: 'fdc-2512380', quinoa: 'fdc-168874', oats: 'fdc-2346396', riceNoodles: 'fdc-168914', gfPasta: 'fdc-168899', pasta: 'fdc-169736', riceFlour: 'fdc-790214', wheatFlour: 'fdc-168894', cornmeal: 'fdc-169697', cornTortilla: 'fdc-173241', potato: 'fdc-170026', sweetPotato: 'fdc-168483', buckwheat: 'fdc-170686', riceCakes: 'fdc-170251', cornstarch: 'fdc-169698', wwBread: 'fdc-172688',
  carrot: 'fdc-2258586', zucchini: 'fdc-169291', redPepper: 'fdc-170110', cucumber: 'fdc-2346406', romaine: 'fdc-2346389', kale: 'fdc-323505', chard: 'fdc-169991', broccoli: 'fdc-747447', pumpkin: 'fdc-168450', butternut: 'fdc-169296', scallion: 'fdc-170005', chives: 'fdc-169994', ginger: 'fdc-169231', cabbage: 'fdc-169979', garlic: 'fdc-169230', celery: 'fdc-2346405', cauliflower: 'fdc-2685573', beets: 'fdc-2685576', greenBeans: 'fdc-2346400', peas: 'fdc-170419', tomato: 'fdc-170457', spinach: 'fdc-168463',
  parsley: 'fdc-170416', basil: 'fdc-172232', cilantro: 'fdc-169997', thyme: 'fdc-173470', rosemary: 'fdc-173473', oregano: 'fdc-171328', cumin: 'fdc-170923', turmeric: 'fdc-172231', paprika: 'fdc-171329', cinnamon: 'fdc-171320', gingerGround: 'fdc-170926', pepper: 'fdc-170931', salt: 'fdc-746775', bay: 'fdc-170917', nutmeg: 'fdc-171326', cardamom: 'fdc-170919', dill: 'fdc-171322', coriander: 'fdc-170922',
  lfMilk: 'lf-milk-whole', lfMilk1: 'lf-milk-lowfat', lfYogurt: 'lf-yogurt-plain', lfCream: 'lf-cream-light', milk: 'fdc-746782', mozzarella: 'fdc-170845', feta: 'fdc-2259796', butter: 'fdc-173410', cheddar: 'fdc-328637', parmesan: 'fdc-173431', ricotta: 'fdc-171248', coconutMilk: 'fdc-170173', riceMilk: 'fdc-171942',
  blueberries: 'fdc-2346411', banana: 'fdc-173944', grapes: 'fdc-2346412', cantaloupe: 'fdc-746770', honeydew: 'fdc-2710816', pineapple: 'fdc-2346398', orange: 'fdc-169097', raspberries: 'fdc-2346410', strawberries: 'fdc-2346409', apple: 'fdc-167793', pear: 'fdc-167776', watermelon: 'fdc-167765', lemonJuice: 'fdc-167747',
  macadamia: 'fdc-2515378', pepitas: 'fdc-2515380', sunflower: 'fdc-168594', chia: 'fdc-2710819', pineNuts: 'fdc-2346392', almonds: 'fdc-168596', peanutButter: 'fdc-172470', walnuts: 'fdc-170187', flax: 'fdc-169414', sesame: 'fdc-170150', tahini: 'fdc-169410',
  oliveOil: 'fdc-171413', canola: 'fdc-172336', coconutOil: 'fdc-330458', sesameOil: 'fdc-171016', maple: 'fdc-169661', sugar: 'fdc-746784', brownSugar: 'fdc-168833', vanilla: 'fdc-173471', bakingPowder: 'fdc-172803', bakingSoda: 'fdc-175040', water: 'fdc-173647', stock: 'fdc-172884', mustard: 'fdc-172234', honey: 'fdc-169640', chickpeas: 'fdc-173800', lentils: 'fdc-172421', blackBeans: 'fdc-175238'
};
const foods = J('foods.json');
const foodsById = new Map((Array.isArray(foods) ? foods : foods.foods).map(f => [f.id, f]));
for (const [k, id] of Object.entries(F)) if (!foodsById.has(id)) throw new Error(`food ${k} = ${id} not in foods.json`);

const i = (food, grams, display) => ({ food: F[food], grams, display });
const gio = grams => i('oliveOil', grams, `${grams >= 20 ? '1½ tbsp' : grams >= 13 ? '1 tbsp' : '2 tsp'} garlic-infused olive oil`);
const tops = grams => i('scallion', grams, `${Math.round(grams / 10)} spring onion green tops, sliced`);
const stockCup = (grams, n) => i('stock', grams, `${n} homemade chicken stock without onion or garlic`);
// Both-diet recipes use water or a quick vegetable stock: long-simmered meat stock is not tolerated on a low histamine trial.
const waterCup = (grams, n) => i('water', grams, `${n} water`);   // the method suggests a quick vegetable stock made without onion or garlic

// [id, name, meal, servings, active, total, skill, equipment, assemblyOnly, leftovers, writtenFor, ingredients, steps]
const R = [];
const add = (id, name, meal, servings, active_min, total_min, skill, equipment, assembly_only, leftovers, written_for, ingredients, steps) =>
  R.push({ id, name, meal, servings, active_min, total_min, skill, equipment, assembly_only, leftovers, ingredients, steps, tags: [], diet_written_for: written_for, notes: { written_for: written_for.map(w => w === 'low-fodmap' ? 'Written for the low FODMAP elimination phase: no onion, garlic, wheat, lactose, honey, or the high-FODMAP fruit and vegetables in the Monash-group lists.' : 'Written for a low histamine trial along the SIGHI list: fresh meat and fish, no tomato, spinach, aged cheese, cured meat, vinegar, or fermented sauces. Eat it fresh; do not keep leftovers.') } });
const BOTH = ['low-fodmap', 'low-histamine'], LF = ['low-fodmap'], LH = ['low-histamine'];
const LD = ['lunch', 'dinner'];

// ---------------------------------------------------------------- written for both diets
add('lfh-ginger-chicken-rice-bowl', 'Ginger chicken and vegetable rice bowl', LD, 2, 20, 30, 'beginner', ['stove'], false, 'ok', BOTH,
  [i('chicken', 300, '300 g chicken breast, sliced'), i('rice', 150, '¾ cup white rice, uncooked'), i('carrot', 120, '2 carrots, cut into thin sticks'), i('zucchini', 150, '1 zucchini, sliced'), i('ginger', 15, '1 tbsp fresh ginger, grated'), tops(30), i('sesameOil', 10, '2 tsp toasted sesame oil'), i('canola', 10, '2 tsp canola oil'), i('salt', 2, '½ tsp salt')],
  ['Cook the rice in plenty of water until tender, about 15 minutes; drain.', 'Heat the canola oil in a wide pan over high heat. Add the chicken with the salt and cook, turning, until browned and cooked through, 6 to 8 minutes. Lift out.', 'Add the carrot and zucchini to the pan and stir-fry 3 minutes. Add the ginger and cook 30 seconds.', 'Return the chicken, add the sesame oil and spring onion tops, toss, and serve over the rice.']);
add('lfh-herb-roasted-chicken-potatoes', 'Herb-roasted chicken thighs with potatoes and carrots', ['dinner'], 4, 15, 55, 'beginner', ['oven'], false, 'ok', BOTH,
  [i('chicken', 600, '600 g boneless chicken thighs'), i('potato', 600, '600 g potatoes, cut into chunks'), i('carrot', 300, '4 carrots, cut into chunks'), i('rosemary', 4, '2 sprigs fresh rosemary, leaves chopped'), i('thyme', 3, '3 sprigs fresh thyme'), i('oliveOil', 30, '2 tbsp olive oil'), i('salt', 4, '¾ tsp salt'), i('pepper', 1, 'black pepper')],
  ['Heat the oven to 220 °C (425 °F).', 'Toss the potatoes and carrots with half the oil, half the salt, and the rosemary on a large baking tray. Roast 20 minutes.', 'Rub the chicken with the rest of the oil, salt, the thyme leaves, and pepper. Nestle among the vegetables and roast 25 to 30 minutes more, until the chicken reaches 74 °C (165 °F) and the potatoes are golden.']);
add('lfh-cod-chive-butter-rice', 'Baked cod with chive butter and rice', ['dinner'], 2, 10, 30, 'beginner', ['oven', 'stove'], false, 'poor', BOTH,
  [i('cod', 320, '2 cod fillets (320 g)'), i('butter', 25, '2 tbsp butter, softened'), i('chives', 8, '2 tbsp chives, snipped'), i('rice', 150, '¾ cup white rice, uncooked'), i('broccoli', 200, '200 g broccoli florets'), i('salt', 2, '½ tsp salt'), i('pepper', 1, 'black pepper')],
  ['Heat the oven to 200 °C (400 °F). Cook the rice in plenty of water until tender; drain.', 'Mix the butter with the chives and a pinch of salt.', 'Lay the cod in a baking dish, season with salt and pepper, and top with the chive butter. Bake 12 to 15 minutes until the fish flakes.', 'Steam the broccoli 4 minutes. Serve the fish over the rice with the broccoli and the melted butter spooned over.']);
add('lfh-turkey-zucchini-patties', 'Turkey and zucchini patties with cucumber salad', LD, 4, 20, 35, 'beginner', ['stove'], false, 'ok', BOTH,
  [i('turkey', 500, '500 g ground turkey'), i('zucchini', 200, '1 zucchini, grated and squeezed dry'), i('egg', 50, '1 egg'), i('riceFlour', 30, '3 tbsp white rice flour'), i('chives', 10, '3 tbsp chives, snipped'), i('cumin', 2, '1 tsp ground cumin'), i('salt', 4, '¾ tsp salt'), i('oliveOil', 20, '1½ tbsp olive oil'), i('cucumber', 300, '1 cucumber, sliced'), i('dill', 1, '1 tsp dried dill')],
  ['Mix the turkey, zucchini, egg, rice flour, chives, cumin, and salt. Shape into 8 patties.', 'Heat the oil in a wide pan over medium heat. Cook the patties 5 to 6 minutes per side until browned and cooked through (74 °C / 165 °F).', 'Toss the cucumber with the dill and a pinch of salt. Serve alongside.']);
add('lfh-quinoa-rainbow-bowl', 'Quinoa bowl with roasted pepper, cucumber, and pumpkin seeds', ['lunch'], 2, 10, 25, 'beginner', ['stove'], false, 'good', BOTH,
  [i('quinoa', 120, '⅔ cup quinoa, uncooked'), i('redPepper', 150, '1 roasted red bell pepper, sliced'), i('cucumber', 150, '½ cucumber, diced'), i('carrot', 80, '1 carrot, grated'), i('pepitas', 20, '2 tbsp pumpkin seeds'), i('basil', 6, 'a handful of fresh basil, torn'), i('oliveOil', 20, '1½ tbsp olive oil'), i('salt', 2, '½ tsp salt')],
  ['Rinse the quinoa and simmer in 1½ cups water, covered, 15 minutes. Rest 5 minutes and fluff.', 'Toss the warm quinoa with the oil and salt, then fold in the pepper, cucumber, carrot, and basil.', 'Top with the pumpkin seeds.']);
add('lfh-banana-oat-porridge', 'Banana and chia porridge', ['breakfast'], 1, 5, 10, 'beginner', ['stove'], false, 'poor', BOTH,
  [i('oats', 45, '½ cup rolled oats'), i('lfMilk', 250, '1 cup lactose-free milk'), i('banana', 100, '1 firm banana, sliced'), i('chia', 10, '2 tsp chia seeds'), i('cinnamon', 1, '¼ tsp cinnamon'), i('maple', 10, '2 tsp maple syrup')],
  ['Simmer the oats, milk, and chia in a small pan, stirring, 4 to 5 minutes until thick.', 'Stir in the cinnamon. Top with the banana and maple syrup.']);
add('lfh-blueberry-rice-flour-pancakes', 'Blueberry pancakes (rice flour and oats)', ['breakfast'], 2, 15, 20, 'beginner', ['stove'], false, 'poor', BOTH,
  [i('riceFlour', 100, '¾ cup white rice flour'), i('oats', 40, '½ cup rolled oats'), i('bakingPowder', 6, '1½ tsp baking powder'), i('egg', 50, '1 egg'), i('lfMilk', 220, '1 cup lactose-free milk'), i('maple', 20, '1 tbsp maple syrup, plus more to serve'), i('blueberries', 100, '⅔ cup blueberries'), i('canola', 10, '2 tsp canola oil for the pan'), i('salt', 1, 'pinch of salt')],
  ['Whisk the rice flour, oats, baking powder, and salt. Whisk in the egg, milk, and maple syrup to a thick batter; rest 5 minutes.', 'Heat a little oil in a nonstick pan over medium heat. Pour ¼-cup rounds, scatter blueberries on top, and cook 2 minutes until bubbles form; flip and cook 1 to 2 minutes more.', 'Serve with extra maple syrup.']);
add('lfh-chive-scrambled-eggs-rice-cakes', 'Chive scrambled eggs on rice cakes', ['breakfast'], 1, 5, 10, 'beginner', ['stove'], false, 'poor', BOTH,
  [i('egg', 100, '2 eggs'), i('chives', 5, '1 tbsp chives, snipped'), i('butter', 10, '2 tsp butter'), i('riceCakes', 18, '2 brown rice cakes'), i('salt', 1, 'pinch of salt'), i('pepper', 1, 'black pepper')],
  ['Beat the eggs with the salt and chives.', 'Melt the butter in a small pan over low heat and stir the eggs slowly until just set.', 'Pile onto the rice cakes and finish with pepper.']);
add('lfh-carrot-ginger-soup', 'Carrot and ginger soup', ['lunch'], 4, 15, 40, 'beginner', ['stove', 'blender'], false, 'good', BOTH,
  [i('carrot', 600, '6 carrots, sliced'), i('potato', 200, '1 potato, diced'), i('ginger', 20, '2 tbsp fresh ginger, chopped'), waterCup(1000, '4 cups'), i('coconutMilk', 120, '½ cup coconut milk'), i('turmeric', 2, '½ tsp turmeric'), i('oliveOil', 15, '1 tbsp olive oil'), i('salt', 4, '¾ tsp salt')],
  ['Use plain water, or a quick vegetable stock you simmered under 30 minutes without onion or garlic. Warm the oil in a pot and cook the carrot, potato, and ginger 5 minutes.', 'Add the stock, turmeric, and salt. Simmer 20 minutes until the vegetables are soft.', 'Blend smooth, stir in the coconut milk, and reheat gently.']);
add('lfh-pumpkin-coconut-soup', 'Pumpkin and coconut soup with cumin', ['lunch'], 4, 10, 30, 'beginner', ['stove', 'blender'], false, 'good', BOTH,
  [i('pumpkin', 800, '800 g pumpkin or squash, cubed (or 2 cans pumpkin purée)'), i('coconutMilk', 200, '¾ cup coconut milk'), waterCup(700, '3 cups'), i('ginger', 15, '1 tbsp fresh ginger, grated'), i('cumin', 2, '1 tsp ground cumin'), tops(20), i('oliveOil', 15, '1 tbsp olive oil'), i('salt', 4, '¾ tsp salt')],
  ['Use plain water, or a quick vegetable stock you simmered under 30 minutes without onion or garlic. Warm the oil in a pot; cook the ginger and cumin 1 minute.', 'Add the pumpkin, stock, and salt. Simmer 15 to 20 minutes until soft.', 'Blend smooth with the coconut milk. Serve with the spring onion tops on top.']);
add('lfh-beef-broccoli-stir-fry', 'Beef and broccoli stir-fry', ['dinner'], 3, 20, 35, 'comfortable', ['stove'], false, 'ok', BOTH,
  [i('beef', 400, '400 g lean beef, thinly sliced'), i('broccoli', 350, '350 g broccoli florets'), i('ginger', 15, '1 tbsp fresh ginger, grated'), gio(15), i('sesameOil', 10, '2 tsp toasted sesame oil'), i('cornstarch', 8, '1 tbsp cornstarch'), i('water', 120, '½ cup water'), i('salt', 4, '¾ tsp salt'), i('rice', 200, '1 cup white rice, uncooked')],
  ['Cook the rice. Toss the beef with the cornstarch and half the salt.', 'Heat the garlic-infused oil in a wok over high heat. Sear the beef in two batches, 2 minutes each; lift out.', 'Add the broccoli, ginger, and water. Cover and steam 3 minutes. Return the beef, add the sesame oil and remaining salt, and toss until glossy. Serve over the rice.']);
add('lfh-baked-trout-dill-potatoes', 'Baked trout with dill and buttered potatoes', ['dinner'], 2, 10, 35, 'beginner', ['oven', 'stove'], false, 'poor', BOTH,
  [i('trout', 300, '2 trout fillets (300 g)'), i('potato', 400, '400 g small potatoes, halved'), i('butter', 20, '1½ tbsp butter'), i('dill', 2, '2 tsp dried dill (or 2 tbsp fresh)'), i('chives', 6, '2 tbsp chives, snipped'), i('oliveOil', 10, '2 tsp olive oil'), i('salt', 3, '½ tsp salt')],
  ['Heat the oven to 200 °C (400 °F). Boil the potatoes 15 minutes until tender; drain and toss with the butter and chives.', 'Lay the trout on a lined tray, brush with oil, and season with dill and salt. Bake 10 to 12 minutes until it flakes.', 'Serve together.']);
add('lfh-chicken-rice-noodle-soup', 'Chicken and rice noodle soup with chard', ['lunch', 'dinner'], 4, 15, 35, 'beginner', ['stove'], false, 'ok', BOTH,
  [i('chicken', 400, '400 g chicken breast, diced'), i('riceNoodles', 300, '300 g cooked rice noodles'), i('carrot', 150, '2 carrots, thinly sliced'), i('chard', 150, '150 g chard leaves, shredded'), i('ginger', 15, '1 tbsp fresh ginger, sliced'), waterCup(1200, '5 cups'), tops(30), i('salt', 4, '¾ tsp salt')],
  ['Use plain water, or a quick vegetable stock you simmered under 30 minutes without onion or garlic. Bring the stock, ginger, and salt to a simmer. Add the chicken and carrot and simmer 8 minutes.', 'Add the chard and cook 2 minutes.', 'Divide the noodles between bowls, ladle over the soup, and top with the spring onion tops.']);
add('lfh-cinnamon-rice-pudding', 'Cinnamon rice pudding', ['snack'], 4, 5, 40, 'beginner', ['stove'], false, 'ok', BOTH,
  [i('rice', 100, '½ cup short-grain white rice'), i('lfMilk', 600, '2½ cups lactose-free milk'), i('maple', 40, '2 tbsp maple syrup'), i('cinnamon', 2, '½ tsp cinnamon'), i('cardamom', 1, '¼ tsp ground cardamom'), i('vanilla', 4, '1 tsp vanilla extract')],
  ['Simmer the rice and milk in a heavy pan, stirring often, 30 to 35 minutes until thick and creamy.', 'Stir in the maple syrup, cinnamon, cardamom, and vanilla. Serve warm or chilled.']);
add('lfh-macadamia-oat-bars', 'Macadamia and pumpkin seed oat bars', ['snack'], 8, 10, 30, 'beginner', ['oven'], false, 'good', BOTH,
  [i('oats', 180, '2 cups rolled oats'), i('macadamia', 60, '½ cup macadamia nuts, chopped'), i('pepitas', 40, '¼ cup pumpkin seeds'), i('maple', 80, '¼ cup maple syrup'), i('coconutOil', 50, '¼ cup coconut oil, melted'), i('chia', 15, '1 tbsp chia seeds'), i('cinnamon', 1, '½ tsp cinnamon'), i('salt', 1, 'pinch of salt')],
  ['Heat the oven to 180 °C (350 °F) and line a 20 cm square tin.', 'Mix everything, press firmly into the tin, and bake 20 minutes until golden at the edges.', 'Cool completely before cutting into 8 bars.']);
add('lfh-egg-fried-rice', 'Egg fried rice with carrot and spring onion tops', LD, 2, 15, 20, 'beginner', ['stove'], false, 'poor', BOTH,
  [i('rice', 150, '¾ cup white rice, cooked and cooled'), i('egg', 100, '2 eggs, beaten'), i('carrot', 100, '1 carrot, finely diced'), tops(30), i('ginger', 8, '2 tsp fresh ginger, grated'), i('canola', 15, '1 tbsp canola oil'), i('sesameOil', 5, '1 tsp toasted sesame oil'), i('salt', 3, '½ tsp salt')],
  ['Heat the canola oil in a wok. Scramble the eggs, break up, and push aside.', 'Add the carrot and ginger; stir-fry 2 minutes. Add the rice and salt and fry, tossing, 3 minutes.', 'Finish with the sesame oil and spring onion tops.']);
add('lfh-halibut-herb-quinoa', 'Pan-seared halibut with herb quinoa', ['dinner'], 2, 15, 30, 'comfortable', ['stove'], false, 'poor', BOTH,
  [i('halibut', 300, '2 halibut fillets (300 g)'), i('quinoa', 120, '⅔ cup quinoa, uncooked'), i('parsley', 10, '¼ cup parsley, chopped'), i('basil', 6, 'a handful of basil, chopped'), i('chives', 6, '2 tbsp chives, snipped'), i('oliveOil', 25, '2 tbsp olive oil'), i('salt', 3, '½ tsp salt'), i('pepper', 1, 'black pepper')],
  ['Simmer the quinoa in 1½ cups water, covered, 15 minutes; rest, then fold in the herbs and half the oil.', 'Pat the fish dry, season, and sear in the remaining oil over medium-high heat 3 to 4 minutes per side.', 'Serve on the quinoa.']);
add('lfh-rosemary-lamb-mash', 'Rosemary lamb steaks with mashed potato', ['dinner'], 2, 15, 35, 'comfortable', ['stove'], false, 'ok', BOTH,
  [i('lamb', 300, '2 lamb leg steaks (300 g)'), i('potato', 500, '500 g potatoes, peeled and cubed'), i('butter', 20, '1½ tbsp butter'), i('lfMilk', 60, '¼ cup lactose-free milk'), i('rosemary', 3, '1 sprig rosemary, chopped'), i('oliveOil', 10, '2 tsp olive oil'), i('salt', 4, '¾ tsp salt'), i('pepper', 1, 'black pepper')],
  ['Boil the potatoes 15 minutes until soft; mash with the butter, milk, and half the salt.', 'Rub the lamb with oil, rosemary, salt, and pepper. Sear in a hot pan 3 to 4 minutes per side; rest 5 minutes.', 'Serve with the mash.']);
add('lfh-melon-grape-cups', 'Melon, grape, and blueberry fruit cups', ['snack'], 2, 10, 10, 'beginner', ['none'], true, 'poor', BOTH,
  [i('cantaloupe', 150, '1 cup cantaloupe, cubed'), i('honeydew', 150, '1 cup honeydew, cubed'), i('grapes', 100, '⅔ cup grapes, halved'), i('blueberries', 80, '½ cup blueberries')],
  ['Toss the fruit together and chill briefly.']);
add('lfh-chicken-tacos-corn-tortillas', 'Cumin chicken tacos on corn tortillas', LD, 3, 20, 30, 'beginner', ['stove'], false, 'ok', BOTH,
  [i('chicken', 450, '450 g chicken breast, sliced'), i('cornTortilla', 150, '6 corn tortillas'), i('redPepper', 150, '1 red bell pepper, sliced'), i('romaine', 100, '2 cups romaine, shredded'), i('cilantro', 8, 'a handful of cilantro'), i('cumin', 3, '1½ tsp ground cumin'), i('paprika', 2, '1 tsp paprika'), i('oliveOil', 15, '1 tbsp olive oil'), i('salt', 3, '½ tsp salt')],
  ['Toss the chicken with cumin, paprika, and salt. Cook in the oil over high heat 6 to 8 minutes with the pepper until done.', 'Warm the tortillas in a dry pan.', 'Fill with chicken, romaine, and cilantro.']);
add('lfh-banana-oat-muffins', 'Banana oat muffins', ['breakfast', 'snack'], 10, 15, 35, 'beginner', ['oven'], false, 'good', BOTH,
  [i('oats', 150, '1⅔ cups rolled oats'), i('riceFlour', 100, '¾ cup white rice flour'), i('banana', 250, '2 firm bananas, mashed'), i('egg', 100, '2 eggs'), i('maple', 60, '3 tbsp maple syrup'), i('canola', 50, '¼ cup canola oil'), i('bakingPowder', 8, '2 tsp baking powder'), i('cinnamon', 2, '1 tsp cinnamon'), i('salt', 1, 'pinch of salt')],
  ['Heat the oven to 180 °C (350 °F) and line a 10-hole muffin tin.', 'Mix the dry ingredients. Whisk the banana, eggs, maple, and oil; fold together.', 'Fill the cases and bake 20 to 22 minutes until springy.']);
add('lfh-chicken-veg-skewers-rice', 'Oregano chicken and vegetable skewers with rice', ['dinner'], 3, 20, 35, 'beginner', ['oven', 'stove'], false, 'ok', BOTH,
  [i('chicken', 450, '450 g chicken breast, cubed'), i('zucchini', 200, '1 zucchini, thick slices'), i('redPepper', 150, '1 red bell pepper, chunks'), i('oregano', 2, '1 tsp dried oregano'), i('oliveOil', 25, '2 tbsp olive oil'), i('rice', 200, '1 cup white rice, uncooked'), i('salt', 4, '¾ tsp salt'), i('pepper', 1, 'black pepper')],
  ['Toss the chicken and vegetables with oil, oregano, salt, and pepper. Thread onto skewers.', 'Grill or bake at 220 °C (425 °F) 15 to 18 minutes, turning once, until the chicken reaches 74 °C (165 °F).', 'Serve over rice.']);
add('lfh-kale-potato-frittata', 'Kale and potato frittata', ['breakfast', 'lunch'], 4, 15, 35, 'beginner', ['stove', 'oven'], false, 'ok', BOTH,
  [i('egg', 400, '8 eggs'), i('potato', 300, '2 potatoes, thinly sliced'), i('kale', 100, '2 cups kale, shredded'), i('chives', 8, '3 tbsp chives, snipped'), i('mozzarella', 80, '80 g fresh mozzarella, torn'), i('oliveOil', 20, '1½ tbsp olive oil'), i('salt', 4, '¾ tsp salt'), i('pepper', 1, 'black pepper')],
  ['Cook the potato slices in the oil in an ovenproof pan over medium heat, covered, 10 minutes until tender. Add the kale and cook 2 minutes.', 'Beat the eggs with chives, salt, and pepper; pour over. Scatter the mozzarella.', 'Cook 5 minutes on the stove, then finish under a hot grill or in a 200 °C oven 8 to 10 minutes until set.']);
add('lfh-turkey-rice-soup', 'Turkey, carrot, and rice soup', ['lunch'], 4, 15, 40, 'beginner', ['stove'], false, 'ok', BOTH,
  [i('turkey', 400, '400 g ground turkey'), i('rice', 100, '½ cup white rice'), i('carrot', 200, '3 carrots, diced'), i('zucchini', 150, '1 zucchini, diced'), waterCup(1200, '5 cups'), i('thyme', 2, '2 sprigs thyme'), i('bay', 1, '1 bay leaf'), i('oliveOil', 15, '1 tbsp olive oil'), i('salt', 4, '¾ tsp salt')],
  ['Use plain water, or a quick vegetable stock you simmered under 30 minutes without onion or garlic. Brown the turkey in the oil, breaking it up.', 'Add the carrot, stock, rice, thyme, bay, and salt. Simmer 20 minutes.', 'Add the zucchini and cook 5 minutes more. Remove the bay leaf.']);
add('lfh-coconut-chia-pudding', 'Coconut chia pudding with blueberries', ['breakfast', 'snack'], 2, 5, 5, 'beginner', ['none'], true, 'ok', BOTH,
  [i('chia', 40, '¼ cup chia seeds'), i('coconutMilk', 250, '1 cup coconut milk'), i('maple', 20, '1 tbsp maple syrup'), i('vanilla', 2, '½ tsp vanilla extract'), i('blueberries', 100, '⅔ cup blueberries')],
  ['Stir the chia, coconut milk, maple, and vanilla. Refrigerate at least 2 hours or overnight.', 'Top with blueberries.']);
add('lfh-baked-cod-carrots-rice', 'Baked cod with glazed carrots and parsley rice', ['dinner'], 2, 10, 35, 'beginner', ['oven', 'stove'], false, 'poor', BOTH,
  [i('cod', 320, '2 cod fillets (320 g)'), i('carrot', 250, '3 carrots, sliced'), i('rice', 150, '¾ cup white rice, uncooked'), i('butter', 20, '1½ tbsp butter'), i('maple', 10, '2 tsp maple syrup'), i('parsley', 8, '3 tbsp parsley, chopped'), i('salt', 3, '½ tsp salt')],
  ['Cook the rice; fold in half the butter and the parsley.', 'Simmer the carrots in a little water with the rest of the butter and the maple syrup until tender and glazed, about 10 minutes.', 'Bake the cod, seasoned with salt, at 200 °C (400 °F) 12 to 15 minutes. Serve together.']);

// ---------------------------------------------------------------- written for low FODMAP only
add('lf-tomato-basil-gf-pasta', 'Tomato and basil gluten-free pasta with parmesan', ['dinner'], 2, 10, 25, 'beginner', ['stove'], false, 'ok', LF,
  [i('gfPasta', 160, '160 g gluten-free corn and rice pasta'), i('tomato', 400, '4 ripe tomatoes, chopped'), i('basil', 10, 'a big handful of basil'), gio(20), i('parmesan', 30, '¼ cup parmesan, grated'), i('salt', 3, '½ tsp salt'), i('pepper', 1, 'black pepper')],
  ['Cook the pasta a minute less than the packet says; drain, keeping a splash of water.', 'Warm the garlic-infused oil, add the tomatoes and salt, and cook 8 minutes to a loose sauce.', 'Toss with the pasta, basil, and parmesan, loosening with the pasta water.']);
add('lf-spinach-feta-omelette', 'Spinach and feta omelette', ['breakfast', 'lunch'], 1, 10, 10, 'beginner', ['stove'], false, 'poor', LF,
  [i('egg', 100, '2 eggs'), i('spinach', 60, '2 handfuls baby spinach'), i('feta', 30, '30 g feta, crumbled'), i('oliveOil', 10, '2 tsp olive oil'), i('chives', 4, '1 tbsp chives'), i('pepper', 1, 'black pepper')],
  ['Wilt the spinach in the oil; push to one side.', 'Pour in the beaten eggs, cook until nearly set, scatter feta and chives, fold, and serve.']);
add('lf-tuna-rice-salad', 'Tuna and rice salad with lemon', ['lunch'], 2, 15, 15, 'beginner', ['none'], true, 'good', LF,
  [i('tuna', 150, '1 can tuna in water, drained'), i('rice', 150, '2 cups cooked white rice, cooled'), i('cucumber', 150, '½ cucumber, diced'), i('redPepper', 100, '1 roasted red pepper, diced'), i('lemonJuice', 20, '1½ tbsp lemon juice'), i('oliveOil', 20, '1½ tbsp olive oil'), i('chives', 6, '2 tbsp chives'), i('salt', 2, '¼ tsp salt')],
  ['Flake the tuna into the rice. Add the cucumber, pepper, and chives.', 'Dress with lemon, oil, and salt.']);
add('lf-lemon-herb-baked-chicken', 'Lemon and oregano baked chicken with potatoes', ['dinner'], 4, 15, 55, 'beginner', ['oven'], false, 'ok', LF,
  [i('chicken', 600, '600 g chicken thighs'), i('potato', 700, '700 g potatoes, wedges'), i('lemonJuice', 40, 'juice of 1 lemon'), i('oregano', 3, '1½ tsp dried oregano'), i('thyme', 3, '3 sprigs thyme'), i('oliveOil', 30, '2 tbsp olive oil'), i('salt', 5, '1 tsp salt'), i('pepper', 1, 'black pepper')],
  ['Toss everything together in a roasting tin.', 'Roast at 200 °C (400 °F) 45 to 50 minutes, turning once, until the chicken is cooked through and the potatoes are crisp.']);
add('lf-greek-salad-feta', 'Greek-style salad with feta', ['lunch'], 2, 10, 10, 'beginner', ['none'], true, 'poor', LF,
  [i('cucumber', 250, '1 cucumber, chunks'), i('tomato', 250, '2 tomatoes, wedges'), i('redPepper', 100, '1 roasted red pepper, sliced'), i('feta', 60, '60 g feta, cubed'), i('oliveOil', 25, '2 tbsp olive oil'), i('lemonJuice', 15, '1 tbsp lemon juice'), i('oregano', 1, '½ tsp dried oregano'), i('salt', 1, 'pinch of salt')],
  ['Toss the vegetables with oil, lemon, oregano, and salt.', 'Top with the feta.']);
add('lf-shrimp-rice-noodle-stir-fry', 'Shrimp and rice noodle stir-fry', ['dinner'], 2, 20, 25, 'comfortable', ['stove'], false, 'poor', LF,
  [i('shrimp', 250, '250 g shrimp, peeled'), i('riceNoodles', 250, '250 g cooked rice noodles'), i('redPepper', 150, '1 red bell pepper, sliced'), i('ginger', 12, '1 tbsp fresh ginger, grated'), tops(30), gio(15), i('sesameOil', 8, '1½ tsp toasted sesame oil'), i('lemonJuice', 15, '1 tbsp lemon juice'), i('salt', 3, '½ tsp salt')],
  ['Stir-fry the pepper and ginger in the garlic-infused oil 2 minutes.', 'Add the shrimp and salt; cook 3 minutes until pink.', 'Add the noodles, sesame oil, lemon, and spring onion tops; toss to heat through.']);
add('lf-peanut-butter-banana-oats', 'Peanut butter and banana overnight oats', ['breakfast'], 1, 5, 5, 'beginner', ['none'], true, 'good', LF,
  [i('oats', 45, '½ cup rolled oats'), i('lfMilk', 200, '¾ cup lactose-free milk'), i('peanutButter', 16, '1 tbsp peanut butter'), i('banana', 100, '1 firm banana, sliced'), i('chia', 8, '1½ tsp chia seeds'), i('maple', 7, '1 tsp maple syrup')],
  ['Stir the oats, milk, peanut butter, chia, and maple in a jar. Chill overnight.', 'Top with banana.']);
add('lf-strawberry-yogurt-parfait', 'Strawberry and lactose-free yogurt parfait', ['breakfast', 'snack'], 1, 5, 5, 'beginner', ['none'], true, 'poor', LF,
  [i('lfYogurt', 170, '¾ cup lactose-free plain yogurt'), i('strawberries', 120, '¾ cup strawberries, sliced'), i('oats', 30, '⅓ cup rolled oats, toasted'), i('maple', 10, '2 tsp maple syrup')],
  ['Layer yogurt, strawberries, and oats. Drizzle with maple.']);
add('lf-cheddar-potato-bake', 'Cheddar and chive potato bake', ['dinner'], 4, 15, 60, 'beginner', ['oven', 'stove'], false, 'good', LF,
  [i('potato', 900, '900 g potatoes, thinly sliced'), i('cheddar', 120, '1 cup cheddar, grated'), i('lfMilk', 300, '1¼ cups lactose-free milk'), i('butter', 20, '1½ tbsp butter'), i('chives', 10, '3 tbsp chives'), i('nutmeg', 1, 'pinch of nutmeg'), i('salt', 4, '¾ tsp salt'), i('pepper', 1, 'black pepper')],
  ['Layer the potatoes in a buttered dish with salt, pepper, chives, and most of the cheese.', 'Warm the milk with the nutmeg and pour over. Top with the rest of the cheese.', 'Bake at 190 °C (375 °F) 45 to 50 minutes until tender and golden.']);
add('lf-orange-ginger-chicken-bowl', 'Orange and ginger chicken rice bowl', ['dinner'], 2, 20, 30, 'beginner', ['stove'], false, 'ok', LF,
  [i('chicken', 300, '300 g chicken breast, sliced'), i('orange', 150, '1 orange, segments and juice'), i('ginger', 12, '1 tbsp fresh ginger, grated'), i('carrot', 120, '2 carrots, sliced'), i('rice', 150, '¾ cup white rice, uncooked'), i('sesame', 8, '1 tbsp sesame seeds'), i('canola', 15, '1 tbsp canola oil'), i('salt', 3, '½ tsp salt')],
  ['Cook the rice. Brown the chicken in the oil with the salt; add the carrot and ginger and cook 4 minutes.', 'Add the orange segments and juice; bubble 2 minutes.', 'Serve over rice with sesame seeds.']);
add('lf-carrot-walnut-muffins', 'Carrot and walnut muffins', ['breakfast', 'snack'], 10, 15, 35, 'beginner', ['oven'], false, 'good', LF,
  [i('riceFlour', 150, '1 cup white rice flour'), i('oats', 80, '¾ cup rolled oats'), i('carrot', 200, '2 carrots, grated'), i('walnuts', 50, '½ cup walnuts, chopped'), i('egg', 100, '2 eggs'), i('maple', 80, '¼ cup maple syrup'), i('canola', 60, '¼ cup canola oil'), i('bakingPowder', 8, '2 tsp baking powder'), i('cinnamon', 3, '1½ tsp cinnamon'), i('salt', 1, 'pinch of salt')],
  ['Mix the dry ingredients. Whisk the eggs, maple, and oil; fold in with the carrot and walnuts.', 'Bake in a lined tin at 180 °C (350 °F) 20 to 22 minutes.']);
add('lf-mustard-maple-salmon', 'Mustard and maple salmon with kale and potatoes', ['dinner'], 2, 10, 30, 'beginner', ['oven', 'stove'], false, 'poor', LF,
  [i('salmon', 300, '2 salmon fillets (300 g)'), i('mustard', 15, '1 tbsp mustard'), i('maple', 15, '1 tbsp maple syrup'), i('potato', 400, '400 g potatoes, halved'), i('kale', 120, '3 cups kale, shredded'), i('oliveOil', 15, '1 tbsp olive oil'), i('salt', 3, '½ tsp salt')],
  ['Boil the potatoes 15 minutes. Brush the salmon with the mustard and maple and bake at 200 °C (400 °F) 12 minutes.', 'Sauté the kale in the oil with salt 3 minutes. Serve together.']);
add('lf-pineapple-chicken-skewers', 'Pineapple and ginger chicken skewers', ['dinner'], 3, 20, 35, 'beginner', ['oven'], false, 'ok', LF,
  [i('chicken', 450, '450 g chicken breast, cubed'), i('pineapple', 200, '1½ cups fresh pineapple, chunks'), i('redPepper', 150, '1 red bell pepper, chunks'), i('ginger', 10, '2 tsp fresh ginger, grated'), i('sesameOil', 10, '2 tsp toasted sesame oil'), i('canola', 10, '2 tsp canola oil'), i('rice', 200, '1 cup white rice, uncooked'), i('salt', 4, '¾ tsp salt')],
  ['Toss the chicken with ginger, oils, and salt. Thread with pineapple and pepper.', 'Bake at 220 °C (425 °F) 15 to 18 minutes, turning once. Serve over rice.']);
add('lf-caprese-gf-pasta-salad', 'Caprese gluten-free pasta salad', ['lunch'], 3, 15, 25, 'beginner', ['stove'], false, 'good', LF,
  [i('gfPasta', 200, '200 g gluten-free corn and rice pasta'), i('tomato', 300, '2 cups cherry tomatoes, halved'), i('mozzarella', 125, '125 g fresh mozzarella, torn'), i('basil', 10, 'a big handful of basil'), i('oliveOil', 30, '2 tbsp olive oil'), i('salt', 3, '½ tsp salt'), i('pepper', 1, 'black pepper')],
  ['Cook the pasta, drain, and cool under running water.', 'Toss with tomatoes, mozzarella, basil, oil, salt, and pepper.']);
add('lf-raspberry-chia-jam-rice-cakes', 'Raspberry chia jam on rice cakes with peanut butter', ['snack'], 4, 10, 25, 'beginner', ['stove'], false, 'good', LF,
  [i('raspberries', 200, '1½ cups raspberries'), i('chia', 20, '2 tbsp chia seeds'), i('maple', 20, '1 tbsp maple syrup'), i('riceCakes', 36, '4 brown rice cakes'), i('peanutButter', 32, '2 tbsp peanut butter')],
  ['Simmer the raspberries 5 minutes, mash, stir in the chia and maple, and cool 15 minutes to set.', 'Spread the rice cakes with peanut butter and top with the jam.']);
add('lf-tomato-rice-soup', 'Tomato and rice soup with basil', ['lunch'], 4, 10, 35, 'beginner', ['stove', 'blender'], false, 'good', LF,
  [i('tomato', 800, '800 g ripe tomatoes, chopped'), i('rice', 80, '⅓ cup white rice'), stockCup(800, '3½ cups'), gio(20), i('basil', 10, 'a handful of basil'), i('parmesan', 30, '¼ cup parmesan, grated'), i('salt', 4, '¾ tsp salt')],
  ['Cook the tomatoes in the garlic-infused oil with salt 10 minutes. Add the stock and rice; simmer 20 minutes.', 'Blend half for body, stir back, and serve with basil and parmesan.']);
add('lf-spinach-egg-breakfast-wrap', 'Spinach and cheddar egg wrap', ['breakfast'], 1, 10, 10, 'beginner', ['stove'], false, 'poor', LF,
  [i('cornTortilla', 50, '2 corn tortillas'), i('egg', 100, '2 eggs'), i('spinach', 50, 'a handful of baby spinach'), i('cheddar', 25, '¼ cup cheddar, grated'), i('oliveOil', 5, '1 tsp olive oil'), i('salt', 1, 'pinch of salt')],
  ['Scramble the eggs with the spinach in the oil; season.', 'Warm the tortillas, fill with eggs and cheddar, and roll.']);
add('lf-parmesan-polenta-roasted-veg', 'Parmesan polenta with roasted zucchini, pepper, and tomato', ['dinner'], 3, 15, 40, 'comfortable', ['oven', 'stove'], false, 'ok', LF,
  [i('cornmeal', 150, '1 cup cornmeal (polenta)'), i('water', 800, '3½ cups water'), i('parmesan', 40, '⅓ cup parmesan, grated'), i('butter', 20, '1½ tbsp butter'), i('zucchini', 250, '1 large zucchini, chunks'), i('redPepper', 150, '1 red bell pepper, chunks'), i('tomato', 250, '2 tomatoes, wedges'), i('oliveOil', 20, '1½ tbsp olive oil'), i('oregano', 2, '1 tsp dried oregano'), i('salt', 5, '1 tsp salt')],
  ['Roast the vegetables with oil, oregano, and half the salt at 220 °C (425 °F) 25 minutes.', 'Whisk the cornmeal into simmering salted water and cook, stirring, 20 minutes. Beat in butter and parmesan.', 'Serve the vegetables over the polenta.']);

// ---------------------------------------------------------------- written for low histamine only (fresh food, no leftovers)
add('lh-apple-cinnamon-oats', 'Apple and cinnamon porridge with honey', ['breakfast'], 1, 5, 12, 'beginner', ['stove'], false, 'poor', LH,
  [i('oats', 45, '½ cup rolled oats'), i('milk', 250, '1 cup milk'), i('apple', 120, '1 apple, grated'), i('cinnamon', 1, '½ tsp cinnamon'), i('honey', 10, '2 tsp honey')],
  ['Simmer the oats, milk, and apple 5 minutes, stirring.', 'Finish with cinnamon and honey.']);
add('lh-lentil-carrot-soup', 'Red lentil and carrot soup', ['lunch'], 4, 10, 35, 'beginner', ['stove', 'blender'], false, 'poor', LH,
  [i('lentils', 400, '2 cups cooked lentils (from 1 cup dry)'), i('carrot', 300, '4 carrots, sliced'), i('celery', 100, '2 celery sticks, sliced'), i('garlic', 6, '2 garlic cloves, chopped'), stockCup(1000, '4 cups'), i('cumin', 2, '1 tsp ground cumin'), i('oliveOil', 15, '1 tbsp olive oil'), i('salt', 4, '¾ tsp salt')],
  ['Soften the carrot, celery, and garlic in the oil 5 minutes. Add cumin, lentils, stock, and salt; simmer 15 minutes.', 'Blend partly. Eat fresh; do not store.']);
add('lh-chicken-sweet-potato-traybake', 'Chicken and sweet potato traybake with rosemary', ['dinner'], 4, 15, 50, 'beginner', ['oven'], false, 'poor', LH,
  [i('chicken', 600, '600 g chicken thighs'), i('sweetPotato', 600, '600 g sweet potato, chunks'), i('redPepper', 150, '1 red bell pepper, chunks'), i('garlic', 9, '3 garlic cloves, smashed'), i('rosemary', 4, '2 sprigs rosemary'), i('oliveOil', 30, '2 tbsp olive oil'), i('salt', 5, '1 tsp salt'), i('pepper', 1, 'black pepper')],
  ['Toss everything in a roasting tin.', 'Roast at 200 °C (400 °F) 40 to 45 minutes, turning once.']);
add('lh-pear-ricotta-toast', 'Pear and ricotta toast with honey', ['breakfast'], 1, 5, 5, 'beginner', ['none'], true, 'poor', LH,
  [i('wwBread', 60, '2 slices whole-wheat bread, toasted'), i('ricotta', 80, '⅓ cup ricotta'), i('pear', 120, '1 pear, sliced'), i('honey', 10, '2 tsp honey'), i('cinnamon', 1, 'pinch of cinnamon')],
  ['Spread the toast with ricotta, top with pear, and finish with honey and cinnamon.']);
add('lh-garlic-herb-pasta-peas', 'Garlic and herb pasta with peas and mozzarella', ['dinner'], 3, 10, 25, 'beginner', ['stove'], false, 'poor', LH,
  [i('pasta', 240, '240 g pasta'), i('peas', 150, '1 cup peas'), i('garlic', 9, '3 garlic cloves, sliced'), i('oliveOil', 30, '2 tbsp olive oil'), i('parsley', 12, '⅓ cup parsley, chopped'), i('mozzarella', 100, '100 g fresh mozzarella, torn'), i('salt', 4, '¾ tsp salt'), i('pepper', 1, 'black pepper')],
  ['Cook the pasta, adding the peas for the last 2 minutes; drain, keeping a little water.', 'Warm the garlic in the oil until fragrant. Toss with pasta, peas, parsley, salt, and pepper; top with mozzarella.']);
add('lh-cauliflower-chickpea-coconut-curry', 'Mild cauliflower and chickpea coconut curry', ['dinner'], 4, 15, 35, 'beginner', ['stove'], false, 'poor', LH,
  [i('cauliflower', 500, '1 cauliflower, florets'), i('chickpeas', 400, '1 can chickpeas, drained'), i('coconutMilk', 400, '1 can coconut milk'), i('garlic', 9, '3 garlic cloves, chopped'), i('ginger', 15, '1 tbsp fresh ginger, grated'), i('turmeric', 3, '1 tsp turmeric'), i('cumin', 3, '1½ tsp ground cumin'), i('coriander', 2, '1 tsp ground coriander'), i('cilantro', 8, 'a handful of cilantro'), i('oliveOil', 15, '1 tbsp olive oil'), i('salt', 5, '1 tsp salt'), i('rice', 200, '1 cup white rice, uncooked')],
  ['Cook the rice. Fry the garlic, ginger, and spices in the oil 1 minute.', 'Add the cauliflower, chickpeas, coconut milk, and salt. Simmer 15 minutes until tender.', 'Serve over rice with cilantro.']);
add('lh-beef-green-bean-stir-fry', 'Beef and green bean stir-fry', ['dinner'], 3, 20, 30, 'comfortable', ['stove'], false, 'poor', LH,
  [i('beef', 400, '400 g lean beef, thinly sliced'), i('greenBeans', 300, '300 g green beans, trimmed'), i('garlic', 6, '2 garlic cloves, sliced'), i('ginger', 12, '1 tbsp fresh ginger, grated'), i('cornstarch', 8, '1 tbsp cornstarch'), i('water', 120, '½ cup water'), i('sesameOil', 10, '2 tsp toasted sesame oil'), i('canola', 15, '1 tbsp canola oil'), i('salt', 4, '¾ tsp salt'), i('rice', 200, '1 cup white rice, uncooked')],
  ['Cook the rice. Toss the beef with cornstarch and half the salt.', 'Sear the beef in the canola oil in batches; lift out. Stir-fry the beans, garlic, and ginger 2 minutes; add the water, cover 3 minutes.', 'Return the beef with the sesame oil and remaining salt. Serve over rice.']);
add('lh-roast-beet-apple-salad', 'Roast beet and apple salad with pumpkin seeds', ['lunch'], 2, 15, 50, 'beginner', ['oven'], false, 'poor', LH,
  [i('beets', 300, '3 beets, scrubbed and cubed'), i('apple', 150, '1 apple, sliced'), i('romaine', 120, '3 cups romaine, torn'), i('pepitas', 20, '2 tbsp pumpkin seeds'), i('oliveOil', 25, '2 tbsp olive oil'), i('honey', 7, '1 tsp honey'), i('salt', 2, '¼ tsp salt')],
  ['Roast the beets with half the oil at 200 °C (400 °F) 35 minutes.', 'Whisk the remaining oil with honey and salt. Toss with romaine, apple, beets, and seeds.']);
add('lh-black-bean-rice-bowl', 'Black bean and rice bowl with cumin and cilantro', LD, 2, 10, 25, 'beginner', ['stove'], false, 'poor', LH,
  [i('blackBeans', 250, '1 can black beans, drained'), i('rice', 150, '¾ cup white rice, uncooked'), i('redPepper', 150, '1 red bell pepper, diced'), i('romaine', 80, '2 cups romaine, shredded'), i('cilantro', 8, 'a handful of cilantro'), i('cumin', 3, '1½ tsp ground cumin'), i('garlic', 3, '1 garlic clove, minced'), i('oliveOil', 15, '1 tbsp olive oil'), i('salt', 3, '½ tsp salt')],
  ['Cook the rice. Warm the beans with garlic, cumin, oil, and salt 5 minutes.', 'Build bowls: rice, beans, pepper, romaine, cilantro.']);
add('lh-watermelon-cucumber-salad', 'Watermelon and cucumber salad with basil', ['lunch', 'snack'], 2, 10, 10, 'beginner', ['none'], true, 'poor', LH,
  [i('watermelon', 300, '2 cups watermelon, cubed'), i('cucumber', 200, '1 cucumber, sliced'), i('basil', 6, 'a handful of basil'), i('oliveOil', 10, '2 tsp olive oil'), i('salt', 1, 'pinch of salt')],
  ['Toss and serve straight away.']);
add('lh-honey-garlic-chicken-broccoli', 'Honey garlic chicken with broccoli and rice', ['dinner'], 3, 15, 30, 'beginner', ['stove'], false, 'poor', LH,
  [i('chicken', 450, '450 g chicken thighs, cubed'), i('honey', 30, '1½ tbsp honey'), i('garlic', 9, '3 garlic cloves, minced'), i('broccoli', 300, '300 g broccoli florets'), i('ginger', 8, '2 tsp fresh ginger'), i('canola', 15, '1 tbsp canola oil'), i('water', 60, '¼ cup water'), i('salt', 4, '¾ tsp salt'), i('rice', 200, '1 cup white rice, uncooked')],
  ['Cook the rice. Brown the chicken in the oil with the salt 6 minutes.', 'Add garlic, ginger, honey, and water; bubble 2 minutes. Add broccoli, cover, and steam 4 minutes. Serve over rice.']);
add('lh-celery-potato-soup', 'Celery and potato soup', ['lunch'], 4, 10, 35, 'beginner', ['stove', 'blender'], false, 'poor', LH,
  [i('celery', 300, '6 celery sticks, sliced'), i('potato', 400, '2 potatoes, diced'), i('garlic', 6, '2 garlic cloves'), stockCup(900, '4 cups'), i('milk', 150, '⅔ cup milk'), i('thyme', 2, '2 sprigs thyme'), i('oliveOil', 15, '1 tbsp olive oil'), i('salt', 4, '¾ tsp salt')],
  ['Soften the celery and garlic in the oil 5 minutes. Add potato, stock, thyme, and salt; simmer 20 minutes.', 'Blend smooth with the milk. Eat fresh.']);
add('lh-ricotta-pancakes-blueberries', 'Ricotta pancakes with blueberries', ['breakfast'], 2, 15, 20, 'beginner', ['stove'], false, 'poor', LH,
  [i('wheatFlour', 120, '1 cup plain flour'), i('ricotta', 150, '⅔ cup ricotta'), i('egg', 100, '2 eggs'), i('milk', 150, '⅔ cup milk'), i('bakingPowder', 6, '1½ tsp baking powder'), i('honey', 20, '1 tbsp honey'), i('blueberries', 100, '⅔ cup blueberries'), i('butter', 10, '2 tsp butter for the pan'), i('salt', 1, 'pinch of salt')],
  ['Whisk the ricotta, eggs, milk, and honey; fold in the flour, baking powder, and salt.', 'Cook ¼-cup rounds in butter 2 minutes per side. Serve with blueberries.']);
add('lh-pear-oat-crumble', 'Pear and oat crumble', ['snack'], 6, 15, 45, 'beginner', ['oven'], false, 'poor', LH,
  [i('pear', 700, '5 pears, sliced'), i('oats', 100, '1 cup rolled oats'), i('wheatFlour', 80, '⅔ cup plain flour'), i('butter', 80, '⅓ cup butter, cold and cubed'), i('brownSugar', 60, '⅓ cup brown sugar'), i('cinnamon', 2, '1 tsp cinnamon')],
  ['Put the pears in a baking dish with half the cinnamon.', 'Rub the butter into the flour, oats, sugar, and remaining cinnamon; scatter over.', 'Bake at 180 °C (350 °F) 30 to 35 minutes.']);
add('lh-turkey-meatballs-pumpkin-sauce', 'Turkey meatballs in pumpkin sauce with pasta', ['dinner'], 4, 25, 45, 'comfortable', ['stove'], false, 'poor', LH,
  [i('turkey', 500, '500 g ground turkey'), i('egg', 50, '1 egg'), i('oats', 40, '½ cup rolled oats'), i('garlic', 9, '3 garlic cloves, minced'), i('pumpkin', 400, '1 can pumpkin purée'), stockCup(250, '1 cup'), i('paprika', 3, '1½ tsp paprika'), i('oregano', 2, '1 tsp dried oregano'), i('oliveOil', 20, '1½ tbsp olive oil'), i('pasta', 320, '320 g pasta'), i('salt', 5, '1 tsp salt')],
  ['Mix the turkey, egg, oats, a third of the garlic, half the salt, and the oregano; roll into 16 meatballs. Brown in the oil.', 'Add the rest of the garlic, pumpkin, stock, paprika, and salt; simmer 15 minutes.', 'Serve over cooked pasta.']);
add('lh-cod-garlic-butter-green-beans', 'Cod with garlic butter, green beans, and potatoes', ['dinner'], 2, 10, 30, 'beginner', ['oven', 'stove'], false, 'poor', LH,
  [i('cod', 320, '2 cod fillets (320 g)'), i('butter', 25, '2 tbsp butter'), i('garlic', 6, '2 garlic cloves, minced'), i('greenBeans', 250, '250 g green beans'), i('potato', 400, '400 g potatoes, halved'), i('parsley', 6, '2 tbsp parsley'), i('salt', 3, '½ tsp salt')],
  ['Boil the potatoes 15 minutes, adding the beans for the last 4.', 'Bake the cod with salt at 200 °C (400 °F) 12 minutes. Melt the butter with the garlic and parsley and spoon over everything.']);
add('lh-chicken-vegetable-pasta-bake', 'Chicken, zucchini, and mozzarella pasta bake', ['dinner'], 4, 20, 50, 'comfortable', ['stove', 'oven'], false, 'poor', LH,
  [i('pasta', 300, '300 g pasta'), i('chicken', 400, '400 g chicken breast, diced'), i('zucchini', 250, '1 large zucchini, diced'), i('redPepper', 150, '1 red bell pepper, diced'), i('mozzarella', 150, '150 g fresh mozzarella, torn'), i('garlic', 6, '2 garlic cloves, minced'), i('oliveOil', 25, '2 tbsp olive oil'), i('oregano', 2, '1 tsp dried oregano'), stockCup(200, '¾ cup'), i('salt', 5, '1 tsp salt')],
  ['Cook the pasta 2 minutes short. Brown the chicken in the oil; add garlic, zucchini, pepper, oregano, salt, and stock; cook 5 minutes.', 'Toss with the pasta in a baking dish, top with mozzarella, and bake at 200 °C (400 °F) 20 minutes.']);
add('lh-sweet-potato-kale-hash-eggs', 'Sweet potato and kale hash with fried eggs', ['breakfast', 'lunch'], 2, 15, 30, 'beginner', ['stove'], false, 'poor', LH,
  [i('sweetPotato', 400, '2 sweet potatoes, diced'), i('kale', 100, '2 cups kale, shredded'), i('egg', 100, '2 eggs'), i('garlic', 6, '2 garlic cloves, minced'), i('paprika', 2, '1 tsp paprika'), i('oliveOil', 25, '2 tbsp olive oil'), i('salt', 3, '½ tsp salt')],
  ['Fry the sweet potato in most of the oil, covered, 12 minutes, turning. Add garlic, paprika, salt, and kale; cook 3 minutes.', 'Fry the eggs in the last of the oil and serve on top.']);
add('lh-apple-carrot-muffins', 'Apple and carrot muffins', ['breakfast', 'snack'], 10, 15, 35, 'beginner', ['oven'], false, 'poor', LH,
  [i('wheatFlour', 220, '1¾ cups plain flour'), i('apple', 150, '1 apple, grated'), i('carrot', 150, '1 large carrot, grated'), i('egg', 100, '2 eggs'), i('honey', 80, '¼ cup honey'), i('canola', 60, '¼ cup canola oil'), i('bakingPowder', 8, '2 tsp baking powder'), i('cinnamon', 3, '1½ tsp cinnamon'), i('salt', 1, 'pinch of salt')],
  ['Mix the dry ingredients. Whisk eggs, honey, and oil; fold in with apple and carrot.', 'Bake in a lined tin at 180 °C (350 °F) 20 to 22 minutes.']);

// ---------------------------------------------------------------- verify and write
const conditions = J('conditions.json').modules, dictionaries = J('dictionaries.json');
const matcher = buildMatcher(dictionaries);
matcher.dietLists = J('diet-lists.json');
const person = mods => ({ id: 'x', name: 'x', adult: true, age: 50, modules: mods, allergens: [], preferences: { avoid_tags: [], avoid_terms: [] }, medications: {}, tier2: {}, phases: {}, modes: {}, acknowledged: [], flags: {}, variants: {} });
const plans = { 'low-fodmap': buildPlan({ person: person(['ibs-low-fodmap']), conditions, dictionaries, today: new Date() }), 'low-histamine': buildPlan({ person: person(['mcas']), conditions, dictionaries, today: new Date() }) };
let bad = 0;
for (const r of R) for (const fam of r.diet_written_for) {
  const c = checkRecipe(r, plans[fam], matcher, foodsById, {});
  if (c.verdict !== 'pass') { bad++; console.log(`FAIL ${r.id} for ${fam}: ${c.hits.map(h => h.label + ' <- ' + h.terms.join('/')).join('; ')}${c.unrecognized.length ? ' unrec: ' + c.unrecognized.join(', ') : ''}${c.notApproved && c.notApproved.length ? ' not approved: ' + c.notApproved.map(n => n.label).join(' | ') : ''}`); }
}
const ids = new Set(R.map(r => r.id)); if (ids.size !== R.length) throw new Error('duplicate ids');
const existing = J('recipes.json').filter(r => !/^(lf|lh|lfh)-/.test(r.id));
fs.writeFileSync(OUT, JSON.stringify(existing.concat(R), null, 2) + '\n');
console.log(`wrote ${R.length} diet recipes (${R.filter(r => r.diet_written_for.length === 2).length} for both, ${R.filter(r => r.diet_written_for.join() === 'low-fodmap').length} low FODMAP only, ${R.filter(r => r.diet_written_for.join() === 'low-histamine').length} low histamine only); ${bad} failed their own diet check; recipes.json now ${existing.length + R.length}`);
