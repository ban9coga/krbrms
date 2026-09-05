import { getEventSetupChecklist } from './actions'

const statusIcon = {
  done: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-green-500">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
        clipRule="evenodd"
      />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-yellow-500">
      <path
        fillRule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </svg>
  ),
  todo: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-red-400">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
        clipRule="evenodd"
      />
    </svg>
  ),
}

const statusLabel = {
  done: 'Selesai',
  warning: 'Perlu Perhatian',
  todo: 'Belum Dikonfigurasi',
}

const statusRowClass = {
  done: 'border-green-200 bg-green-50',
  warning: 'border-yellow-200 bg-yellow-50',
  todo: 'border-red-200 bg-red-50',
}

export default async function ChecklistPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const items = await getEventSetupChecklist(eventId)

  const doneCount = items.filter((i) => i.status === 'done').length
  const total = items.length
  const percent = Math.round((doneCount / total) * 100)

  const todoCount = items.filter((i) => i.status === 'todo').length
  const warningCount = items.filter((i) => i.status === 'warning').length

  return (
    <div className="admin-container grid gap-6">
      {/* Header */}
      <div className="admin-card grid gap-4">
        <div>
          <div className="admin-kicker">Event Setup</div>
          <h1 className="admin-heading text-2xl">Checklist Konfigurasi Event</h1>
          <p className="admin-muted mt-1 text-sm">
            Pastikan semua item di bawah sudah dikonfigurasi sebelum event dimulai.
          </p>
        </div>

        {/* Progress bar */}
        <div className="grid gap-2">
          <div className="flex items-center justify-between text-sm font-semibold">
            <span className="admin-muted">Progress Setup</span>
            <span className="admin-heading">
              {doneCount}/{total} item selesai
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className={`h-3 rounded-full transition-all duration-500 ${
                percent === 100 ? 'bg-green-500' : percent >= 60 ? 'bg-yellow-400' : 'bg-red-400'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-4 text-xs font-medium">
            <span className="flex items-center gap-1 text-green-600">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              {doneCount} selesai
            </span>
            {warningCount > 0 && (
              <span className="flex items-center gap-1 text-yellow-600">
                <span className="h-2 w-2 rounded-full bg-yellow-400" />
                {warningCount} perlu perhatian
              </span>
            )}
            {todoCount > 0 && (
              <span className="flex items-center gap-1 text-red-500">
                <span className="h-2 w-2 rounded-full bg-red-400" />
                {todoCount} belum dikonfigurasi
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Checklist Items */}
      <div className="grid gap-3">
        {items.map((item) => (
          <a
            key={item.key}
            href={item.href}
            className={`flex items-start gap-4 rounded-xl border p-4 transition-all hover:shadow-md ${statusRowClass[item.status]}`}
          >
            <div className="mt-0.5 shrink-0">{statusIcon[item.status]}</div>
            <div className="flex-1 grid gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="admin-heading text-base">{item.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    item.status === 'done'
                      ? 'bg-green-100 text-green-700'
                      : item.status === 'warning'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-red-100 text-red-600'
                  }`}
                >
                  {statusLabel[item.status]}
                </span>
              </div>
              <p className="admin-muted text-sm">{item.description}</p>
              {item.detail && (
                <p
                  className={`text-xs font-medium mt-1 ${
                    item.status === 'done'
                      ? 'text-green-700'
                      : item.status === 'warning'
                        ? 'text-yellow-700'
                        : 'text-red-600'
                  }`}
                >
                  {item.detail}
                </p>
              )}
            </div>
            <div className="shrink-0 self-center">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4 text-gray-400"
              >
                <path
                  fillRule="evenodd"
                  d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </a>
        ))}
      </div>

      {percent === 100 && (
        <div className="admin-card border-green-300 bg-green-50 text-center">
          <p className="text-green-700 font-semibold text-lg">
            🎉 Semua konfigurasi sudah lengkap! Event siap dijalankan.
          </p>
        </div>
      )}
    </div>
  )
}
