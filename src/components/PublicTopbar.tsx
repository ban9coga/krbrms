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
        background: 'rgba(255,255,255,0.9)',
        borderBottom: '2px solid #111',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
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
          <div style={{ fontWeight: 800 }}>KRB Race Management System</div>
        </Link>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {showRegister &&
            (onRegisterClick ? (
              <button
                type="button"
                onClick={onRegisterClick}
                style={{
                  padding: '8px 12px',
                  borderRadius: '999px',
                  border: '2px solid #111',
                  background: '#34c759',
                  color: '#111',
                  fontWeight: 800,
                  textDecoration: 'none',
                  fontSize: '12px',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Daftar Rider
              </button>
            ) : (
              <Link
                href="/"
                style={{
                  padding: '8px 12px',
                  borderRadius: '999px',
                  border: '2px solid #111',
                  background: '#34c759',
                  color: '#111',
                  fontWeight: 800,
                  textDecoration: 'none',
                  fontSize: '12px',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                Daftar Rider
              </Link>
            ))}
          <Link
            href="/login"
            style={{
              padding: '8px 12px',
              borderRadius: '999px',
              border: '2px solid #111',
              background: '#2ecc71',
              color: '#111',
              fontWeight: 800,
              textDecoration: 'none',
              fontSize: '12px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Login
          </Link>
        </div>
      </div>
    </header>
  )
}
