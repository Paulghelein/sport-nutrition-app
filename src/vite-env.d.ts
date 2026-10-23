/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `1` : inclut la page de démonstration du kit (`/dev/ui`) dans un build. Absent en production. */
  readonly VITE_DEV_UI?: string
}
