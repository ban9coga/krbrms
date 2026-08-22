import type { ReactNode } from 'react'
import DrawWorkspaceGuard from './DrawWorkspaceGuard'

export default function DrawWorkspaceLayout({ children }: { children: ReactNode }) {
  return <DrawWorkspaceGuard>{children}</DrawWorkspaceGuard>
}
