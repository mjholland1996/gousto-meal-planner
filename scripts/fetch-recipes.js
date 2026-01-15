/**
 * Script to fetch recipe data from Gousto's API
 *
 * Usage:
 *   node scripts/fetch-recipes.js [--limit N] [--details]
 *
 * Options:
 *   --limit N    Only fetch N recipes (for testing)
 *   --details    Also fetch full recipe details (ingredients, method)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const API_BASE = 'https://production-api.gousto.co.uk/cmsreadbroker/v1';
const DATA_DIR = path.join(__dirname, '..', 'data');
const RECIPES_FILE = path.join(DATA_DIR, 'recipes.json');
const DETAILS_DIR = path.join(DATA_DIR, 'details');

// Rate limiting: delay between requests (ms)
const DELAY_BETWEEN_REQUESTS = 500;

function sleep(ms) {
  execSync(`sleep ${ms / 1000}`);
}

function fetchJsonSync(url, retries = 5) {
  const cmd = `curl -s "${url}" -H "User-Agent: Mozilla/5.0" -H "Accept: application/json"`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const result = execSync(cmd, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });

    try {
      return JSON.parse(result);
    } catch {
      console.log(`Attempt ${attempt}/${retries} failed (got HTML/error response), waiting ${attempt * 2}s...`);
      if (attempt < retries) {
        sleep(attempt * 2000);
      }
    }
  }

  throw new Error(`Failed to fetch ${url} after ${retries} retries`);
}

function extractSlug(url) {
  const parts = url.split('/').filter(Boolean);
  return parts[parts.length - 1];
}

function fetchAllRecipeSummaries(limit) {
  const recipes = [];
  let offset = 0;
  const pageSize = 20;
  let totalCount = Infinity;

  console.log('Fetching recipe summaries...');

  while (offset < totalCount && (!limit || recipes.length < limit)) {
    const url = `${API_BASE}/recipes?category=recipes&limit=${pageSize}&offset=${offset}`;
    console.log(`Fetching page ${Math.floor(offset / pageSize) + 1}... (${recipes.length} recipes so far)`);

    try {
      const json = fetchJsonSync(url);

      totalCount = json.data?.count ?? totalCount;
      const entries = json.data?.entries ?? [];

      for (const recipe of entries) {
        if (limit && recipes.length >= limit) break;

        // Find the best image (around 700px wide)
        const image = recipe.media?.images
          ?.sort((a, b) => Math.abs(a.width - 700) - Math.abs(b.width - 700))[0]
          ?.image ?? '';

        recipes.push({
          uid: recipe.uid,
          title: recipe.title,
          slug: extractSlug(recipe.url),
          rating: {
            average: recipe.rating?.average ?? 0,
            count: recipe.rating?.count ?? 0,
          },
          prepTimes: {
            for2: recipe.prep_times?.for_2 ?? 0,
            for4: recipe.prep_times?.for_4 ?? 0,
          },
          image,
        });
      }

      offset += pageSize;
      sleep(DELAY_BETWEEN_REQUESTS);
    } catch (error) {
      console.error(`Error fetching page at offset ${offset}:`, error.message);
      break;
    }
  }

  console.log(`Fetched ${recipes.length} recipe summaries`);
  return recipes;
}

function fetchRecipeDetail(slug) {
  const url = `${API_BASE}/recipe/${slug}`;

  try {
    const data = fetchJsonSync(url);
    const entry = data.data?.entry;
    if (!entry) return null;

    // Find main and mood images
    const mainImage = entry.media?.images
      ?.filter(img => img.type !== 'mood')
      ?.sort((a, b) => Math.abs(a.width - 700) - Math.abs(b.width - 700))[0]
      ?.image ?? '';
    const moodImage = entry.media?.images
      ?.filter(img => img.type === 'mood')
      ?.sort((a, b) => Math.abs(a.width - 700) - Math.abs(b.width - 700))[0]
      ?.image;

    // Process portion sizes - maps serving count to ingredient IDs with quantities
    const portionSizes = (entry.portion_sizes ?? [])
      .filter(ps => ps.is_offered)
      .map(ps => ({
        portions: ps.portions,
        ingredients: (ps.ingredients_skus ?? []).map(sku => ({
          id: sku.id,
          quantity: sku.quantities?.in_box ?? 1,
        })),
      }));

    // Get available serving sizes (typically 2-5)
    const availableServings = portionSizes.map(ps => ps.portions).sort((a, b) => a - b);

    // Store all ingredients with their IDs for portion-based filtering
    const ingredients = (entry.ingredients ?? []).map(ing => ({
      id: ing.gousto_uuid ?? ing.uid ?? '',
      name: ing.name ?? '',
      label: ing.label ?? ing.title ?? '',
      imageUrl: ing.media?.images?.[0]?.image,
    }));

    return {
      uid: entry.uid,
      title: entry.title,
      slug: extractSlug(entry.url),
      description: entry.seo_description ?? '',
      rating: {
        average: entry.rating?.average ?? 0,
        count: entry.rating?.count ?? 0,
      },
      prepTimes: {
        for2: entry.prep_times?.for_2 ?? 0,
        for4: entry.prep_times?.for_4 ?? 0,
      },
      images: {
        main: mainImage,
        mood: moodImage,
      },
      cuisine: entry.recipe_cuisine ?? '',
      dietType: entry.recipe_diet_type ?? '',
      ingredients,
      portionSizes,
      availableServings,
      instructions: (entry.cooking_instructions ?? [])
        .sort((a, b) => a.order - b.order)
        .map((inst, index) => ({
          step: index + 1,
          text: inst.instruction,
          imageUrl: inst.media?.images?.[0]?.image,
        })),
      nutrition: {
        perServing: {
          calories: entry.nutritional_information?.per_portion?.energy_kcal ?? 0,
          protein: entry.nutritional_information?.per_portion?.protein_grams ?? 0,
          carbs: entry.nutritional_information?.per_portion?.carbs_grams ?? 0,
          fat: entry.nutritional_information?.per_portion?.fat_grams ?? 0,
        },
      },
      basics: (entry.basics ?? []).map(b => b.title ?? b.label ?? ''),
    };
  } catch (error) {
    console.error(`Error fetching details for ${slug}:`, error.message);
    return null;
  }
}

function fetchAllDetails(recipes) {
  if (!fs.existsSync(DETAILS_DIR)) {
    fs.mkdirSync(DETAILS_DIR, { recursive: true });
  }

  // Load existing details to skip already fetched
  const existingFiles = new Set(
    fs.existsSync(DETAILS_DIR)
      ? fs.readdirSync(DETAILS_DIR).map(f => f.replace('.json', ''))
      : []
  );

  const toFetch = recipes.filter(r => !existingFiles.has(r.slug));
  console.log(`Fetching details for ${toFetch.length} recipes (${existingFiles.size} already cached)...`);

  for (let i = 0; i < toFetch.length; i++) {
    const recipe = toFetch[i];
    console.log(`[${i + 1}/${toFetch.length}] Fetching ${recipe.slug}...`);

    const detail = fetchRecipeDetail(recipe.slug);
    if (detail) {
      // Skip recipes without portion size data (can't accurately show serving info)
      if (detail.availableServings.length === 0) {
        console.log(`  Skipping ${recipe.slug} - no portion size data available`);
        continue;
      }
      fs.writeFileSync(
        path.join(DETAILS_DIR, `${recipe.slug}.json`),
        JSON.stringify(detail, null, 2)
      );
    }

    sleep(DELAY_BETWEEN_REQUESTS);
  }

  console.log('Done fetching details');
}

function combineDataForExport() {
  console.log('Combining data for export...');

  const summaries = JSON.parse(fs.readFileSync(RECIPES_FILE, 'utf-8'));
  const recipesWithDetails = [];

  for (const summary of summaries) {
    const detailFile = path.join(DETAILS_DIR, `${summary.slug}.json`);
    const hasDetails = fs.existsSync(detailFile);
    recipesWithDetails.push({ ...summary, hasDetails });
  }

  // Write combined summary file
  fs.writeFileSync(
    path.join(DATA_DIR, 'recipes-index.json'),
    JSON.stringify(recipesWithDetails, null, 2)
  );

  console.log(`Combined ${recipesWithDetails.length} recipes, ${recipesWithDetails.filter(r => r.hasDetails).length} with details`);
}

function main() {
  const args = process.argv.slice(2);
  const limitIndex = args.indexOf('--limit');
  const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1], 10) : undefined;
  const fetchDetails = args.includes('--details');

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Fetch summaries
  let recipes;
  if (fs.existsSync(RECIPES_FILE) && !args.includes('--force')) {
    console.log('Loading existing recipes from cache...');
    recipes = JSON.parse(fs.readFileSync(RECIPES_FILE, 'utf-8'));
    if (limit && recipes.length > limit) {
      recipes = recipes.slice(0, limit);
    }
  } else {
    recipes = fetchAllRecipeSummaries(limit);
    fs.writeFileSync(RECIPES_FILE, JSON.stringify(recipes, null, 2));
  }

  // Optionally fetch details
  if (fetchDetails) {
    fetchAllDetails(recipes);
  }

  // Combine data
  combineDataForExport();

  console.log('\nDone! Data saved to:');
  console.log(`  - ${RECIPES_FILE}`);
  if (fetchDetails) {
    console.log(`  - ${DETAILS_DIR}/`);
  }
}

main();
