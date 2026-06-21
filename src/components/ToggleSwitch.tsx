'use client'

import { useId } from 'react'

type ToggleSwitchProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
  className?: string
}

const resolveStatus = (label: string, checked: boolean) => {
  const value = label.toLowerCase()
  if (value.includes('registrasi')) return checked ? 'Dibuka' : 'Ditutup'
  if (
    value.includes('tampil') ||
    value.includes('publik') ||
    value.includes('homepage') ||
    value.includes('event page') ||
    value.includes('live display')
  ) {
    return checked ? 'Tampil' : 'Disembunyikan'
  }
  return checked ? 'Aktif' : 'Nonaktif'
}

export default function ToggleSwitch({
  checked,
  onChange,
  label,
  disabled = false,
  className = '',
}: ToggleSwitchProps) {
  const id = useId()
  const status = resolveStatus(label, checked)

  return (
    <label className={`setting-toggle-control ${className}`.trim()} htmlFor={id}>
      <span className="setting-toggle">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          disabled={disabled}
        />
        <span className="setting-toggle-slider" />
        <span className="setting-toggle-knob" />
      </span>
      <span className="setting-toggle-copy">
        <span className="setting-toggle-label">{label}</span>
        <span className="setting-toggle-status">{status}</span>
      </span>
    </label>
  )
}
