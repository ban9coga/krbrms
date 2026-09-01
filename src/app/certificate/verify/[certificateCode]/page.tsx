import CertificateVerificationClient from './CertificateVerificationClient'

export default async function CertificateVerificationPage({ params }: { params: Promise<{ certificateCode: string }> }) {
  const { certificateCode } = await params
  return <CertificateVerificationClient certificateCode={certificateCode} />
}
