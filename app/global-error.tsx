'use client'

import ErrorView from './ErrorView'

// Catches errors thrown in the root layout itself (where the normal error boundary
// cannot render). Must provide its own <html>/<body>.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <ErrorView error={error} reset={reset} />
      </body>
    </html>
  )
}
