type FeatureItem = {
  title: string
  description: string
}

const features: FeatureItem[] = [
  {
    title: 'Real-Time Scoring Engine',
    description: 'Track every heat instantly with low-latency updates and accurate race standings.',
  },
  {
    title: 'Role-Based Access Control',
    description: 'Manage permissions for admin, jury, race director, and operator with clear boundaries.',
  },
  {
    title: 'TV Optimized Display Mode',
    description: 'Present live race data on big screens with clean layouts built for audience visibility.',
  },
  {
    title: 'Category & Batch Automation',
    description: 'Generate categories and race batches faster using structured event automation rules.',
  },
  {
    title: 'Penalty & Approval Workflow',
    description: 'Handle penalties and approvals through a controlled flow to keep decisions transparent.',
  },
  {
    title: 'Cloud-Based Infrastructure',
    description: 'Run events reliably from anywhere with centralized data and scalable cloud deployment.',
  },
]

export default function CoreFeatures() {
  return (
    <section className="w-full bg-slate-950">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-white md:text-4xl">
          Built for Competitive Race Environment
        </h2>

        <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
          {features.map((feature) => (
            <article
              key={feature.title}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-8 transition-shadow duration-300 hover:shadow-lg hover:shadow-slate-950/70"
            >
              <div className="mb-5 h-10 w-10 rounded-full bg-slate-700/70" />
              <h3 className="text-xl font-semibold text-white">{feature.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">{feature.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
