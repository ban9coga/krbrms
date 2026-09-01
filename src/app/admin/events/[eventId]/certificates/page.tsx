import CertificateAdminClient from './CertificateAdminClient'

export default async function EventCertificatesPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <CertificateAdminClient eventId={eventId} />
}
