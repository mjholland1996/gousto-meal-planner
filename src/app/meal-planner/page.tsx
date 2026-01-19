'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { RecipeGrid } from '@/components/RecipeGrid';
import { SelectionTracker } from '@/components/SelectionTracker';
import { ServingSizeSelector } from '@/components/ServingSizeSelector';
import { FilterPanel, Filters } from '@/components/FilterPanel';
import { useMealPlan } from '@/context/MealPlanContext';
import { RecipeSummary } from '@/types/recipe';
import recipesData from '../../../data/recipes-index.json';

function getTimeCategory(prepTime: number): string {
  if (prepTime <= 25) return 'quick';
  if (prepTime <= 45) return 'medium';
  return 'long';
}

export default function BrowsePage() {
  const { selectedRecipes } = useMealPlan();
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<Filters>({
    proteins: [],
    carbs: [],
    time: null,
  });

  // Only show recipes that have complete detail data
  const allRecipes = useMemo(
    () => (recipesData as RecipeSummary[]).filter(r => r.hasDetails),
    []
  );

  // Get set of all ingredient names from selected recipes
  const selectedIngredients = useMemo(() => {
    const ingredients = new Set<string>();
    for (const recipe of selectedRecipes) {
      // Find full recipe data with ingredients
      const fullRecipe = allRecipes.find(r => r.slug === recipe.slug);
      if (fullRecipe?.ingredientNames) {
        for (const ing of fullRecipe.ingredientNames) {
          ingredients.add(ing);
        }
      }
    }
    return ingredients;
  }, [selectedRecipes, allRecipes]);

  // Compute shared ingredients count for each recipe
  const sharedIngredientsMap = useMemo(() => {
    const map = new Map<string, number>();
    if (selectedIngredients.size === 0) return map;

    for (const recipe of allRecipes) {
      // Skip selected recipes
      if (selectedRecipes.some(r => r.slug === recipe.slug)) continue;

      const recipeIngredients = recipe.ingredientNames ?? [];
      const sharedCount = recipeIngredients.filter(ing =>
        selectedIngredients.has(ing)
      ).length;

      if (sharedCount > 0) {
        map.set(recipe.slug, sharedCount);
      }
    }
    return map;
  }, [allRecipes, selectedRecipes, selectedIngredients]);

  // Filter recipes based on current filters and search query
  const filteredRecipes = useMemo(() => {
    return allRecipes.filter(recipe => {
      // Search filter (case-insensitive title match)
      if (searchQuery.trim()) {
        if (!recipe.title.toLowerCase().includes(searchQuery.toLowerCase().trim())) {
          return false;
        }
      }

      // Protein filter (OR logic - match any selected protein)
      if (filters.proteins.length > 0) {
        const recipeProteins = recipe.proteins ?? [];
        if (!filters.proteins.some(p => recipeProteins.includes(p))) {
          return false;
        }
      }

      // Carb filter (OR logic - match any selected carb)
      if (filters.carbs.length > 0) {
        const recipeCarbs = recipe.carbs ?? [];
        if (!filters.carbs.some(c => recipeCarbs.includes(c))) {
          return false;
        }
      }

      // Time filter
      if (filters.time) {
        const timeCategory = getTimeCategory(recipe.prepTimes.for2);
        if (timeCategory !== filters.time) {
          return false;
        }
      }

      return true;
    });
  }, [allRecipes, filters, searchQuery]);

  // Sort recipes: selected first, then by shared ingredients (descending), then alphabetically
  const sortedRecipes = useMemo(() => {
    return [...filteredRecipes].sort((a, b) => {
      const aSelected = selectedRecipes.some(r => r.slug === a.slug);
      const bSelected = selectedRecipes.some(r => r.slug === b.slug);

      // Selected recipes first
      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;

      // Then by shared ingredients count (descending)
      const aShared = sharedIngredientsMap.get(a.slug) ?? 0;
      const bShared = sharedIngredientsMap.get(b.slug) ?? 0;
      if (aShared !== bShared) return bShared - aShared;

      // Finally alphabetically
      return a.title.localeCompare(b.title);
    });
  }, [filteredRecipes, selectedRecipes, sharedIngredientsMap]);

  // Compute counts for filter badges (based on all recipes, not filtered)
  const recipeCounts = useMemo(() => {
    const proteins: Record<string, number> = {};
    const carbs: Record<string, number> = {};
    const time: Record<string, number> = {};

    for (const recipe of allRecipes) {
      // Count proteins
      for (const p of recipe.proteins ?? []) {
        proteins[p] = (proteins[p] ?? 0) + 1;
      }

      // Count carbs
      for (const c of recipe.carbs ?? []) {
        carbs[c] = (carbs[c] ?? 0) + 1;
      }

      // Count time categories
      const timeCategory = getTimeCategory(recipe.prepTimes.for2);
      time[timeCategory] = (time[timeCategory] ?? 0) + 1;
    }

    return { proteins, carbs, time };
  }, [allRecipes]);

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <Link href="/" className="text-emerald-600 hover:text-emerald-700 text-sm font-medium">
            &larr; Back to home
          </Link>
          <div className="flex items-start justify-between gap-4 mt-2">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Choose Your Meals</h1>
              <p className="text-gray-600 mt-1">Select up to 5 recipes for your weekly meal plan</p>
            </div>
            <ServingSizeSelector />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Search */}
        <div className="mb-4">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search recipes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <FilterPanel
          filters={filters}
          onChange={setFilters}
          recipeCounts={recipeCounts}
        />

        {/* Results count */}
        <p className="text-sm text-gray-600 mb-4">
          Showing {sortedRecipes.length} of {allRecipes.length} recipes
          {selectedRecipes.length > 0 && sharedIngredientsMap.size > 0 && (
            <span className="ml-2 text-amber-600">
              (sorted by shared ingredients)
            </span>
          )}
        </p>

        <RecipeGrid
          recipes={sortedRecipes}
          sharedIngredients={sharedIngredientsMap}
        />
      </main>

      {/* Selection tracker */}
      <SelectionTracker />
    </div>
  );
}
