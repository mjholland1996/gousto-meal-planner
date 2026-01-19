/**
 * Script to parse Spanish recipes from raw_recetas.txt
 * Outputs recetas-index.json and individual recipe JSON files
 * Separates ingredients from method where possible
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const INPUT_FILE = path.join(DATA_DIR, 'raw_recetas.txt');
const OUTPUT_INDEX = path.join(DATA_DIR, 'recetas-index.json');
const OUTPUT_DIR = path.join(DATA_DIR, 'recetas');

/**
 * Generate URL-friendly slug from title
 */
function slugify(title) {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-') // Spaces to hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, ''); // Trim hyphens
}

/**
 * Check if a line is an index entry (has · followed by page number)
 */
function isIndexEntry(line) {
  return /·\s*\d+\s*$/.test(line);
}

/**
 * Check if a line is a recipe title (mostly uppercase, not an index entry)
 * Recipe titles are in ALL CAPS and may have XE "..." markers
 */
function isRecipeTitle(line) {
  // Strip XE "..." markers first
  const cleaned = line.replace(/\s*XE\s*"[^"]*"\s*/g, '').trim();

  if (cleaned.length < 3) return false;
  if (isIndexEntry(line)) return false;

  // Check if mostly uppercase (allowing for accented chars, spaces, parens, etc.)
  const letters = cleaned.replace(/[^A-ZÁÉÍÓÚÑÜ a-záéíóúñü]/g, '');
  const upperCount = (letters.match(/[A-ZÁÉÍÓÚÑÜ]/g) || []).length;
  const lowerCount = (letters.match(/[a-záéíóúñü]/g) || []).length;

  // Title should be predominantly uppercase (at least 70%)
  return upperCount > 0 && upperCount / (upperCount + lowerCount) >= 0.7;
}

/**
 * Clean a recipe title by removing XE markers and extra whitespace
 */
function cleanTitle(title) {
  return title
    .replace(/\s*XE\s*"[^"]*"\s*/g, '') // Remove XE "..." markers
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Check if a line looks like an ingredient line
 * Ingredients are typically short and contain quantities/measurements
 */
function looksLikeIngredient(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;

  // Too long to be an ingredient
  if (trimmed.length > 80) return false;

  // Contains cooking verbs - likely method
  const methodVerbs = /\b(cocinar|freír|hervir|mezclar|agregar|añadir|poner|dejar|preparar|calentar|cortar|licuar|batir|servir|retirar|tapar|hornear|precalentar|sazonar|condimentar|espolvorear|vaciar|unir|derretir|dorar|saltear|revolver|colar|rallar|picar)\b/i;
  if (methodVerbs.test(trimmed)) return false;

  // Starts with a bullet or number - likely ingredient
  if (/^[\d•\-\*]/.test(trimmed)) return true;

  // Contains measurement units - likely ingredient
  const measurements = /\b(\d+|½|¼|¾|⅓|⅔)\s*(T|CH|ch|taza|tazas|grms?|gramos?|kg|ml|litro|cucharada|cucharadita|pizca|unidad|unidades|pcs|dientes?|ramitas?|hojas?|rebanadas?|tajadas?|rodajas?)\b/i;
  if (measurements.test(trimmed)) return true;

  // Short line without periods (ingredients don't usually have periods)
  if (trimmed.length < 50 && !trimmed.includes('.')) return true;

  return false;
}

/**
 * Separate content into ingredients and method
 * Returns { ingredientes, metodo } or { content } if not separable
 */
function separateContent(content) {
  const lines = content.split('\n');
  const ingredientLines = [];
  const methodLines = [];

  let foundBlankLine = false;
  let inMethod = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Track blank lines
    if (!trimmed) {
      if (ingredientLines.length > 0 && !inMethod) {
        foundBlankLine = true;
      }
      continue;
    }

    // After a blank line, check if we're now in method section
    if (foundBlankLine && !inMethod) {
      // If this line looks like method (long or has verbs), switch to method
      if (!looksLikeIngredient(trimmed)) {
        inMethod = true;
      }
    }

    if (inMethod) {
      methodLines.push(trimmed);
    } else if (looksLikeIngredient(trimmed)) {
      ingredientLines.push(trimmed);
    } else {
      // Doesn't look like ingredient but we haven't hit method yet
      // This could be a recipe with no clear separation
      if (ingredientLines.length === 0) {
        // No ingredients found yet, this is probably all method
        methodLines.push(trimmed);
        inMethod = true;
      } else {
        // We have some ingredients, now hitting method
        inMethod = true;
        methodLines.push(trimmed);
      }
    }
  }

  // Determine if we have a clear separation
  const hasIngredients = ingredientLines.length >= 2;
  const hasMethod = methodLines.length >= 1;

  if (hasIngredients && hasMethod) {
    return {
      ingredientes: ingredientLines.join('\n'),
      metodo: methodLines.join('\n\n')
    };
  }

  // No clear separation - return as content
  return {
    content: content.trim()
  };
}

/**
 * Parse the raw recipes file
 */
function parseRecipes() {
  const content = fs.readFileSync(INPUT_FILE, 'utf-8');
  const lines = content.split('\n');

  const recipes = [];
  let currentRecipe = null;
  let inIndex = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines at the start
    if (!trimmed && !currentRecipe) continue;

    // Detect end of index section
    // Index entries have · followed by page numbers
    if (inIndex) {
      if (isIndexEntry(trimmed)) {
        continue; // Skip index entries
      }
      // Single letter lines in index (A, B, C, etc.)
      if (/^[A-Z]$/.test(trimmed)) {
        continue;
      }
      // Skip the INDEX header line
      if (trimmed.startsWith('INDEX')) {
        continue;
      }
      // If we hit a recipe title, we're out of the index
      if (isRecipeTitle(trimmed)) {
        inIndex = false;
      } else {
        continue;
      }
    }

    // Check if this is a new recipe title
    if (isRecipeTitle(trimmed)) {
      // Save previous recipe
      if (currentRecipe && currentRecipe.rawContent.trim()) {
        recipes.push(currentRecipe);
      }

      const title = cleanTitle(trimmed);
      currentRecipe = {
        title,
        slug: slugify(title),
        rawContent: ''
      };
    } else if (currentRecipe) {
      // Add line to current recipe content
      currentRecipe.rawContent += line + '\n';
    }
  }

  // Don't forget the last recipe
  if (currentRecipe && currentRecipe.rawContent.trim()) {
    recipes.push(currentRecipe);
  }

  return recipes;
}

/**
 * Main function
 */
function main() {
  console.log('Parsing recipes from:', INPUT_FILE);

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const recipes = parseRecipes();
  console.log(`Found ${recipes.length} recipes`);

  // Process each recipe to separate ingredients and method
  const processedRecipes = recipes.map(recipe => {
    const separated = separateContent(recipe.rawContent);
    return {
      title: recipe.title,
      slug: recipe.slug,
      ...separated
    };
  });

  // Count stats
  const withSeparation = processedRecipes.filter(r => r.ingredientes).length;
  const withoutSeparation = processedRecipes.filter(r => r.content).length;
  console.log(`Recipes with ingredients/method separation: ${withSeparation}`);
  console.log(`Recipes without clear separation: ${withoutSeparation}`);

  // Create index
  const index = processedRecipes.map(r => ({
    title: r.title,
    slug: r.slug
  }));

  // Sort index alphabetically
  index.sort((a, b) => a.title.localeCompare(b.title, 'es'));

  fs.writeFileSync(OUTPUT_INDEX, JSON.stringify(index, null, 2));
  console.log('Wrote index to:', OUTPUT_INDEX);

  // Write individual recipe files
  for (const recipe of processedRecipes) {
    const filePath = path.join(OUTPUT_DIR, `${recipe.slug}.json`);
    fs.writeFileSync(filePath, JSON.stringify(recipe, null, 2));
  }
  console.log(`Wrote ${processedRecipes.length} recipe files to:`, OUTPUT_DIR);

  // Print some examples
  console.log('\nSample recipes with separation:');
  processedRecipes.filter(r => r.ingredientes).slice(0, 3).forEach(r => {
    console.log(`  - ${r.title}`);
  });

  console.log('\nSample recipes without separation:');
  processedRecipes.filter(r => r.content).slice(0, 3).forEach(r => {
    console.log(`  - ${r.title}`);
  });
}

main();
