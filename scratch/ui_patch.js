const fs = require('fs');
const file = 'src/app/jc/[eventId]/[motoId]/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. NEXT MOTO PREP badge smaller
const oldNextMotoPrepBadge = `          <div
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: '2px solid #166534',
              background: '#dcfce7',
              color: '#166534',
              fontWeight: 900,
            }}
          >
            NEXT MOTO PREP
          </div>`;

const newNextMotoPrepBadge = `          <div
            style={{
              padding: '3px 8px',
              borderRadius: 999,
              border: '2px solid #166534',
              background: '#dcfce7',
              color: '#166534',
              fontWeight: 900,
              fontSize: 10,
            }}
          >
            NEXT MOTO PREP
          </div>`;

content = content.replace(oldNextMotoPrepBadge, newNextMotoPrepBadge);

// 2. Moto name more prominent
const oldMotoName = `<div style={{ fontSize: highVisibility ? (isCompactLayout ? 22 : 26) : isCompactLayout ? 18 : 22, fontWeight: 950, color: '#111827' }}>
              {selectedMoto?.moto_name ?? 'Belum ada moto prep'}
            </div>`;
const newMotoName = `<div style={{ fontSize: highVisibility ? (isCompactLayout ? 26 : 32) : isCompactLayout ? 24 : 30, fontWeight: 950, color: '#111827', textTransform: 'uppercase' }}>
              {selectedMoto?.moto_name ?? 'Belum ada moto prep'}
            </div>`;

content = content.replace(oldMotoName, newMotoName);

// 3. Category more prominent
const oldCategory = `<span
                style={{
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: '1.5px solid #166534',
                  background: '#f0fdf4',
                  color: '#166534',
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                {selectedCategoryLabel}
              </span>`;
const newCategory = `<span
                style={{
                  padding: '6px 14px',
                  borderRadius: 999,
                  border: '2px solid #166534',
                  background: '#f0fdf4',
                  color: '#166534',
                  fontSize: 16,
                  fontWeight: 900,
                }}
              >
                {selectedCategoryLabel}
              </span>`;

content = content.replace(oldCategory, newCategory);

// 4. Badges updates
const oldBadges = `<div style={{ display: 'grid', gridTemplateColumns: prepSummaryColumns, gap: 8 }}>
            <span
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: '2px solid #111',
                background: flags.dns_enabled ? '#dcfce7' : '#fee2e2',
                color: flags.dns_enabled ? '#166534' : '#991b1b',
                fontWeight: 900,
              }}
            >
              DNS {flags.dns_enabled ? 'ON' : 'OFF'}
            </span>
            <span
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: '2px solid #111',
                background: flags.dnf_enabled ? '#dcfce7' : '#fee2e2',
                color: flags.dnf_enabled ? '#166534' : '#991b1b',
                fontWeight: 900,
              }}
            >
              DNF {flags.dnf_enabled ? 'ON' : 'OFF'}
            </span>
            <span style={{ padding: '6px 12px', borderRadius: 999, border: '2px solid #111', fontWeight: 900 }}>
              Total: {summary.total}
            </span>
            <span
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: '2px solid #111',
                background: '#dcfce7',
                fontWeight: 900,
              }}
            >
              READY: {summary.active}
            </span>
            <span
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: '2px solid #111',
                background: '#e5e7eb',
                fontWeight: 900,
              }}
            >
              BELUM DICEK: {summary.unchecked}
            </span>
            <span
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: '2px solid #111',
                background: '#fee2e2',
                fontWeight: 900,
              }}
            >
              ABSENT: {summary.absent}
            </span>
          </div>`;

const newBadges = `<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                border: '2px solid #111',
                background: '#dcfce7',
                fontWeight: 900,
                fontSize: 12,
              }}
            >
              READY: {summary.active}
            </span>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                border: '2px solid #111',
                background: '#e5e7eb',
                fontWeight: 900,
                fontSize: 12,
              }}
            >
              BELUM DICEK: {summary.unchecked}
            </span>
            <span
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                border: '2px solid #111',
                background: '#fee2e2',
                fontWeight: 900,
                fontSize: 12,
              }}
            >
              ABSENT: {summary.absent}
            </span>
          </div>`;

content = content.replace(oldBadges, newBadges);

fs.writeFileSync(file, content, 'utf8');
console.log('UI patches applied successfully');
