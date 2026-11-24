import type { PublicRacepackItem, RegistrationBundleOption } from '../lib/eventService'

type PublicEventFactsProps = {
  organizer?: string | null
  raceDirector?: string | null
  mc?: string | null
  contactName?: string | null
  contactPhone?: string | null
  basePrice?: number | null
  upclassPrice?: number | null
  bundleInfoEnabled?: boolean
  bundleInfo?: string | null
  racepackInfoEnabled?: boolean
  racepackInfo?: string | null
  registrationBundles?: RegistrationBundleOption[] | null
  racepackItems?: PublicRacepackItem[] | null
}

const formatPrice = (value: number) =>
  value === 0 ? 'Gratis' : `Rp ${new Intl.NumberFormat('id-ID').format(value)}`

export default function PublicEventFacts({
  organizer,
  raceDirector,
  mc,
  contactName,
  contactPhone,
  basePrice,
  upclassPrice,
  bundleInfoEnabled,
  bundleInfo,
  racepackInfoEnabled,
  racepackInfo,
  registrationBundles,
  racepackItems,
}: PublicEventFactsProps) {
  const activeBundles = (registrationBundles ?? []).filter((item) => item.enabled)
  const includedRacepackItems = (racepackItems ?? []).filter((item) => item.included)
  const bundle = bundleInfoEnabled && activeBundles.length === 0 ? bundleInfo?.trim() : ''
  const racepack = racepackInfoEnabled && includedRacepackItems.length === 0 ? racepackInfo?.trim() : ''
  const cleanContactPhone = contactPhone?.trim() || ''
  const contactDigits = cleanContactPhone.replace(/\D/g, '')
  const whatsappDigits = contactDigits.startsWith('0') ? `62${contactDigits.slice(1)}` : contactDigits
  const contactWhatsappUrl = whatsappDigits.length >= 9 && whatsappDigits.length <= 15
    ? `https://wa.me/${whatsappDigits}`
    : null
  const hasDetails = Boolean(organizer || raceDirector || mc || contactName || cleanContactPhone || bundle || racepack || activeBundles.length || includedRacepackItems.length)
  const hasPrice = typeof basePrice === 'number' || typeof upclassPrice === 'number'

  if (!hasDetails && !hasPrice) return null

  return (
    <section className="public-event-facts-card grid gap-3 rounded-[1.35rem] border border-[#dfd1b8] bg-[#fff8e8] p-3.5 text-[#1d0d07] shadow-[0_12px_28px_rgba(55,23,9,0.08)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:p-4">
      <div className="grid min-w-0 gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#9a3b16]">Informasi pendaftaran</p>
        {hasPrice ? (
          <div className="flex flex-wrap gap-2">
            {typeof basePrice === 'number' && (
              <div className="public-event-facts-tile min-w-[120px] rounded-xl border border-[#e2d5bd] bg-white/70 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#796657]">Biaya daftar</p>
                <p className="text-sm font-black text-[#1d0d07]">{formatPrice(basePrice)}</p>
              </div>
            )}
            {typeof upclassPrice === 'number' && (
              <div className="public-event-facts-tile min-w-[120px] rounded-xl border border-[#e2d5bd] bg-white/70 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#796657]">Biaya upclass</p>
                <p className="text-sm font-black text-[#1d0d07]">{formatPrice(upclassPrice)}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm font-semibold text-[#5f4638]">Lihat informasi panitia dan fasilitas event.</p>
        )}
      </div>

      {hasDetails && (
        <details className="group min-w-0 sm:justify-self-end">
          <summary className="flex min-h-11 w-full cursor-pointer list-none items-center justify-center gap-2 rounded-full bg-[#1d0d07] px-4 py-2 text-xs font-black text-[#fff8e8] transition-colors hover:bg-[#3a1d11] sm:w-auto [&::-webkit-details-marker]:hidden">
            Informasi Event
            <span aria-hidden="true" className="text-[#f3c63d] transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <div className="public-event-facts-details mt-3 grid gap-3 rounded-xl border border-[#e2d5bd] bg-white/70 p-3 text-xs leading-5 text-[#3f2b20]">
            {(organizer || raceDirector || mc || contactName || cleanContactPhone) && (
              <div className="grid gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#9a3b16]">Panitia & official</p>
                {organizer && <p><strong>Panitia:</strong> {organizer}</p>}
                {raceDirector && <p><strong>Race Director:</strong> {raceDirector}</p>}
                {mc && <p><strong>MC:</strong> {mc}</p>}
                {(contactName || cleanContactPhone) && (
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
                    <span><strong>CP Panitia:</strong> {contactName || 'Panitia'}{cleanContactPhone ? ` · ${cleanContactPhone}` : ''}</span>
                    {cleanContactPhone && contactWhatsappUrl && (
                      <a href={contactWhatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center rounded-full border border-[#1d0d07]/20 px-3 font-extrabold text-[#1d0d07] underline underline-offset-2">
                        Hubungi via WhatsApp
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}
            {(bundle || racepack || activeBundles.length > 0 || includedRacepackItems.length > 0) && (
              <div className="grid gap-2 border-t border-[#e2d5bd] pt-2">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#9a3b16]">Paket peserta</p>
                {activeBundles.length > 0 ? (
                  <div className="grid gap-1.5">
                    <strong>Pilihan bundling:</strong>
                    {activeBundles.map((item) => (
                      <p key={item.id}>{item.name} · {item.price === 0 ? 'tanpa biaya tambahan' : `+ ${formatPrice(item.price)}`}{item.description ? ` — ${item.description}` : ''}</p>
                    ))}
                  </div>
                ) : bundle && <p><strong>Bundling:</strong> {bundle}</p>}
                {includedRacepackItems.length > 0 ? (
                  <div className="grid gap-1.5">
                    <strong>Isi racepack:</strong>
                    <ul className="list-inside list-disc">
                      {includedRacepackItems.map((item) => <li key={item.id}>{item.name}</li>)}
                    </ul>
                  </div>
                ) : racepack && <p><strong>Racepack:</strong> {racepack}</p>}
              </div>
            )}
          </div>
        </details>
      )}
    </section>
  )
}
