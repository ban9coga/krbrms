# KRBRMS Codebase Patterns & Conventions Analysis

**Project:** KRB Racing Management System (krb-scoring-system)  
**Tech Stack:** Next.js 16.1.6, React 19.2.3, TypeScript 5, Tailwind CSS 4, Supabase 2.94.1  
**Analysis Date:** 2026-07-14

---

## 1. Component Naming Conventions & Structure

### Naming Conventions
- **PascalCase** for component file names (e.g., `EventCard.tsx`, `ThemeProvider.tsx`, `StatusBadge.tsx`)
- Components are typically named as functional components, exported as default exports
- Component file names match the component function name

### Component Structure Patterns
**Example Pattern - EventCard.tsx:**
```typescript
'use client'  // Client component directive at top

import Link from 'next/link'
import Image from 'next/image'
import type { EventItem } from '../lib/eventService'
import { buildGoogleMapsUrl } from '../lib/publicLinks'

// Type definitions at the top
export default function EventCard({
  event,
  index = 0,
  logoUrl,
  slogan,
  canRegister = true,
  variant = 'default',
}: {
  event: EventItem
  index?: number
  logoUrl?: string | null
  slogan?: string | null
  canRegister?: boolean
  variant?: 'default' | 'editorial'
}) {
  // Component body
}
```

### Component Types
1. **Presentational Components** - Stateless, accept props, render UI
   - `StatusBadge.tsx` - Shows status labels with conditional styling
   - `EmptyState.tsx` - Displays empty state messages
   - `EventCard.tsx` - Displays event information cards

2. **Container/Provider Components** - Manage state and provide context
   - `ThemeProvider.tsx` - Manages theme state (light/dark) with context
   - `PwaRegister.tsx` - PWA registration logic

3. **Top-level Layout Components** - Used in pages/layouts
   - `MarketingTopbar.tsx`
   - `LandingTopbar.tsx`
   - `CheckerTopbar.tsx`
   - `PublicTopbar.tsx`

### Component Organization
- Components stored in `src/components/` directory
- Flat structure (no subdirectories) with 22 reusable components
- No component-specific subdirectories or co-located styles

---

## 2. Service/Lib Functions Naming and Organization

### Directory Structure

**`src/lib/` (25 files)** - Business logic, utilities, and data manipulation
```
advancedRaceDefaults.ts
auth.ts
bestTeam.ts
categoryAssignment.ts
communityShowcase.ts
eventService.ts
imageUpload.ts
liveEvent.ts
motoDisplayOrder.ts
motoLock.ts
motoSequence.ts
motoStatus.ts
nonFinishScoring.ts
plate.ts
printTheme.ts
publicLinks.ts
publicMedia.ts
rateLimit.ts
registrationEmail.ts
registrationNotificationLogs.ts
registrationUploadConfig.ts
registrationUploads.ts
riderExtraCategory.ts
roles.ts
structuredData.ts
supabaseClient.ts
```

**`src/services/` (13 files)** - Complex, computation-heavy, or multi-step operations
```
absentResolver.ts
advancedRaceAuto.ts
awardResolver.ts
categoryOccupancy.ts
categoryResolver.ts
juryAuth.ts
moto3Reseed.ts
motoProgression.ts
motoSequenceNormalizer.ts
penaltyService.ts
raceStageEngine.ts
rankingResolver.ts
riderParticipationStatus.ts
```

### Naming Patterns

**Function Names:**
- **camelCase** for all function names
- **Descriptive action verbs** at start: `get`, `fetch`, `resolve`, `normalize`, `compute`, `build`, `load`, `list`, `sum`, `assert`, `add`, `clone`

**Examples:**
- `getAccessibleEventIds()` - Query and return data
- `normalizeAppRole()` - Transform and standardize data
- `buildGoogleMapsUrl()` - Construct URLs
- `computeQualification()` - Complex calculation
- `loadCustomSplitRules()` - Async data loading
- `assertMotoEditable()` - Validation/assertion check

### Lib vs Services Distinction

**`lib/`** - Used for:
- Utility functions
- Database query wrappers
- Data transformation helpers
- Authentication/authorization logic
- Configuration management
- External service integration (Supabase client)
- URL/link builders
- UI-related utilities

**`services/`** - Used for:
- Complex business logic operations
- Multi-step algorithms
- Race stage progression
- Scoring/ranking calculations
- State resolution with dependencies
- 'use server' marked functions for server-side operations

### Export Patterns

**Named Exports for Utilities:**
```typescript
export const normalizeAppRole = (value: string | null | undefined) => {
  // implementation
}

export const formatAppRoleLabel = (value: string | null | undefined) => {
  // implementation
}

export const isEventAdminRole = (value: string | null | undefined) => {
  // implementation
}
```

**Type Exports:**
```typescript
export type EventStatus = 'UPCOMING' | 'LIVE' | 'FINISHED'
export type EventSponsorTier = 'TITLE' | 'MAIN' | 'SUPPORT' | 'MEDIA' | 'COMMUNITY' | 'PARTNER'

export type EventSponsor = {
  id?: string | null
  name?: string | null
  // ... properties
}
```

**Const Exports:**
```typescript
export const missingPrimaryCategoryMigrationMessage =
  'Database belum siap untuk category utama rider. Jalankan migration...'
```

---

## 3. API Route Structure and Patterns

### Route Organization
```
src/app/api/
├── admin/
│   ├── dashboard/
│   ├── events/
│   └── storage/
├── auth/
│   └── backoffice-access/
├── categories/
├── events/
├── internal/
├── jury/
├── media/
├── motos/
├── public/
│   ├── events/
│   └── registration-status/
├── race-control/
├── race-director/
├── riders/
└── super-admin/
```

### Route Naming Conventions
- **Folder structure maps to URL paths**
- **`route.ts`** - Main handler file per folder
- Route methods use HTTP verbs: `GET`, `POST`, `PUT`, `DELETE`
- Nested folders create nested routes

### API Handler Patterns

**Basic GET Route Pattern:**
```typescript
import { NextResponse } from 'next/server'
import { requireBackoffice } from '../../../../lib/auth'

export async function GET(req: Request) {
  // 1. Parse query parameters
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  // 2. Authentication check
  const auth = await requireBackoffice(req.headers.get('authorization'))
  
  // 3. Authorization check
  if (!auth.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 4. Build query conditionally
  let query = adminClient.from('events').select('...')
  if (status) {
    query = query.eq('status', status)
  }

  // 5. Execute query
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // 6. Return response
  return NextResponse.json({ data })
}
```

### Response Patterns
- **Success responses** use `NextResponse.json({ data: ... })`
- **Error responses** include `status` codes (400, 403, 429)
- **Rate limit headers** included: `Retry-After`, `X-RateLimit-*`

**Error Response Pattern:**
```typescript
if (error) {
  return NextResponse.json(
    { error: error.message },
    { status: 400 }
  )
}
```

### Authentication Patterns
- **Bearer token** in Authorization header: `Authorization: Bearer <token>`
- Custom auth helper functions: `requireAdmin()`, `requireBackoffice()`
- Role-based access control (RBAC) checks before operations

---

## 4. Type Definitions and Interfaces Usage

### Type Definition Locations
1. **Inline in component files** - For component-specific props
   ```typescript
   type Props = {
     label: string
     tone?: 'light' | 'dark'
   }
   ```

2. **In lib/service files** - For domain types
   ```typescript
   export type EventStatus = 'UPCOMING' | 'LIVE' | 'FINISHED'
   export type EventItem = { id: string; name: string; ... }
   ```

3. **Imported from type-specific modules**
   ```typescript
   import type { EventItem } from '../lib/eventService'
   ```

### Type Naming Conventions
- **PascalCase** for type names
- **Suffixes used:**
  - `Item` - Single domain entity (e.g., `EventItem`, `CommunityShowcaseItem`)
  - `Config` - Configuration objects (e.g., `NonFinishPenaltyConfig`)
  - `Status` - Union type of statuses
  - `Stage` - Stage/phase enumeration
  - `Row` - Database row representation
  - `Settings` - Configuration settings

### Union Types (Discriminated Unions)
```typescript
type AuthSuccess = {
  ok: true
  user: AuthUser
  role: string
  eventRole: string | null
}

type AuthFailure = { ok: false }

type Result = AuthSuccess | AuthFailure
```

### Nullable Property Patterns
```typescript
export type EventSponsor = {
  id?: string | null
  name?: string | null
  tier?: EventSponsorTier | null
  // properties are optional AND nullable
}
```

### Type Re-exports with `import type`
```typescript
// Importing types
import type { EventItem } from '../lib/eventService'
import type { Metadata } from 'next'

// Exporting types
export type { PenaltyStage, PenaltyRule } from './penaltyService'
```

### Record Type Usage
```typescript
const statusConfig: Record<EventItem['status'], { label: string; className: string }> = {
  LIVE: { label: 'Live', className: 'bg-emerald-500/90 text-white ...' },
  UPCOMING: { label: 'Upcoming', className: 'bg-amber-500/90 ...' },
  FINISHED: { label: 'Completed', className: 'bg-slate-800/90 ...' },
}
```

---

## 5. Folder Organization and File Structure Patterns

### Top-Level Structure
```
krbrms-git/
├── src/
│   ├── app/                    # Next.js app directory
│   │   ├── api/               # API routes
│   │   ├── admin/             # Admin pages
│   │   ├── dashboard/         # Dashboard pages
│   │   ├── event/             # Event pages
│   │   ├── login/             # Auth pages
│   │   └── layout.tsx         # Root layout
│   ├── components/            # Reusable React components
│   ├── hooks/                 # Custom React hooks
│   ├── lib/                   # Utilities & business logic
│   ├── services/              # Complex business logic
│   └── app/globals.css        # Global styles
├── public/                    # Static assets
├── scripts/                   # Build/utility scripts
├── docs/                      # Documentation
├── backups/                   # Backup data
└── package.json
```

### `src/app/` Structure (Next.js App Router)
- **Pages**: Folder with `page.tsx` → creates route
- **Layouts**: Folder with `layout.tsx` → wraps child routes
- **Middleware**: Top-level `middleware.ts` → runs before requests
- **Dynamic segments**: `[id]` folders → dynamic routes
- **API routes**: `api/` folder with `route.ts` files

### Naming Conventions by Directory

**Pages and Layouts:**
- Kebab-case for folder names: `admin-events`, `race-control`, `live-results`
- Index files: `page.tsx`, `layout.tsx`, `route.ts`

**Components:**
- PascalCase file names: `EventCard.tsx`, `ThemeProvider.tsx`

**Utilities:**
- camelCase file names: `eventService.ts`, `categoryAssignment.ts`
- Describe what module exports/provides

**API Routes:**
- Kebab-case folder names: `backoffice-access`, `race-control`
- Always use `route.ts` as handler file

---

## 6. Import/Export Patterns

### Import Ordering Convention
```typescript
// 1. React imports
'use client'
import { useCallback, useState } from 'react'

// 2. Next.js imports
import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { NextResponse } from 'next/server'

// 3. External library imports
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'

// 4. Internal imports (lib)
import { adminClient, requireAdmin } from '../../../../lib/auth'
import type { EventItem } from '../lib/eventService'

// 5. Internal imports (components)
import EventCard from '../components/EventCard'
```

### Type Imports
```typescript
// Use 'import type' for type-only imports
import type { EventItem } from '../lib/eventService'
import type { Metadata } from 'next'

// Reduces bundle size - types are removed at compile time
```

### Relative vs Absolute Path Imports
- **Relative paths** used throughout: `../lib/auth`, `../../../../lib/auth`
- **Path alias configured** in `tsconfig.json`: `@/*` → `./*` (but not heavily used)
- Projects generally prefers relative imports for local packages

### Export Patterns

**Default Exports - Components:**
```typescript
export default function EventCard({ event, index }: Props) {
  // component
}
```

**Named Exports - Utilities:**
```typescript
export const normalizeAppRole = (value: string) => { }
export const isEventAdminRole = (value: string) => { }
export const formatAppRoleLabel = (value: string) => { }
```

**Mixed Exports:**
```typescript
// One default + multiple named
export const utility1 = () => { }
export const utility2 = () => { }
export default function Component() { }
```

---

## 7. React Hooks and Custom Hooks Usage

### Built-in Hooks Usage

**useState:**
```typescript
'use client'
const [highVisibility, setHighVisibility] = useState(() => {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(storageKey) === '1'
})
```

**useCallback:**
```typescript
const toggleHighVisibility = useCallback(() => {
  setHighVisibility((current) => {
    const next = !current
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, next ? '1' : '0')
    }
    return next
  })
}, [storageKey])
```

**useContext:**
```typescript
const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
```

**useSyncExternalStore:**
```typescript
// Used to avoid hydration mismatches with theme
const mounted = useSyncExternalStore(
  () => () => undefined,
  () => true,
  () => false
)
```

**useId:**
```typescript
const id = useId()
return (
  <label htmlFor={id}>
    <input id={id} type="checkbox" />
  </label>
)
```

### Custom Hooks

**File: `src/hooks/useHighVisibility.ts`**
```typescript
'use client'

import { useCallback, useState } from 'react'

export function useHighVisibility(storageKey: string) {
  const [highVisibility, setHighVisibility] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(storageKey) === '1'
  })

  const toggleHighVisibility = useCallback(() => {
    setHighVisibility((current) => {
      const next = !current
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey, next ? '1' : '0')
      }
      return next
    })
  }, [storageKey])

  return { highVisibility, toggleHighVisibility }
}
```

**Naming Convention:** `use` prefix (React convention)

**Custom Hook Patterns:**
- Encapsulate stateful logic
- Return object with state values and updater functions
- Commonly manage local storage persistence

### Hydration Safety Pattern
```typescript
if (typeof window === 'undefined') {
  // Server-side: return default value
  return false
}
// Client-side: access window object
return window.localStorage.getItem(storageKey) === '1'
```

---

## 8. CSS/Styling Approach (Tailwind CSS)

### Tailwind CSS Configuration
- **Version:** Tailwind CSS 4.0
- **PostCSS plugin:** @tailwindcss/postcss
- **Global styles:** `src/app/globals.css`

### Class Application Patterns

**Simple Component Styling:**
```typescript
export default function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/75 p-4 text-sm font-semibold text-slate-500">
      {label}
    </div>
  )
}
```

**Conditional Class Names:**
```typescript
const toneClass =
  tone === 'dark'
    ? 'border-white/25 bg-white/15 text-white'
    : isLive
    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
    : isUpcoming
    ? 'border-sky-200 bg-sky-50 text-sky-700'
    : 'border-slate-200 bg-slate-100 text-slate-700'

return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-extrabold tracking-[0.08em] ${toneClass}`} />
```

**Dynamic Class Concatenation:**
```typescript
className={`setting-toggle-control ${className}`.trim()}
```

**Record Object for Theme/Config:**
```typescript
const statusConfig: Record<EventItem['status'], { label: string; className: string }> = {
  LIVE: { label: 'Live', className: 'bg-emerald-500/90 text-white ring-emerald-300/40' },
  UPCOMING: { label: 'Upcoming', className: 'bg-amber-500/90 text-white ring-amber-300/40' },
  FINISHED: { label: 'Completed', className: 'bg-slate-800/90 text-white ring-slate-400/30' },
}
```

### Color/Theme Patterns
- **Semantic colors:** emerald (success), amber (warning), slate (neutral), sky (info), red (error)
- **Opacity modifiers:** `/90`, `/75`, `/50`, `/25`, `/15` for layering
- **Ring variants:** `ring-{color}/{opacity}` for focus/active states

### Responsive Design
- Patterns observed use consistent spacing: `p-4`, `px-3 py-1`, `rounded-2xl`, `rounded-full`
- Border utilities: `border`, `border-dashed`, `border-{color}/{opacity}`
- Typography: `text-xs`, `text-sm`, `font-semibold`, `font-extrabold`

### CSS Modules (Not Used in Project)
- No CSS modules found in components
- All styling is inline Tailwind classes

### Custom CSS Classes (If Used)
```typescript
// Examples from ToggleSwitch component
className="setting-toggle-control"
className="setting-toggle"
className="setting-toggle-slider"
className="setting-toggle-knob"
className="setting-toggle-copy"
className="setting-toggle-label"
className="setting-toggle-status"
```

---

## 9. Error Handling Patterns

### Error Handling in Database Operations
```typescript
const { data, error } = await adminClient
  .from('events')
  .select('id, name, location, event_date, status')
  .eq('id', eventId)

if (error) {
  return NextResponse.json({ error: error.message }, { status: 400 })
}

// Or with throw:
if (error) {
  throw new Error(error.message)
}
```

### Error Handling in Service Functions
**Service functions commonly throw errors:**
```typescript
export async function listPenaltyRules(eventId: string) {
  const { data, error } = await adminClient
    .from('event_penalty_rules')
    .select('...')
    .eq('event_id', eventId)

  if (error) throw new Error(error.message)
  return (data ?? []) as PenaltyRule[]
}
```

### Validation Error Messages (User-Facing)
```typescript
if (!isImageFile(file)) {
  throw new Error(`${label} harus berupa gambar.`)
}

if (file.size > maxBytes) {
  throw new Error(`${label} terlalu besar. Maksimal ${(maxBytes / (1024 * 1024)).toFixed(1)} MB.`)
}

if (input.length === 0) {
  throw new Error(`${label} kosong atau gagal dibaca.`)
}
```

### Assertion Pattern
```typescript
export const assertMotoEditable = (motoStatus: string | null) => {
  // If condition fails, throws error
  if (motoStatus === 'LOCKED') {
    throw new Error('Moto sudah terkunci dan tidak dapat diubah.')
  }
}

// Usage:
assertMotoEditable(params.moto_status ?? null)
```

### Error Detection Pattern
```typescript
export const isMissingPrimaryCategoryColumnError = (message?: string | null) => {
  const normalized = String(message ?? '').toLowerCase()
  return (
    normalized.includes('primary_category_id') &&
    (normalized.includes('column') ||
     normalized.includes('schema cache') ||
     normalized.includes('could not find the'))
  )
}

// Usage in error handling:
if (isMissingPrimaryCategoryColumnError(error?.message)) {
  // Handle specific error
}
```

### Rate Limiting Error Response
```typescript
const blockedResponse = (headers: Record<string, string>) =>
  NextResponse.json(
    { error: 'Terlalu banyak percobaan. Coba lagi beberapa saat.' },
    { status: 429, headers }
  )
```

### Try-Catch Pattern (Less Common)
```typescript
try {
  const buffer = await sharp(input, { failOn: 'none' })
    .rotate()
    .resize({ /* ... */ })
    .webp({ quality })
    .toBuffer()

  return { buffer, contentType: 'image/webp', extension: 'webp' }
} catch {
  throw new Error(`${label} gagal diproses. Coba upload gambar JPG/PNG/WebP yang valid.`)
}
```

### Result Type Pattern (Tagged Union)
```typescript
type Result = AuthSuccess | AuthFailure

type AuthSuccess = { ok: true; user: AuthUser; role: string; eventRole: string | null }
type AuthFailure = { ok: false }

// Usage:
const auth = await requireBackoffice(authHeader)
if (!auth.ok) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
// auth is now typed as AuthSuccess
console.log(auth.user.id)
```

---

## 10. Authentication/Security Patterns

### Client Architecture
- **Service Role Client** (`adminClient`) - Uses service key for backend operations
- **Anon Client** (`authClient`) - Uses anon key for user operations
- **Browser Client** (`supabase`) - Used in client components

### Authentication Helpers (from `auth.ts`)

**User Extraction:**
```typescript
const getAuthenticatedUser = async (authHeader?: string | null) => {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}
```

**Global Role Resolution:**
```typescript
const getGlobalRole = (user: AuthUser) => {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>
  const role =
    (typeof meta.role === 'string' ? meta.role : null) ||
    (typeof appMeta.role === 'string' ? appMeta.role : null)
  return normalizeAppRole(role)
}
```

**Event-Level Role Resolution:**
```typescript
const getEventRole = async (userId: string, eventId?: string | null) => {
  if (!eventId) return null
  const { data, error } = await adminClient
    .from('user_event_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('event_id', eventId)
    .eq('is_active', true)

  if (error || !data?.length) return null

  const prioritized = data
    .map((row) => normalizeAppRole(typeof row.role === 'string' ? row.role : ''))
    .filter(Boolean)
    .sort((a, b) => roleWeight(a) - roleWeight(b))

  return prioritized[0] ?? null
}
```

### Role Hierarchy & Weighting
```typescript
const roleWeight = (role: string) => {
  if (role === 'SUPER_ADMIN') return 0     // Highest
  if (role === 'ADMIN') return 1
  if (role === 'REGISTRATION_APPROVER') return 2
  if (role === 'RACE_DIRECTOR') return 3
  if (role === 'RACE_CONTROL') return 4
  if (role === 'CHECKER') return 5
  if (role === 'FINISHER') return 6
  if (role === 'MC') return 7
  return 99                                // Lowest
}
```

### Authorization Functions

**Global Admin Check:**
```typescript
export const requireAdmin = async (authHeader?: string | null, eventId?: string | null) => {
  const user = await getAuthenticatedUser(authHeader)
  if (!user) return { ok: false }
  
  const globalRole = getGlobalRole(user)
  const eventRole = await getEventRole(user.id, eventId)
  
  if (eventId) {
    if (globalRole === 'SUPER_ADMIN') {
      return { ok: true, user, role: globalRole, eventRole }
    }
    if (eventRole !== 'ADMIN' && eventRole !== 'SUPER_ADMIN') return { ok: false }
    return { ok: true, user, role: eventRole, eventRole }
  }
  
  if (globalRole !== 'ADMIN' && globalRole !== 'SUPER_ADMIN') return { ok: false }
  return { ok: true, user, role: globalRole, eventRole }
}
```

**Backoffice Access Check:**
```typescript
export const requireBackoffice = async (authHeader?: string | null) => {
  // Less restrictive - allows backoffice staff
  const user = await getAuthenticatedUser(authHeader)
  if (!user) return { ok: false }
  
  const globalRole = getGlobalRole(user)
  const isAllowed = ['SUPER_ADMIN', 'ADMIN', 'REGISTRATION_APPROVER'].includes(globalRole)
  
  if (!isAllowed) return { ok: false }
  return { ok: true, user, role: globalRole, eventRole: null }
}
```

### Role Normalization
```typescript
export const normalizeAppRole = (value: string | null | undefined) => {
  const upper = String(value ?? '').trim().toUpperCase()
  if (!upper) return ''
  if (upper === 'JURY_START') return 'CHECKER'
  if (upper === 'JURY_FINISH') return 'FINISHER'
  if (upper === 'RACE_CONTROL') return 'RACE_CONTROL'
  // ... maps various role formats to canonical names
  return upper
}
```

### Role Checking Predicates
```typescript
export const isEventAdminRole = (value: string | null | undefined) => {
  const role = normalizeAppRole(value)
  return role === 'SUPER_ADMIN' || role === 'ADMIN'
}

export const canAccessAdminWorkspace = (value: string | null | undefined) => {
  const role = normalizeAppRole(value)
  return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'REGISTRATION_APPROVER'
}

export const isRegistrationApproverRole = (value: string | null | undefined) => {
  return normalizeAppRole(value) === 'REGISTRATION_APPROVER'
}
```

### Role Label Formatting
```typescript
export const formatAppRoleLabel = (value: string | null | undefined) => {
  const role = normalizeAppRole(value)
  if (role === 'SUPER_ADMIN') return 'Central Admin'
  if (role === 'ADMIN') return 'Operator Admin'
  if (role === 'REGISTRATION_APPROVER') return 'Registration Approver'
  if (role === 'CHECKER') return 'Checker'
  if (role === 'FINISHER') return 'Finisher'
  if (role === 'RACE_DIRECTOR') return 'Race Director'
  if (role === 'RACE_CONTROL') return 'Race Control'
  if (role === 'MC') return 'MC'
  return role || 'Unknown'
}
```

### Accessible Events Query
```typescript
export const getAccessibleEventIds = async (userId: string, allowedRoles: string[]) => {
  // Returns list of event IDs user can access with given roles
  const allowed = allowedRoles.map((role) => normalizeAppRole(role)).filter(Boolean)
  if (allowed.length === 0) return []

  const { data, error } = await adminClient
    .from('user_event_roles')
    .select('event_id, role')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (error || !data?.length) return []

  return Array.from(
    new Set(
      data
        .filter((row) => allowed.includes(normalizeAppRole(typeof row.role === 'string' ? row.role : '')))
        .map((row) => row.event_id)
        .filter((eventId): eventId is string => typeof eventId === 'string' && eventId.length > 0)
    )
  )
}
```

### Server Action Pattern
```typescript
'use server'  // Marks this file as server-side only

import { adminClient } from '../lib/auth'
import { assertMotoEditable } from '../lib/motoLock'

export async function addRiderPenalty(params: { ... }) {
  assertMotoEditable(params.moto_status ?? null)  // Validation
  
  const { error } = await adminClient.from('rider_penalties').insert([...])
  if (error) throw new Error(error.message)
  
  return { ok: true }
}
```

### Rate Limiting (Security)
```typescript
const memoryRateLimit = (req: Request, options: RateLimitOptions): RateLimitResult => {
  const ip = getClientIp(req)
  const bucketKey = `${options.key}:${ip}`
  
  // Track requests per IP per time window
  entry.count += 1
  
  if (entry.count > options.limit) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Terlalu banyak percobaan. Coba lagi beberapa saat.' },
        { status: 429, headers }
      ),
    }
  }
  
  return { ok: true, headers }
}
```

### Client IP Detection
```typescript
const getClientIp = (req: Request) => {
  const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return (
    req.headers.get('cf-connecting-ip')?.trim() ||  // Cloudflare
    req.headers.get('x-real-ip')?.trim() ||         // Nginx
    forwardedFor ||                                  // Load balancer
    'unknown'
  )
}
```

### Security Headers (in Next.js Config)
```typescript
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Content-Security-Policy', value: '...' },
]
```

### Password Verification
```typescript
export const verifyPasswordForAuthHeader = async (authHeader: string | null | undefined, password: string) => {
  const user = await getAuthenticatedUser(authHeader)
  if (!user?.email || !password) return false
  
  const { error } = await authClient.auth.signInWithPassword({
    email: user.email,
    password,
  })
  
  return !error  // Returns boolean
}
```

---

## 11. Server vs Client Components Pattern

### Server Components (Default)
- Files without `'use client'` directive
- Default in Next.js 13+ app directory
- Cannot use hooks (useState, useEffect, etc.)
- Direct database access
- Environment variables available

**Example - Page with Server-Side Data Fetching:**
```typescript
export const revalidate = 30

export async function RootLayout({ children }: { children: React.ReactNode }) {
  const liveEvent = await getLiveEvent()  // Server-only code

  return (
    <html lang="id">
      <body>
        {children}
        <FloatingLiveScoreButton hasLiveEvent={Boolean(liveEvent)} />
      </body>
    </html>
  )
}
```

### Client Components
- Explicitly marked with `'use client'` directive at top of file
- Can use React hooks
- Cannot directly access backend resources
- Execute in browser

**Example - Client Component with Hooks:**
```typescript
'use client'

import { useCallback, useState } from 'react'

export function useHighVisibility(storageKey: string) {
  const [highVisibility, setHighVisibility] = useState(...)
  const toggleHighVisibility = useCallback(...)
  
  return { highVisibility, toggleHighVisibility }
}
```

---

## 12. Data Access Patterns

### Direct Supabase Client Usage
```typescript
export const adminClient = createClient(supabaseUrl, supabaseServiceKey)
const authClient = createClient(supabaseUrl, supabaseAnonKey)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

### Query Building Pattern
```typescript
let query = adminClient
  .from('events')
  .select('id, name, location, event_date, status')
  .order('event_date', { ascending: false })

if (status) {
  query = query.eq('status', status)
}

if (roleWeight < 2) {
  query = query.in('id', accessibleEventIds)
}

const { data, error } = await query
```

### Batch Operations
```typescript
const payload = rules.map((r) => ({
  event_id: toEventId,
  code: r.code,
  description: r.description,
  penalty_point: r.penalty_point,
  applies_to_stage: r.applies_to_stage,
}))

const { error } = await adminClient.from('event_penalty_rules').insert(payload)
```

### Filtering Collections
```typescript
const rows = data.filter((row) => row.source_stage === sourceStage)

const eventIds = events
  .map((row) => String(row.id ?? ''))
  .filter(Boolean)

const prioritized = data
  .map((row) => normalizeAppRole(...))
  .filter(Boolean)
  .sort((a, b) => roleWeight(a) - roleWeight(b))
```

### Type Casting Patterns
```typescript
const events = (data ?? []) as Array<Record<string, unknown>>
const rows = (data ?? []) as CustomSplitRuleRow[]
const payload = rules.map(...) as PenaltyRule[]
```

---

## Summary of Key Patterns

| Area | Pattern |
|------|---------|
| **Components** | PascalCase names, default exports, props typed inline |
| **Utilities** | camelCase functions, named exports, grouped by domain |
| **API Routes** | HTTP verb methods, Bearer token auth, NextResponse.json |
| **Types** | Exported types with `export type`, union types for results |
| **Imports** | Relative paths preferred, `import type` for types only |
| **Styling** | Tailwind CSS only, conditional classes with ternary operators |
| **Hooks** | Built-in hooks + custom hooks with `use` prefix |
| **Error Handling** | Throw errors in services, return errors in API routes |
| **Auth** | Role-based access control, role weighting, event-level roles |
| **Data Access** | Direct Supabase client, query building, batch operations |

