import { redirect } from 'next/navigation'

const SUMATERA_GRAND_PRIX_2026_ID = 'f2c9cb1f-88ab-4b59-9c67-de3599ff0bbb'

export default function SumateraGrandPrix2026ShortLink() {
  redirect(`/event/${SUMATERA_GRAND_PRIX_2026_ID}`)
}

