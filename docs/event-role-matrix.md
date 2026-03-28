# Event Role Matrix

Dokumen ini menetapkan pembagian akses per event.

## Mapping Role
- `SUPER_ADMIN` = Central Admin
- `ADMIN` = Operator Admin
- `CHECKER` = Field Operator
- `FINISHER` = Field Operator
- `MC` = Field Operator
- `RACE_DIRECTOR` = Field Operator
- `RACE_CONTROL` = Field Operator

## Prinsip
- Akses dibaca dalam konteks event yang sedang dikerjakan.
- `SUPER_ADMIN` dapat mengakses semua event.
- `ADMIN` mengakses event yang dia operasikan.
- Role lapangan hanya mengakses halaman operasional sesuai tugasnya.

## Matrix Akses Per Event

| Area / Fitur | SUPER_ADMIN | ADMIN | CHECKER | FINISHER | MC | RACE_DIRECTOR | RACE_CONTROL |
|---|---|---|---|---|---|---|---|
| Lihat daftar event | Ya | Ya | Terbatas event tugas | Terbatas event tugas | Terbatas event tugas | Terbatas event tugas | Terbatas event tugas |
| Buat event | Ya | Ya | Tidak | Tidak | Tidak | Tidak | Tidak |
| Edit event basic settings | Ya | Ya | Tidak | Tidak | Tidak | Tidak | Tidak |
| Edit `business_settings` | Ya | Ya | Tidak | Tidak | Tidak | Tidak | Tidak |
| Edit pricing / registration settings | Ya | Ya | Tidak | Tidak | Tidak | Tidak | Tidak |
| Kelola categories | Ya | Ya | Tidak | Tidak | Tidak | Tidak | Tidak |
| Kelola riders | Ya | Ya | Tidak | Tidak | Tidak | Tidak | Tidak |
| Kelola registrations / approve | Ya | Ya | Tidak | Tidak | Tidak | Tidak | Tidak |
| Kelola schedule / motos / live draw | Ya | Ya | Tidak | Tidak | Tidak | Tidak | Tidak |
| Checker / safety check | Ya | Ya | Ya | Tidak | Tidak | Tidak | Tidak |
| Finisher / submit hasil | Ya | Ya | Tidak | Ya | Tidak | Tidak | Tidak |
| MC display / live board | Ya | Ya | Tidak | Tidak | Ya | Tidak | Tidak |
| Race Director approval / override | Ya | Ya | Tidak | Tidak | Tidak | Ya | Tidak |
| Race Control queue / monitor | Ya | Ya | Tidak | Tidak | Tidak | Tidak | Ya |
| Export result / rider list | Ya | Ya | Terbatas | Terbatas | Terbatas | Ya | Ya |
| User management global | Ya | Tidak | Tidak | Tidak | Tidak | Tidak | Tidak |
| Audit lintas event | Ya | Tidak | Tidak | Tidak | Tidak | Ya (event terkait) | Ya (event terkait) |

## Aturan `business_settings`

### `SUPER_ADMIN`
Boleh edit semua field:
- `public_brand_name`
- `public_event_title`
- `public_tagline`
- `event_owner_name`
- `event_owner_type`
- `operating_committee_name`
- `operating_committee_label`
- `scoring_support_name`
- `scoring_support_label`
- `central_control_enabled`
- `requires_platform_approval`
- semua flag visibilitas publik

### `ADMIN`
Untuk saat ini boleh edit semua `business_settings` pada event yang dia kelola.

Catatan operasional:
- perubahan brand event sebaiknya tetap dikonfirmasi ke Central Admin
- jika event milik pihak eksternal, `Event Owner`, `Operating Committee`, dan `Scoring Support` harus disepakati sebelum publish

### Field Operator
Tidak boleh edit `business_settings`.

## SOP Per Event

### Event internal KRB
- `SUPER_ADMIN`: tim pusat / owner platform
- `ADMIN`: admin operator KRB
- field operator: tim lapangan KRB

### Event eksternal dengan operator lain
Contoh:
- Event Owner: Kampar Runbike
- Operating Committee: RC Balabila
- Scoring Support: KRB

Role:
- `SUPER_ADMIN`: kamu / central admin
- `ADMIN`: operator admin RC Balabila
- field operator: checker / finisher / MC / RD / race control event tersebut

## Keputusan Saat Ini
Model ini dipakai dulu sebelum ada sistem organizer yang lebih formal.
Artinya:
- role tetap sederhana
- pembagian kerja dibaca per event
- `business_settings` tetap level event
