import type { HTMLAttributes, ReactNode } from 'react'

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-2xl border border-v1-line bg-v1-surface p-4 ${className}`} {...props} />
}

/** Section d'écran avec titre h2 et action optionnelle à droite. */
export function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="mt-8 first-of-type:mt-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2.5 text-sm text-red-200">
      {children}
    </p>
  )
}

export function SuccessNote({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-200">
      {children}
    </p>
  )
}
