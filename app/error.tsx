'use client'

import ErrorView from './ErrorView'

// Route-segment error boundary: catches render/runtime errors in the app and shows a
// branded page with a retry, instead of Next's default error screen.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView error={error} reset={reset} />
}
