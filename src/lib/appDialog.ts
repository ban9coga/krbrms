export type AppDialogKind = 'alert' | 'confirm' | 'prompt'

export type AppDialogRequest = {
  id: number
  kind: AppDialogKind
  message: string
  defaultValue?: string
  resolve: (value: boolean | string | null) => void
}

let queue: AppDialogRequest[] = []
let nextId = 1
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

export function subscribeAppDialogs(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getActiveAppDialog() {
  return queue[0] ?? null
}

function request<T extends boolean | string | null>(
  kind: AppDialogKind,
  message: string,
  defaultValue?: string,
) {
  return new Promise<T>((resolve) => {
    queue = [...queue, {
      id: nextId++,
      kind,
      message,
      defaultValue,
      resolve: resolve as (value: boolean | string | null) => void,
    }]
    notify()
  })
}

export function appAlert(message: string) {
  void request<null>('alert', message)
}

export function appConfirm(message: string) {
  return request<boolean>('confirm', message)
}

export function appPrompt(message: string, defaultValue = '') {
  return request<string | null>('prompt', message, defaultValue)
}

export function settleAppDialog(value: boolean | string | null) {
  const [active, ...rest] = queue
  if (!active) return
  queue = rest
  active.resolve(value)
  notify()
}
