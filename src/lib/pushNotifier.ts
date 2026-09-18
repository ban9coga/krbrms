import webpush from 'web-push'

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const privateKey = process.env.VAPID_PRIVATE_KEY
const subject = process.env.VAPID_SUBJECT

if (publicKey && privateKey && subject) {
  webpush.setVapidDetails(subject, publicKey, privateKey)
} else {
  console.warn('Web Push VAPID keys are not fully configured in environment variables.')
}

export type PushPayload = {
  title: string
  body: string
  icon?: string
  data?: Record<string, unknown>
}

export type WebPushSubscription = {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

export async function sendPushNotification(
  subscription: WebPushSubscription,
  payload: PushPayload
) {
  if (!publicKey || !privateKey || !subject) {
    return { ok: false, error: 'Web Push is not configured on the server.' }
  }

  try {
    const stringPayload = JSON.stringify(payload)
    const result = await webpush.sendNotification(subscription, stringPayload)
    return { ok: true, statusCode: result.statusCode }
  } catch (error: unknown) {
    const err = error as webpush.WebPushError
    if (err.statusCode === 410 || err.statusCode === 404) {
      return { ok: false, error: 'GONE', statusCode: err.statusCode }
    }
    return { ok: false, error: err.message || 'Unknown push error', statusCode: err.statusCode }
  }
}
