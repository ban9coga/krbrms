import type { ReactNode } from 'react'

type FeatureItem = {
  title: string
  description: string
  icon: ReactNode
}

const iconClass = 'h-5 w-5 text-amber-300'

const SpeedIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClass}>
    <path d="M4 13a8 8 0 1 1 16 0" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 13l4-4" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="13" r="1.2" fill="currentColor" stroke="none" />
  </svg>
)

const ShieldIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClass}>
    <path d="M12 3l7 3v6c0 4.4-2.8 8.3-7 9.6-4.2-1.3-7-5.2-7-9.6V6l7-3z" strokeLinecap="round" />
    <path d="M9.5 12.2l1.8 1.8 3.2-3.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const ScreenIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClass}>
    <rect x="3.5" y="5.5" width="17" height="11" rx="1.8" />
    <path d="M8 20h8M12 16.5V20" strokeLinecap="round" />
  </svg>
)

const LayersIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClass}>
    <path d="M12 4l8 4-8 4-8-4 8-4z" strokeLinejoin="round" />
    <path d="M4 12l8 4 8-4M4 16l8 4 8-4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const WorkflowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClass}>
    <rect x="3.5" y="4" width="7" height="6" rx="1.5" />
    <rect x="13.5" y="14" width="7" height="6" rx="1.5" />
    <path d="M10.5 7h3a2 2 0 0 1 2 2v5" strokeLinecap="round" />
    <path d="M15.5 14l-1.8-1.8M15.5 14l1.8-1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const CloudIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClass}>
    <path
      d="M7.5 18h9a4.5 4.5 0 0 0 .8-8.9 6 6 0 0 0-11.3 2A3.8 3.8 0 0 0 7.5 18z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const features: FeatureItem[] = [
  {
    title: 'Real-Time Scoring Engine',
    description: 'Track every heat instantly with low-latency updates and accurate race standings.',
    icon: <SpeedIcon />,
  },
  {
    title: 'Role-Based Access Control',
    description: 'Manage permissions for admin, jury, race director, and operator with clear boundaries.',
    icon: <ShieldIcon />,
  },
  {
    title: 'TV Optimized Display Mode',
    description: 'Present live race data on big screens with clean layouts built for audience visibility.',
    icon: <ScreenIcon />,
  },
  {
    title: 'Category & Batch Automation',
    description: 'Generate categories and race batches faster using structured event automation rules.',
    icon: <LayersIcon />,
  },
  {
    title: 'Penalty & Approval Workflow',
    description: 'Handle penalties and approvals through a controlled flow to keep decisions transparent.',
    icon: <WorkflowIcon />,
  },
  {
    title: 'Cloud-Based Infrastructure',
    description: 'Run events reliably from anywhere with centralized data and scalable cloud deployment.',
    icon: <CloudIcon />,
  },
]

export default function CoreFeatures() {
  return (
    <section className="w-full bg-slate-950">
      <div className="mx-auto w-full max-w-[1500px] px-2 py-16 sm:px-4 sm:py-20 md:px-6 md:py-24">
        <p className="text-center text-xs font-extrabold uppercase tracking-[0.2em] text-amber-300">Core Capabilities</p>
        <h2 className="mt-3 text-center text-3xl font-extrabold tracking-tight text-white sm:text-4xl md:text-5xl">
          Fitur inti yang membuat platform ini terasa seperti sistem operasional, bukan sekadar website event.
        </h2>
        <p className="mx-auto mt-4 max-w-3xl text-center text-sm font-medium leading-7 text-slate-300 sm:text-base">
          Setiap modul dirancang untuk membantu tim lapangan bekerja lebih tenang, sambil tetap memberi tampilan publik yang modern.
        </p>

        <div className="mx-auto mt-10 grid max-w-[1120px] grid-cols-1 gap-6 sm:mt-12 md:grid-cols-3 md:gap-8">
          {features.map((feature) => (
            <article
              key={feature.title}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-950/70 md:p-8"
            >
              <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-amber-400/15 ring-1 ring-amber-300/25">
                {feature.icon}
              </div>
              <h3 className="text-lg font-semibold text-white md:text-xl">{feature.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-300 md:text-base">{feature.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
