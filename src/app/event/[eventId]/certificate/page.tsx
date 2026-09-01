import CertificateClient from './CertificateClient'

export default async function CertificatePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <CertificateClient eventId={eventId} />
}
