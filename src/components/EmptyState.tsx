export default function EmptyState({ label }: { label: string }) {
  return (
    <div style={{ padding: '12px 0', color: '#555', fontWeight: 600 }}>
      {label}
    </div>
  )
}
