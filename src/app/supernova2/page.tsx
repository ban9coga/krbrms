import { redirect } from 'next/navigation'

const SUPERNOVA_SERIES_2_ID = 'ace137c2-a812-43f8-88e2-474c51c348e4'

export default function SupernovaSeries2ShortLink() {
  redirect(`/event/${SUPERNOVA_SERIES_2_ID}`)
}

