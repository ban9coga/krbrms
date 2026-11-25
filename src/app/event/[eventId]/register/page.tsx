import type { Metadata } from 'next'
import RegisterClient from './RegisterClient'
import { canonicalMetadata } from '../../../../lib/seoMetadata'

export async function generateMetadata({ params }: { params: Promise<{ eventId: string }> }): Promise<Metadata> {
  const { eventId } = await params
  return canonicalMetadata(`/event/${eventId}/register`)
}

export default async function EventRegisterPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <RegisterClient eventId={eventId} />
}
