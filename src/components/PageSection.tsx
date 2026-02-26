type Props = {
  title: string
  children: React.ReactNode
}

export default function PageSection({ title, children }: Props) {
  return (
    <section className="mb-8 grid gap-4">
      <h2 className="text-2xl font-black tracking-tight text-slate-900 md:text-3xl">{title}</h2>
      <div className="grid gap-3">{children}</div>
    </section>
  )
}
