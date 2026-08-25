import ContentEditorClient from '../ContentEditorClient'

export default async function ContentEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ContentEditorClient contentId={id} />
}
