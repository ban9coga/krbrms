type Props = {
  title: string
  children: React.ReactNode
}

export default function PageSection({ title, children }: Props) {
  return (
    <section style={{ marginBottom: '24px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '12px' }}>
        {title}
      </h2>
      {children}
    </section>
  )
}
