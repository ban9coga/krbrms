import { redirect } from 'next/navigation'

const SAWAHLUNTO_HERITAGE_CHAMPIONSHIP_2026_ID = 'a5082d77-722d-44ff-bad1-595ed8a85192'

export default function SawahluntoHeritageChampionshipShortLink() {
  redirect(`/event/${SAWAHLUNTO_HERITAGE_CHAMPIONSHIP_2026_ID}`)
}
