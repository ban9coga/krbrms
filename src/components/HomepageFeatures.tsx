import Link from 'next/link'

const features = [
  {
    number: '01',
    title: 'Registrasi',
    description: 'Daftarkan rider dan temukan event yang cocok untuk keluarga.',
  },
  {
    number: '02',
    title: 'Drawing Batch',
    description: 'Pantau jadwal moto, gate, dan urutan balapan dengan jelas.',
  },
  {
    number: '03',
    title: 'Live Score & e-sertifikat',
    description: 'Lihat hasil race dan sertifikat rider setelah perlombaan.',
  },
]

export default function HomepageFeatures() {
  return (
    <section className="homepage-features-section" aria-labelledby="homepage-features-title">
      <div className="homepage-features-inner">
        <p className="homepage-features-kicker">RacePushbike</p>
        <h2 id="homepage-features-title">Dari Registrasi, Drawing Batch sampai E-Certificate</h2>
        <div className="homepage-features-grid">
          {features.map((feature) => (
            <article className="homepage-feature-card" key={feature.number}>
              <span className="homepage-feature-number">{feature.number}</span>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
        <Link href="/jadwal-race-pushbike" className="homepage-features-link">
          Lihat jadwal event
        </Link>
      </div>
    </section>
  )
}
