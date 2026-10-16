import {
  ChevronLeft,
  ClipboardPaste,
  FilePlus,
  Play,
  Plus,
  Ruler,
  Settings,
  UtensilsCrossed,
} from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { seedExercises } from '../../content'
import { muscleMapPaths } from '../../content/visuals'
import type { FoodCategory, MealSlot, MuscleView, MuscleZone } from '../../types'
import { muscleLabel } from '../../ui/choices'
import {
  Button,
  Card,
  ExerciseThumb,
  FoodPictogram,
  FoodTile,
  KcalRing,
  ListRow,
  LogSheet,
  MacroBar,
  MuscleMap,
  PillTabs,
  Segmented,
  Sheet,
  StatTile,
  Stepper,
  TabBar,
  WeekStrip,
  buttonClass,
  formatInt,
  withUnit,
} from '../../ui/kit'
import { CalendarHeatmap } from '../../ui/kit/CalendarHeatmap'
import { DaySummarySheet } from '../../ui/kit/DaySummarySheet'
import { SessionDemos } from './SessionDemos'
import type {
  DaySummaryView,
  LogAction,
  LogEntry,
  LogMealOption,
  TabId,
  WeekStripDay,
} from '../../ui/kit'

/** Page de démonstration du kit v2 (`/dev/ui`). Hors de la mise en page à onglets v1. */

const MEALS = [
  { id: 'breakfast', label: 'petit-déjeuner', phrase: 'au petit-déjeuner' },
  { id: 'lunch', label: 'déjeuner', phrase: 'au déjeuner' },
  { id: 'dinner', label: 'dîner', phrase: 'au dîner' },
  { id: 'snack', label: 'collation', phrase: 'à la collation' },
] as const satisfies readonly LogMealOption[]

/** Entrées des sections « Créer » et « Autres » telles que la v1 de la navigation les branche (R1). */
const DEMO_CREATE: readonly LogEntry[] = [
  { action: 'recipe-new', label: 'Nouvelle recette', Icon: UtensilsCrossed },
  { action: 'food-new', label: 'Nouvel aliment', Icon: FilePlus },
]
const DEMO_OTHERS: readonly LogEntry[] = [
  { action: 'claude-response', label: 'Coller une réponse de Claude', Icon: ClipboardPaste },
  { action: 'measurements', label: 'Mensurations', Icon: Ruler },
]

/** Semaine d'exemple : lundi 12 → dimanche 18 octobre 2026, avec un vendredi « aujourd'hui ». */
const DEMO_WEEK: readonly WeekStripDay[] = [
  { date: '2026-10-12', level: 2, sessions: 1, minutes: 32, nutritionOk: true, future: false, today: false },
  { date: '2026-10-13', level: 0, sessions: 0, minutes: 0, nutritionOk: true, future: false, today: false },
  { date: '2026-10-14', level: 3, sessions: 1, minutes: 48, nutritionOk: false, future: false, today: false },
  { date: '2026-10-15', level: 0, sessions: 0, minutes: 0, nutritionOk: null, future: false, today: false },
  { date: '2026-10-16', level: 4, sessions: 1, minutes: 40, nutritionOk: null, future: false, today: true },
  { date: '2026-10-17', level: 0, sessions: 0, minutes: 0, nutritionOk: null, future: true, today: false },
  { date: '2026-10-18', level: 0, sessions: 0, minutes: 0, nutritionOk: null, future: true, today: false },
]

/** 12 semaines d'exemple (lundi 3 août → dimanche 25 octobre 2026), aujourd'hui = vendredi 16 octobre. */
const DEMO_HEAT_LEVELS = '0200100 0201020 1020300 0030200 2003100 0203020 3020300 0302030 2030402 0303030 3040302 2030000'
const DEMO_HEAT_FOOD = '0110110 1110101 0111011 1011010 1101101 0111011 1110111 1011101 1111011 0111110 1111101 1110000'
const DEMO_HEATMAP: readonly WeekStripDay[] = (() => {
  const levels = DEMO_HEAT_LEVELS.replace(/ /g, '')
  const food = DEMO_HEAT_FOOD.replace(/ /g, '')
  const start = new Date(2026, 7, 3, 12)
  const todayIndex = 11 * 7 + 4
  return Array.from({ length: 84 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const p = (n: number) => String(n).padStart(2, '0')
    const level = Number(levels.charAt(i)) as WeekStripDay['level']
    const future = i > todayIndex
    return {
      date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
      level: future ? 0 : level,
      sessions: !future && level > 0 ? 1 : 0,
      minutes: level === 1 ? 20 : level === 2 ? 32 : level === 0 ? 0 : 50,
      nutritionOk: future ? null : food.charAt(i) === '1',
      future,
      today: i === todayIndex,
    }
  })
})()

const DEMO_DAY: DaySummaryView = {
  title: 'Mercredi 14 octobre',
  future: false,
  sessions: [
    {
      id: 's1',
      title: 'Séance de 32 min',
      details: '14 séries · Goblet squat, Pompes, Rowing 1 bras',
      records: ['Goblet squat, 18 kg × 12'],
    },
  ],
  meals: [
    { id: 'breakfast', label: 'Petit-déjeuner', details: 'Skyr, Flocons d’avoine', kcal: 540 },
    { id: 'lunch', label: 'Déjeuner', details: 'Riz, Poulet, Brocoli', kcal: 820 },
  ],
  totals: { kcal: 2710, protein: 148 },
  targets: { kcal: 2840, protein: 140 },
  nutritionOk: true,
}

const VIEWS: readonly MuscleView[] = ['front', 'back']

const SAMPLE_NAMES = [
  'Goblet squat',
  'Swing kettlebell deux mains',
  'Rowing 1 bras avec appui',
  'Pompes',
  'Développé kettlebell debout',
  'Curl marteau',
  'Planche',
]
const SAMPLE_EXERCISES = SAMPLE_NAMES.flatMap((n) => seedExercises.filter((e) => e.name === n))

const FOOD_CATEGORIES: readonly (readonly [FoodCategory, string])[] = [
  ['meat', 'Viande'],
  ['fish', 'Poisson'],
  ['egg', 'Œuf'],
  ['dairy', 'Laitage'],
  ['cheese', 'Fromage'],
  ['starch', 'Féculent'],
  ['bread', 'Pain'],
  ['vegetable', 'Légume'],
  ['fruit', 'Fruit'],
  ['fat', 'Matière grasse'],
  ['drink', 'Boisson'],
  ['dish', 'Plat'],
  ['sweet', 'Sucré'],
]

const TAB_HREFS: Record<TabId, string> = {
  today: '#aujourdhui',
  training: '#entrainement',
  nutrition: '#nutrition',
  progress: '#progres',
}

const TEXT_STYLES: { name: string; className: string; sample: string }[] = [
  {
    name: 'display-xl · Archivo 64/64, 800',
    className: 'font-display text-display-xl tabular-nums',
    sample: '1:30',
  },
  { name: 'display-l · Archivo 34/38, 800', className: 'font-display text-display-l', sample: 'Aujourd’hui' },
  {
    name: 'number-l · Archivo 28/32, 700',
    className: 'font-display text-number-l tabular-nums',
    sample: '2 840 kcal',
  },
  { name: 'title · Archivo 20/26, 700', className: 'font-display text-title', sample: 'Séance du jour' },
  { name: 'headline · Figtree 17/22, 600', className: 'font-sans text-headline', sample: 'Goblet squat' },
  {
    name: 'body · Figtree 15/22, 400',
    className: 'font-sans text-body',
    sample: 'Garde le dos neutre et pousse le sol.',
  },
  {
    name: 'body-strong · Figtree 15/22, 600',
    className: 'font-sans text-body-strong',
    sample: '3 × 10 · 16 kg',
  },
  { name: 'caption · Figtree 13/18, 500', className: 'font-sans text-caption', sample: 'Repos 90 s' },
  {
    name: 'label · Figtree 11/14, 700, capitales',
    className: 'font-sans text-label uppercase',
    sample: 'Protéines',
  },
]

const COLORS: { name: string; swatch: string }[] = [
  { name: 'canvas', swatch: 'bg-canvas' },
  { name: 'surface', swatch: 'bg-surface' },
  { name: 'surface-raised', swatch: 'bg-surface-raised' },
  { name: 'surface-sunken', swatch: 'bg-surface-sunken' },
  { name: 'line', swatch: 'bg-line' },
  { name: 'ink', swatch: 'bg-ink' },
  { name: 'ink-muted', swatch: 'bg-ink-muted' },
  { name: 'ink-faint', swatch: 'bg-ink-faint' },
  { name: 'inverse', swatch: 'bg-inverse' },
  { name: 'on-inverse', swatch: 'bg-on-inverse' },
  { name: 'on-inverse-muted', swatch: 'bg-on-inverse-muted' },
  { name: 'ember', swatch: 'bg-ember' },
  { name: 'ember-ink', swatch: 'bg-ember-ink' },
  { name: 'ember-soft', swatch: 'bg-ember-soft' },
  { name: 'protein', swatch: 'bg-protein' },
  { name: 'carbs', swatch: 'bg-carbs' },
  { name: 'fat', swatch: 'bg-fat' },
  { name: 'heat-0', swatch: 'bg-heat-0' },
  { name: 'heat-1', swatch: 'bg-heat-1' },
  { name: 'heat-2', swatch: 'bg-heat-2' },
  { name: 'heat-3', swatch: 'bg-heat-3' },
  { name: 'heat-4', swatch: 'bg-heat-4' },
  { name: 'good', swatch: 'bg-good' },
  { name: 'warning', swatch: 'bg-warning' },
  { name: 'critical', swatch: 'bg-critical' },
  { name: 'focus', swatch: 'bg-focus' },
]

const RADII: { name: string; cls: string }[] = [
  { name: 'ds-sm · 10', cls: 'rounded-ds-sm' },
  { name: 'ds-md · 16', cls: 'rounded-ds-md' },
  { name: 'ds-lg · 24', cls: 'rounded-ds-lg' },
  { name: 'ds-xl · 32', cls: 'rounded-ds-xl' },
  { name: 'ds-pill · 999', cls: 'rounded-ds-pill' },
]

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`sec-${title}`} className="flex flex-col gap-4">
      <h2 id={`sec-${title}`} className="font-display text-title">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Demo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-label uppercase text-ink-muted">{label}</span>
      {children}
    </div>
  )
}

export default function UiScreen() {
  const [tab, setTab] = useState<TabId>('today')
  const [logOpen, setLogOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [dayOpen, setDayOpen] = useState<string | null>(null)
  const [meal, setMeal] = useState<MealSlot>('lunch')
  const [lastAction, setLastAction] = useState<LogAction | null>(null)
  const [pill, setPill] = useState<'journal' | 'recipes' | 'fridge' | 'shopping'>('journal')
  const [minutes, setMinutes] = useState<number>(30)
  const [sessions, setSessions] = useState(3)
  const [load, setLoad] = useState(16)
  const [selectedRow, setSelectedRow] = useState(false)

  return (
    <div className="ds-page fixed inset-0 overflow-y-auto overscroll-contain">
      <div
        className="mx-auto flex max-w-xl flex-col gap-8 px-4"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 1rem)',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 9rem)',
        }}
      >
        <header className="flex flex-col gap-3">
          <Link
            to="/reglages"
            className="focus-ring -ml-2 inline-flex min-h-11 items-center gap-1 self-start rounded-ds-pill px-2 text-body-strong text-ember-ink"
          >
            <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
            Réglages
          </Link>
          <div className="flex flex-col gap-0.5">
            <span className="text-caption text-ink-muted">Outil de développement</span>
            <h1 className="font-display text-display-l">Composants</h1>
          </div>
          <p className="text-body text-ink-muted">
            Le kit de l’interface v2 : jetons, typographie et composants. Cette page n’affiche aucune donnée.
          </p>
        </header>

        <Section title="Typographie">
          <Card className="flex flex-col gap-4">
            {TEXT_STYLES.map((s) => (
              <div
                key={s.name}
                className="flex flex-col gap-1 border-t border-line pt-3 first:border-t-0 first:pt-0"
              >
                <span className="text-caption text-ink-muted">{s.name}</span>
                <span className={s.className}>{s.sample}</span>
              </div>
            ))}
            <div className="flex flex-col gap-1 border-t border-line pt-3">
              <span className="text-caption text-ink-muted">
                Chiffres tabulaires : les colonnes ne bougent pas
              </span>
              <div className="flex gap-6 font-display text-number-l tabular-nums">
                <span className="flex flex-col">
                  <span>1:11</span>
                  <span>0:44</span>
                  <span>8:88</span>
                </span>
                <span className="flex flex-col">
                  <span>{withUnit(16, 'kg')}</span>
                  <span>{withUnit(72.4, 'kg')}</span>
                  <span>{withUnit(2840, 'kcal')}</span>
                </span>
              </div>
            </div>
          </Card>
        </Section>

        <Section title="Couleurs">
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0">
            {COLORS.map((c) => (
              <li key={c.name} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={`size-10 shrink-0 rounded-ds-sm ring-1 ring-line ${c.swatch}`}
                />
                <span className="text-caption">{c.name}</span>
              </li>
            ))}
          </ul>
          <Demo label="Translucides du mode séance (on-inverse/6, /10, /18)">
            <div className="flex gap-2 rounded-ds-lg bg-inverse p-4">
              <span className="size-12 rounded-ds-md bg-on-inverse/6" />
              <span className="size-12 rounded-ds-md bg-on-inverse/10" />
              <span className="size-12 rounded-ds-md bg-on-inverse/18" />
            </div>
          </Demo>
        </Section>

        <Section title="Rayons et ombres">
          <div className="flex flex-wrap gap-3">
            {RADII.map((r) => (
              <div
                key={r.name}
                className={`flex h-16 min-w-24 items-center justify-center bg-surface px-3 text-caption shadow-card ${r.cls}`}
              >
                {r.name}
              </div>
            ))}
            <div className="flex h-16 min-w-24 items-center justify-center rounded-ds-lg bg-surface-raised px-3 text-caption shadow-float">
              ombre float
            </div>
          </div>
        </Section>

        <Section title="Boutons">
          <Demo label="Normal · 48 px">
            <div className="flex flex-wrap gap-3">
              <Button variant="primary" icon={<Play size={20} strokeWidth={1.75} aria-hidden="true" />}>
                Voir la séance
              </Button>
              <Button variant="secondary">Modifier</Button>
              <Button variant="dark">Démarrer</Button>
              <Button variant="text">Voir tout</Button>
            </div>
          </Demo>
          <Demo label="Désactivés">
            <div className="flex flex-wrap gap-3">
              <Button variant="primary" disabled>
                Principal
              </Button>
              <Button variant="secondary" disabled>
                Secondaire
              </Button>
              <Button variant="dark" disabled>
                Sombre
              </Button>
              <Button variant="text" disabled>
                Texte
              </Button>
            </div>
          </Demo>
          <Demo label="Séance · 64 px, pleine largeur">
            <Button variant="primary" size="session" fullWidth>
              Correct
            </Button>
            <Button variant="dark" size="session" fullWidth>
              Passer
            </Button>
          </Demo>
          <Demo label="Focus : appuie sur Tab, ou lien habillé en bouton">
            <Link to="/reglages" className={buttonClass('secondary')}>
              Lien en bouton
            </Link>
          </Demo>
        </Section>

        <Section title="Cartes et lignes">
          <Card as="div" padding="none" className="px-4 py-1">
            <ListRow
              leading={<span aria-hidden="true" className="block size-[52px] rounded-ds-sm bg-canvas" />}
              title="Swing à deux mains"
              subtitle={
                <>
                  <b className="text-ink">3 × 15</b> · {withUnit(16, 'kg')}
                </>
              }
              trailing={<span className="font-display text-body-strong">{withUnit(636, 'kcal')}</span>}
            />
            <ListRow
              leading={<span aria-hidden="true" className="block size-10 rounded-ds-sm bg-canvas" />}
              title="Ligne cliquable"
              subtitle="Toute la ligne est un bouton"
              onPress={() => setSelectedRow((v) => !v)}
              trailing={
                <span className="text-caption text-ink-muted">{selectedRow ? 'Touchée' : 'Touche-moi'}</span>
              }
            />
            <ListRow title="Sans visuel" subtitle="Le visuel est l’exception" />
          </Card>
          <Card padding="large">
            <p className="text-label uppercase text-ink-muted">Séance du jour</p>
            <p className="font-display text-title">Bas du corps et tirage</p>
            <p className="text-caption text-ink-muted">Quadriceps et dos sont en retard sur ta semaine.</p>
          </Card>
        </Section>

        <Section title="Contrôles">
          <Demo label="PillTabs">
            <PillTabs
              ariaLabel="Sections de la nutrition"
              value={pill}
              onChange={setPill}
              tabs={[
                { id: 'journal', label: 'Journal' },
                { id: 'recipes', label: 'Recettes' },
                { id: 'fridge', label: 'Frigo · 6' },
                { id: 'shopping', label: 'Courses' },
              ]}
            />
          </Demo>
          <Demo label="Segmented (durée)">
            <Segmented
              ariaLabel="Durée"
              value={minutes}
              onChange={setMinutes}
              options={[20, 30, 45, 60].map((m) => ({ value: m, label: `${m}\u00a0min` }))}
            />
          </Demo>
          <Demo label="Segmented désactivé">
            <Segmented
              ariaLabel="Durée (désactivée)"
              disabled
              value={30}
              onChange={() => undefined}
              options={[20, 30, 45, 60].map((m) => ({ value: m, label: `${m}\u00a0min` }))}
            />
          </Demo>
          <Card className="flex flex-col gap-5">
            <Stepper
              label="Séances par semaine"
              value={sessions}
              min={1}
              max={6}
              onChange={setSessions}
              format={(v) => String(v)}
            />
            <Stepper
              label="Charge"
              value={load}
              min={4}
              max={32}
              step={2}
              onChange={setLoad}
              format={(v) => withUnit(v, 'kg')}
            />
            <Stepper label="Désactivé" value={12} disabled onChange={() => undefined} />
          </Card>
        </Section>

        <Section title="Chiffres">
          <Card padding="none" className="grid grid-cols-3 divide-x divide-line py-3.5">
            <StatTile label="Durée" value={withUnit(31, 'min')} />
            <StatTile label="Séries" value="16" />
            <StatTile label="Volume" value={withUnit(formatInt(2160), 'kg')} />
          </Card>
          <Card padding="large" className="flex items-center gap-[18px]">
            <KcalRing consumed={1554} target={2840} />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <MacroBar kind="protein" value={96} target={140} />
              <MacroBar kind="carbs" value={168} target={360} />
              <MacroBar kind="fat" value={52} target={85} />
            </div>
          </Card>
          <Demo label="Semaine : niveaux 0 à 4, point nutrition plein / anneau / absent, jour courant, jours à venir">
            <Card className="py-3.5">
              <WeekStrip days={DEMO_WEEK} />
            </Card>
          </Demo>
          <Demo label="Anneau : objectif dépassé">
            <Card className="flex items-center gap-4">
              <KcalRing consumed={3000} target={2840} />
              <span className="text-caption text-warning">Au-dessus de l’objectif</span>
            </Card>
          </Demo>
        </Section>

        <Section title="Calendrier">
          <Demo label="12 semaines : niveaux 0 à 4, point nutrition, jour courant, jours à venir ; chaque case est un bouton">
            <Card padding="none" className="px-[18px] py-4">
              <CalendarHeatmap
                days={DEMO_HEATMAP}
                label="Calendrier d’exemple"
                onSelectDay={(date) => setDayOpen(date)}
              />
            </Card>
          </Demo>
          <Demo label="Semaine cliquable (ouvre le résumé du jour)">
            <Card className="py-3.5">
              <WeekStrip days={DEMO_WEEK} onSelectDay={(date) => setDayOpen(date)} />
            </Card>
          </Demo>
        </Section>

        <Section title="Feuilles">
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => setSheetOpen(true)}>
              Ouvrir une feuille
            </Button>
            <Button
              variant="primary"
              icon={<Plus size={20} strokeWidth={1.75} aria-hidden="true" />}
              onClick={() => setLogOpen(true)}
            >
              Ouvrir la saisie
            </Button>
          </div>
          {lastAction !== null && (
            <p role="status" className="text-caption text-ink-muted">
              Dernière action : {lastAction}
            </p>
          )}
        </Section>

        <Section title="Navigation">
          <p className="text-body text-ink-muted">
            La barre flottante est en bas de l’écran : les liens restent sur cette page, le + ouvre la feuille
            « Ajouter ».
          </p>
          <div className="flex items-center gap-2 text-caption text-ink-muted">
            <Settings size={20} strokeWidth={1.75} aria-hidden="true" />
            Onglet actif : {tab}
          </div>
        </Section>

        <Section title="Visuels">
          <Demo label="Carte musculaire : une zone ciblée à la fois">
            <Card className="flex flex-col gap-4">
              {VIEWS.map((view) => (
                <div key={view} className="flex flex-col gap-2">
                  <span className="text-caption text-ink-muted">
                    {view === 'front' ? 'Vue de face' : 'Vue de dos'}
                  </span>
                  <ul className="m-0 grid list-none grid-cols-4 gap-x-2 gap-y-3 p-0">
                    {(Object.keys(muscleMapPaths[view].zones) as MuscleZone[]).map((zone) => (
                      <li key={zone} className="flex flex-col items-center gap-1">
                        <MuscleMap primary={[]} zones={[zone]} view={view} size={44} />
                        <span className="text-caption">{zone}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </Card>
          </Demo>
          <Demo label="Exercices de la bibliothèque (vue choisie automatiquement)">
            <Card as="div" padding="none" className="px-4 py-1">
              {SAMPLE_EXERCISES.map((e) => (
                <ListRow
                  key={e.name}
                  leading={<ExerciseThumb primary={e.muscles.primary} />}
                  title={e.name}
                  subtitle={e.muscles.primary.map(muscleLabel).join(', ')}
                />
              ))}
            </Card>
            <div className="rounded-ds-lg bg-inverse p-4 text-on-inverse">
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {SAMPLE_EXERCISES.map((e) => (
                  <li key={e.name} className="flex items-center gap-3">
                    <ExerciseThumb primary={e.muscles.primary} tone="dark" />
                    <span className="text-headline">{e.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Demo>
          <Demo label="Pictogrammes d’aliments : 24 px et tuile 40 px">
            <Card as="div" padding="none" className="px-4 py-1">
              {FOOD_CATEGORIES.map(([category, name]) => (
                <ListRow
                  key={category}
                  leading={<FoodTile category={category} />}
                  title={name}
                  subtitle={category}
                  trailing={<FoodPictogram category={category} />}
                />
              ))}
            </Card>
          </Demo>
          <Demo label="Tuile avec badge code-barres · portion du frigo · photo en erreur (repli)">
            <div className="flex items-center gap-4">
              <FoodTile category="dairy" badge="barcode" />
              <FoodTile category="dish" fromFridge />
              <FoodTile category="fruit" photoUrl="data:image/png;base64,AAAA" />
            </div>
          </Demo>
        </Section>

        <SessionDemos />
      </div>

      <TabBar current={tab} hrefs={TAB_HREFS} onPlus={() => setLogOpen(true)} onSelect={setTab} />

      {dayOpen !== null && (
        <DaySummarySheet
          day={{ ...DEMO_DAY, title: `Résumé du ${dayOpen}` }}
          onClose={() => setDayOpen(null)}
        />
      )}
      {sheetOpen && (
        <Sheet title="Quantité" description="Exemple de feuille" onClose={() => setSheetOpen(false)}>
          <Stepper label="Portions" value={2} min={1} max={10} onChange={() => undefined} />
          <Button variant="primary" fullWidth onClick={() => setSheetOpen(false)}>
            Ajouter au journal
          </Button>
        </Sheet>
      )}
      {logOpen && (
        <LogSheet
          meal={meal}
          meals={MEALS}
          onMealChange={setMeal}
          createEntries={DEMO_CREATE}
          otherEntries={DEMO_OTHERS}
          onAction={(a) => {
            setLastAction(a)
            setLogOpen(false)
          }}
          onStartSession={() => {
            setLastAction(null)
            setLogOpen(false)
          }}
          onClose={() => setLogOpen(false)}
        />
      )}
    </div>
  )
}
