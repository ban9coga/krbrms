export default function LoadingState({ label = 'Memuat...' }: { label?: string }) {
  return (
    <div style={{ padding: '12px 0', color: '#333', fontWeight: 600 }}>
      {label}
    </div>
  )
}
