/**
 * Page de démonstration du kit (`/dev/ui`) : en développement, ou dans un build qui définit `VITE_DEV_UI=1`
 * (les tests e2e, qui tournent contre `vite preview`). Jamais dans le build de production : la condition devient
 * fausse à la compilation, la route et le lien disparaissent et le chunk de la page n'est pas généré (même
 * condition recopiée dans App.tsx pour l'`import()`).
 */
export const DEV_UI_ENABLED: boolean = import.meta.env.DEV || import.meta.env.VITE_DEV_UI === '1'
