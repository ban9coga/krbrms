import CoreFeatures from '../components/CoreFeatures'
import HeroRace from '../components/HeroRace'
import LivePreviewSection from '../components/LivePreviewSection'
import OrganizerCTA from '../components/OrganizerCTA'
import PerformanceStats from '../components/PerformanceStats'

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f6fbf7', color: '#111' }}>
      <main>
        <HeroRace />
        <LivePreviewSection />
        <CoreFeatures />
        <PerformanceStats />
        <OrganizerCTA />
      </main>

      <footer
        style={{
          borderTop: '1px solid rgba(15, 23, 42, 0.12)',
          padding: '24px 20px 32px',
          textAlign: 'center',
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        KRB Race Management System
      </footer>
    </div>
  )
}
