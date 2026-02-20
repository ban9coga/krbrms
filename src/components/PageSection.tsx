type Props = {
  title: string
  children: React.ReactNode
}

export default function PageSection({ title, children }: Props) {
  return (
    <section style={{ marginBottom: '28px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 900, marginBottom: '10px', letterSpacing: '-0.01em' }}>
        {title}
      </h2>
      {children}
    </section>
  )
}
