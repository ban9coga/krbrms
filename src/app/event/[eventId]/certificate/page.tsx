import type { Metadata } from 'next'
import CertificateClient from './CertificateClient'
import { canonicalMetadata } from '../../../../lib/seoMetadata'

export async function generateMetadata({ params }: { params: Promise<{ eventId: string }> }): Promise<Metadata> {
  const { eventId } = await params
  return canonicalMetadata(`/event/${eventId}/certificate`)
}

export default async function CertificatePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <CertificateClient eventId={eventId} />
}
