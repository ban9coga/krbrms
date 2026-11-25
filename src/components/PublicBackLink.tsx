import Link from 'next/link'
import type { ReactNode } from 'react'

export default function PublicBackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 w-fit max-w-full items-center gap-2 rounded-full border border-[#bca990] bg-[#fff8e8] px-4 py-2 text-sm font-extrabold text-[#4f372b] transition-colors hover:border-[#a83b16] hover:text-[#a83b16] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a83b16]"
    >
      <span aria-hidden="true">←</span>
      <span>{children}</span>
    </Link>
  )
}
