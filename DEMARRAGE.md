# Démarrage — à faire une seule fois

## Étape 1 — Prérequis sur ta machine (manuel, ~10 min)

Sur ta machine perso de préférence (les postes de 42 limitent souvent les installations).

1. **Node.js 20 LTS ou plus** : `node -v`
2. **Git** : `git --version`
3. **GitHub CLI** : `gh --version`, puis `gh auth login` (choisis GitHub.com, HTTPS, navigateur).
4. **Claude Code** : installe-le en suivant la doc officielle https://code.claude.com/docs, puis lance `claude` une fois pour te connecter.

## Étape 2 — Créer le dossier du projet

```bash
mkdir ~/sport-nutrition-app && cd ~/sport-nutrition-app
```

Décompresse le kit **dans** ce dossier, de façon à avoir :

```
sport-nutrition-app/
  CLAUDE.md
  DEMARRAGE.md
  .claude/settings.json
  .claude/agents/*.md        (7 agents)
  docs/SPEC.md  docs/ROADMAP.md  docs/PROGRESS.md  docs/IMPORT_FORMAT.md
```

⚠️ Le dossier `.claude` est caché : vérifie avec `ls -la`.

## Étape 3 — Lancer Claude Code et installer les plugins (manuel)

```bash
claude
```

Puis, dans Claude Code :

1. Tape `/plugin`, va dans **Discover** (marketplace officiel `claude-plugins-official`).
2. Installe ceux-ci s'ils apparaissent (les noms peuvent évoluer, fie-toi à la description) :
   - **frontend-design** — interfaces soignées plutôt que génériques
   - **code-review** ou **pr-review-toolkit** — relecture spécialisée
   - **typescript-lsp** — diagnostics TypeScript en direct
   - **learning-output-style** _(optionnel)_ — te fait écrire certains morceaux de code toi-même pour apprendre
     Commande équivalente : `/plugin install <nom>@claude-plugins-official`
3. Tape `/agents` : tu dois voir les 7 agents du projet. Sinon, vérifie que `.claude/agents/` est bien là.
4. Redémarre Claude Code si on te le demande.

Règle de prudence : n'installe que des plugins et skills officiels ou que tu as lus — ils peuvent exécuter du code.

## Étape 4 — Coller le prompt d'initialisation

Copie tout le bloc ci-dessous dans Claude Code. Conseil : passe en mode plan (`Shift+Tab`) pour qu'il te montre son plan avant d'agir.

```text
Tu es l'agent chef de ce projet. Lis d'abord CLAUDE.md, puis docs/SPEC.md, docs/ROADMAP.md, docs/PROGRESS.md
et les définitions dans .claude/agents/. Ensuite réalise le jalon J0 (Socle), et seulement lui.

1. Vérifications : versions de node, npm, git, gh, et `gh auth status`. Si quelque chose manque, arrête-toi et dis-moi quoi faire.

2. Projet : initialise un projet Vite React + TypeScript DANS ce dossier sans écraser les fichiers existants
   (CLAUDE.md, DEMARRAGE.md, docs/, .claude/). TypeScript en mode strict.
   Installe et configure : Tailwind CSS, vite-plugin-pwa (manifest en français, nom « Forge » provisoire,
   display standalone, theme sombre, icônes générées simples, service worker autoUpdate, tout en cache pour
   le hors-ligne), React Router (4 onglets vides : Séance, Nutrition, Progrès, Réglages, barre d'onglets en bas
   avec safe areas iPhone), Dexie, Zod, Recharts, @zxing/browser, Vitest + fake-indexeddb, Playwright
   (projet iPhone 13), ESLint + Prettier.
   Crée l'arborescence de CLAUDE.md (src/types, src/db, src/domain/training, src/domain/nutrition, src/content,
   src/ui, src/app, tests, e2e, scripts) avec un fichier index minimal dans chaque dossier.
   Scripts npm : dev (avec --host), build, preview, test, e2e, lint, typecheck.

3. Qualité : un test Vitest trivial et un test Playwright qui ouvre l'app et vérifie les 4 onglets.
   Délègue la vérification au sous-agent qa-tester, puis la relecture au sous-agent reviewer.

4. Git et GitHub : .gitignore adapté, `git init`, premier commit.
   Crée le dépôt GitHub avec gh : nom « sport-nutrition-app », PUBLIC (le dépôt ne contient aucune donnée
   personnelle ; GitHub Pages gratuit exige un dépôt public), puis pousse sur main.

5. Déploiement : workflow GitHub Actions qui build et publie sur GitHub Pages à chaque push sur main.
   Configure le `base` de Vite pour /sport-nutrition-app/ et le `scope`/`start_url` du manifest en conséquence.
   Active Pages (source : GitHub Actions) via gh. Attends la fin du premier déploiement et donne-moi l'URL.

6. Mets à jour docs/PROGRESS.md, committe, pousse.

7. Arrête-toi. Fais-moi un résumé court : ce qui est en place, l'URL, et la marche à suivre pour l'installer
   sur mon iPhone (Safari → Partager → Sur l'écran d'accueil) et vérifier qu'elle s'ouvre en mode avion.
   Ne commence pas J1 avant que je valide.
```

## Étape 5 — Les sessions suivantes

À chaque nouvelle session, il suffit d'écrire :

```text
Lis CLAUDE.md et docs/PROGRESS.md, puis réalise le jalon suivant de docs/ROADMAP.md en suivant
ton rôle d'agent chef. Arrête-toi à la fin du jalon pour que je valide.
```

Si une session devient longue, utilise `/compact` ou démarre une nouvelle session : `PROGRESS.md` garde le fil.

## Le Projet Claude « Coach » (sans coût d'API)

Crée un Projet dans Claude (claude.ai) nommé « Coach », colle dans ses instructions le bloc final de
`docs/IMPORT_FORMAT.md`. Copie l'adresse du projet : à partir du jalon J9, tu la colleras dans
l'app (Réglages → Claude) et le bouton « Demander à Claude » ouvrira directement ce projet.
En attendant J9 : copie le JSON que Claude te donne → app → Réglages → Importer.
