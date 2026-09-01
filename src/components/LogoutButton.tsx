'use client'

type LogoutButtonProps = {
  onClick: () => void | Promise<void>
}

export default function LogoutButton({ onClick }: LogoutButtonProps) {
  return (
    <button type="button" onClick={onClick} className="role-logout-button" aria-label="Keluar dari akun" title="Keluar dari akun">
      <span className="role-logout-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 17l5-5-5-5" />
          <path d="M15 12H3" />
          <path d="M21 3v18" />
        </svg>
      </span>
      <span className="role-logout-label">Keluar</span>
    </button>
  )
}
