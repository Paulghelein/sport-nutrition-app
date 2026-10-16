// Messages de contexte et parsing des réponses de Claude (fonctions pures). Agent : nutrition-engine.
// `import` / `importTraining` utilisent Zod : ne charger ce module qu'à la demande (`import()` / écran lazy).
// `context` (messages envoyés) n'a aucune dépendance lourde : à importer directement depuis './context' par les
// boutons d'envoi, sans passer par ce barrel.

export * from './import'
export * from './importTraining'
export * from './context'
export * from './instructions'
export * from './videoLink'
