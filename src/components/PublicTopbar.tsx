import Link from 'next/link'

type PublicTopbarProps = {
  onRegisterClick?: () => void
  showRegister?: boolean
}

export default function PublicTopbar({ onRegisterClick, showRegister = true }: PublicTopbarProps) {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: '#fff',
        borderBottom: '1px solid rgba(15, 23, 42, 0.12)',
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 22px',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            textDecoration: 'none',
            color: '#111',
          }}
        >
          <img src="/krb-logo.png" alt="KRB Logo" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
          <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.01em' }}>
            KRB Race Management System
          </div>
        </Link>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {showRegister &&
            (onRegisterClick ? (
              <button
                type="button"
                onClick={onRegisterClick}
                style={{
                  padding: '8px 14px',
                  borderRadius: '999px',
                  border: '1px solid rgba(15, 23, 42, 0.18)',
                  background: '#34c759',
                  color: '#111',
                  fontWeight: 800,
                  textDecoration: 'none',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Daftar Rider di Sini
              </button>
            ) : (
              <Link
                href="/"
                style={{
                  padding: '8px 14px',
                  borderRadius: '999px',
                  border: '1px solid rgba(15, 23, 42, 0.18)',
                  background: '#34c759',
                  color: '#111',
                  fontWeight: 800,
                  textDecoration: 'none',
                  fontSize: '13px',
                }}
              >
                Daftar Rider di Sini
              </Link>
            ))}
          <Link
            href="/login"
            style={{
              padding: '8px 14px',
              borderRadius: '999px',
              border: '1px solid rgba(15, 23, 42, 0.18)',
              background: '#e9f7ef',
              color: '#111',
              fontWeight: 800,
              textDecoration: 'none',
              fontSize: '13px',
            }}
          >
            Login
          </Link>
        </div>
      </div>
    </header>
  )
}
