import Link from 'next/link'

const stats = [
  { value: '01', label: 'Satu alur race day' },
  { value: 'Live', label: 'Hasil publik' },
  { value: 'Multi', label: 'Stage dan batch' },
  { value: 'Ready', label: 'Jury workflow' },
]

export default function PerformanceStats() {
  return (
    <section className="homepage-editorial-performance-shell">
      <div className="homepage-editorial-performance">
        <div className="homepage-editorial-performance-copy">
          <p className="homepage-editorial-section-kicker">Race day system</p>
          <h2>
            Compose your <mark>race flow</mark>
          </h2>
          <p>
            Dari registrasi sampai hasil akhir, setiap peran bekerja pada data yang sama dan urutan moto yang sama.
          </p>

          <div className="homepage-editorial-allocation-card">
            <div className="homepage-editorial-allocation-head">
              <strong>Race flow</strong>
              <span>Controlled</span>
            </div>
            <div className="homepage-editorial-allocation-bar" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="homepage-editorial-allocation-legend">
              <span>Registration</span>
              <span>Gate</span>
              <span>Jury</span>
              <span>Results</span>
            </div>
          </div>
        </div>

        <div className="homepage-editorial-performance-panel">
          <div className="homepage-editorial-performance-fields">
            {stats.map((stat) => (
              <div key={stat.label} className="homepage-editorial-performance-field">
                <span className="homepage-editorial-performance-check">✓</span>
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </div>

          <Link href="/dashboard" className="homepage-editorial-performance-action">
            Buka event
            <span aria-hidden="true">✦</span>
          </Link>
        </div>
      </div>
    </section>
  )
}
