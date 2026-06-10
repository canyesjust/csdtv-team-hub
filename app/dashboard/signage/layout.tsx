'use client'

import { SignageProvider } from './components/SignageProvider'

export default function SignageDashboardLayout({ children }: { children: React.ReactNode }) {
  return <SignageProvider>{children}</SignageProvider>
}
