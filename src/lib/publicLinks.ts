export const buildGoogleMapsUrl = (name?: string | null, location?: string | null) => {
  const query = [location?.trim(), name?.trim()].filter(Boolean).join(', ')
  if (!query) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

export const buildQrCodeUrl = (value: string, size = 160) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`
