// Données de test (une ligne dans chaque table, champs optionnels renseignés).
import type { BackupFile, Profile } from '../types'
import { defaultNutritionParams } from './defaults'

export const NOW = '2026-03-01T08:00:00.000Z'

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'me',
    name: 'Paul',
    sex: 'male',
    birthDate: '2000-05-17',
    heightCm: 180,
    activityLevel: 'moderate',
    goal: 'bulk',
    level: 1,
    weeklySessionsTarget: 5,
    weeklySessionsMin: 3,
    nutrition: { ...defaultNutritionParams },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

export function makeFullTables(): BackupFile['tables'] {
  return {
    profile: [makeProfile()],
    weighIns: [
      { id: 'w1', date: '2026-02-27', weightKg: 70.5, note: 'matin', createdAt: NOW },
      { id: 'w2', date: '2026-02-28', weightKg: 70.8, createdAt: NOW },
    ],
    measurements: [{ id: 'm1', date: '2026-02-28', armCm: 33, waistCm: 80, note: 'ok', createdAt: NOW }],
    equipment: [
      {
        id: 'me',
        kettlebell: { minKg: 12, maxKg: 24, stepKg: 1 },
        owned: ['mat', 'pullup_bar'],
        updatedAt: NOW,
      },
    ],
    exercises: [
      {
        id: 'goblet-squat',
        name: 'Squat gobelet',
        pattern: 'squat',
        level: 1,
        muscles: { primary: ['quads', 'glutes'], secondary: ['abs'] },
        equipment: ['kettlebell'],
        loadType: 'kettlebell',
        repRange: [8, 12],
        restSec: 90,
        compound: true,
        unilateral: false,
        loadStepKg: 2,
        progressionCriteria: '3 × 12 propres',
        technique: {
          setup: 'Debout',
          steps: ['Descendre'],
          cues: ['Dos droit'],
          mistakes: ['Genoux rentrés'],
        },
        illustration: 'goblet-squat',
        videoUrl: 'https://example.com/v',
        source: 'seed',
        deleted: false,
        updatedAt: NOW,
      },
    ],
    exercisePrefs: [{ exerciseId: 'goblet-squat', preference: 'liked', reason: 'aime', updatedAt: NOW }],
    exerciseState: [
      {
        exerciseId: 'goblet-squat',
        loadKg: 16,
        targetDurationSec: 40,
        recentFeelings: ['ok', 'easy'],
        topStreak: 2,
        tempo: true,
        lastPerformedOn: '2026-02-28',
        updatedAt: NOW,
      },
    ],
    sessions: [
      {
        id: 's1',
        date: '2026-02-28',
        durationMin: 45,
        status: 'done',
        warmup: ['Mobilité'],
        blocks: [
          {
            id: 'b1',
            kind: 'single',
            exercises: [
              {
                exerciseId: 'goblet-squat',
                restSec: 90,
                sets: [
                  {
                    targetReps: [8, 12],
                    loadKg: 16,
                    actualReps: 10,
                    feeling: 'ok',
                    status: 'done',
                  },
                ],
              },
            ],
          },
        ],
        deload: false,
        estimatedMin: 44,
        templateId: 't1',
        startedAt: NOW,
        endedAt: NOW,
        cursor: { block: 0, exercise: 0, set: 1 },
        notes: 'bien',
        updatedAt: NOW,
      },
    ],
    sessionTemplates: [
      {
        id: 't1',
        name: 'Jambes',
        durationMin: 30,
        blocks: [{ exerciseId: 'goblet-squat', sets: 3, reps: [8, 12], loadKg: 16, restSec: 90 }],
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    foods: [
      {
        id: 'ciqual-1000',
        name: 'Riz',
        source: 'ciqual',
        ciqualCode: '1000',
        ean: '12345678',
        brand: 'X',
        per100g: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4 },
        defaultPortionG: 150,
        aisle: 'grocery',
        favorite: true,
        lastUsedAt: NOW,
        updatedAt: NOW,
      },
    ],
    recipes: [
      {
        id: 'r1',
        name: 'Poulet riz',
        meal: ['lunch', 'dinner'],
        servings: 4,
        prepMinutes: 10,
        cookMinutes: 20,
        fridgeDays: 4,
        tags: ['meal-prep'],
        ingredients: [
          { name: 'Riz', grams: 300, foodId: 'ciqual-1000', ciqualCode: '1000', aisle: 'grocery' },
          { name: 'Sauce', grams: 50, aisle: 'other', per100g: { kcal: 100, protein: 1, carbs: 10, fat: 5 } },
        ],
        steps: ['Cuire'],
        source: 'user',
        deleted: false,
        favorite: true,
        updatedAt: NOW,
      },
    ],
    fridge: [
      { id: 'f1', recipeId: 'r1', portionsLeft: 3, preparedOn: '2026-02-28', expiresOn: '2026-03-04' },
    ],
    foodLog: [
      {
        id: 'l1',
        date: '2026-02-28',
        slot: 'lunch',
        name: 'Poulet riz',
        origin: { kind: 'recipe', recipeId: 'r1', portions: 1, fridgeItemId: 'f1' },
        macros: { kcal: 600, protein: 40, carbs: 70, fat: 15 },
        createdAt: NOW,
      },
      {
        id: 'l2',
        date: '2026-02-28',
        slot: 'snack',
        name: 'Riz',
        origin: { kind: 'food', foodId: 'ciqual-1000', grams: 100 },
        macros: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 },
        createdAt: NOW,
      },
    ],
    shoppingLists: [
      {
        id: 'sl1',
        name: 'Semaine',
        sources: [{ recipeId: 'r1', portions: 4 }],
        items: [
          {
            id: 'i1',
            key: 'food:ciqual-1000',
            name: 'Riz',
            grams: 300,
            aisle: 'grocery',
            foodId: 'ciqual-1000',
            checked: false,
          },
        ],
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    settings: [
      {
        id: 'me',
        onboardingCompleted: true,
        coachUrl: 'https://claude.ai/project/x',
        lastExportAt: NOW,
        engine: { volumeTargets: { chest: [10, 16] }, deloadEveryWeeks: 6 },
        updatedAt: NOW,
      },
    ],
  }
}
