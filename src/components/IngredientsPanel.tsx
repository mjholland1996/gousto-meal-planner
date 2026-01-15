'use client';

import Image from 'next/image';
import { useMealPlan } from '@/context/MealPlanContext';
import { Ingredient, PortionSize } from '@/types/recipe';

interface IngredientsPanelProps {
  ingredients: Ingredient[];
  portionSizes: PortionSize[];
  availableServings: number[];
  basics: string[];
  nutrition: {
    perServing: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    };
  };
}

export function IngredientsPanel({
  ingredients,
  portionSizes,
  availableServings,
  basics,
  nutrition,
}: IngredientsPanelProps) {
  const { servingSize } = useMealPlan();

  // Find the portion size entry for the selected serving size
  // Fall back to the closest available serving size if exact match not found
  const effectiveServingSize = availableServings.includes(servingSize)
    ? servingSize
    : availableServings.reduce((prev, curr) =>
        Math.abs(curr - servingSize) < Math.abs(prev - servingSize) ? curr : prev
      );

  const portionEntry = portionSizes.find(ps => ps.portions === effectiveServingSize);
  const portionIngredients = portionEntry?.ingredients ?? [];

  // Build a map of ingredient ID to quantity for this portion size
  const quantityMap = new Map(portionIngredients.map(pi => [pi.id, pi.quantity]));
  const ingredientIds = portionIngredients.map(pi => pi.id);

  // Filter ingredients to only those in the current portion size
  const filteredIngredients = ingredientIds.length > 0
    ? ingredients.filter(ing => ingredientIds.includes(ing.id))
    : ingredients;

  // Clean up ingredient label:
  // - Remove "x0" suffix (data artifact)
  // - Remove "xN" suffix when we have a quantity (e.g., "White potato x4" → "White potato")
  const cleanLabel = (label: string, hasQuantity: boolean) => {
    let cleaned = label.replace(/\s*x0$/i, '');
    if (hasQuantity) {
      // Remove trailing " xN" or " x N" patterns (pack sizes)
      cleaned = cleaned.replace(/\s*x\s*\d+$/i, '');
    }
    return cleaned;
  };

  // Get quantity for an ingredient
  const getQuantity = (id: string) => quantityMap.get(id) ?? 1;

  return (
    <div className="bg-white rounded-xl shadow-sm p-6 sticky top-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">Ingredients</h2>
        <span className="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded">
          {effectiveServingSize} servings
        </span>
      </div>

      {filteredIngredients.length > 0 ? (
        <ul className="space-y-3">
          {filteredIngredients.map((ingredient) => (
            <li key={ingredient.id} className="flex items-start gap-3">
              {ingredient.imageUrl && (
                <div className="relative w-10 h-10 rounded bg-gray-100 shrink-0">
                  <Image
                    src={ingredient.imageUrl}
                    alt={ingredient.name}
                    fill
                    className="object-cover rounded"
                    sizes="40px"
                  />
                </div>
              )}
              <div>
                <p className="font-medium text-gray-900">
                  {cleanLabel(ingredient.label, getQuantity(ingredient.id) > 1)}
                  {getQuantity(ingredient.id) > 1 && (
                    <span className="ml-1 text-emerald-600 font-semibold">
                      × {getQuantity(ingredient.id)}
                    </span>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-gray-500">No ingredients data available</p>
      )}

      {basics.length > 0 && (
        <>
          <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-3">You&apos;ll also need</h3>
          <ul className="space-y-1 text-gray-600">
            {basics.map((basic, index) => (
              <li key={index}>{basic}</li>
            ))}
          </ul>
        </>
      )}

      {/* Nutrition */}
      {nutrition.perServing.calories > 0 && (
        <>
          <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-3">Nutrition (per serving)</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-gray-50 rounded p-2">
              <p className="font-semibold">{nutrition.perServing.calories}</p>
              <p className="text-gray-500">kcal</p>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <p className="font-semibold">{nutrition.perServing.protein}g</p>
              <p className="text-gray-500">protein</p>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <p className="font-semibold">{nutrition.perServing.carbs}g</p>
              <p className="text-gray-500">carbs</p>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <p className="font-semibold">{nutrition.perServing.fat}g</p>
              <p className="text-gray-500">fat</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
