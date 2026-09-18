'use client'

import { useState, useEffect } from 'react'

export function usePushSubscription(eventId: string, riderId: string) {
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true)
      checkSubscription()
    }
  }, [])

  const checkSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        setIsSubscribed(false)
        return
      }

      // Verify with server if this specific rider is subscribed to this endpoint
      const url = new URL(`/api/public/events/${eventId}/push-subscriptions`, window.location.origin)
      url.searchParams.set('rider_id', riderId)
      url.searchParams.set('endpoint', subscription.endpoint)
      
      const res = await fetch(url.toString())
      if (res.ok) {
        const json = await res.json()
        setIsSubscribed(!!json.subscribed)
      } else {
        setIsSubscribed(false)
      }
    } catch (err) {
      console.error('Failed to check push subscription:', err)
      setIsSubscribed(false)
    }
  }

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  }

  const subscribe = async () => {
    setError(null)
    setIsLoading(true)
    try {
      if (Notification.permission === 'denied') {
        throw new Error('Push notifications are blocked. Please enable them in your browser settings.')
      }

      const registration = await navigator.serviceWorker.ready
      
      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        if (!vapidPublicKey) {
          throw new Error('VAPID public key is not configured.')
        }

        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        })
      }

      // Send to server
      const res = await fetch(`/api/public/events/${eventId}/push-subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rider_id: riderId,
          subscription: subscription.toJSON(),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save subscription on server.')
      }

      setIsSubscribed(true)
    } catch (err: any) {
      console.error('Subscription error:', err)
      setError(err.message || 'An error occurred while subscribing.')
    } finally {
      setIsLoading(false)
    }
  }

  const unsubscribe = async () => {
    setError(null)
    setIsLoading(true)
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      
      if (subscription) {
        const endpoint = subscription.endpoint
        
        // Remove from server
        await fetch(`/api/public/events/${eventId}/push-subscriptions`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rider_id: riderId,
            endpoint: endpoint,
          }),
        })

        // Unsubscribe locally
        await subscription.unsubscribe()
      }
      setIsSubscribed(false)
    } catch (err: any) {
      console.error('Unsubscribe error:', err)
      setError(err.message || 'An error occurred while unsubscribing.')
    } finally {
      setIsLoading(false)
    }
  }

  return {
    isSupported,
    isSubscribed,
    isLoading,
    error,
    subscribe,
    unsubscribe,
  }
}
