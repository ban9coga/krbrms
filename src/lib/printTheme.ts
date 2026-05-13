type PrintDocOptions = {
  title: string
  eyebrow: string
  heading: string
  subtitle?: string
  body: string
  pageSize?: 'A4 portrait' | 'A4 landscape'
}

export const buildBrandedPrintHtml = ({
  title,
  eyebrow,
  heading,
  subtitle = '',
  body,
  pageSize = 'A4 portrait',
}: PrintDocOptions) => `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      @page { size: ${pageSize}; margin: 12mm; }
      html, body {
        margin: 0;
        padding: 0;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      body {
        font-family: Arial, sans-serif;
        color: #0f172a;
        background:
          radial-gradient(circle at top left, rgba(251, 191, 36, 0.22), transparent 30%),
          radial-gradient(circle at top right, rgba(16, 185, 129, 0.18), transparent 28%),
          #f8fafc;
        padding: 18px;
      }
      .sheet {
        display: grid;
        gap: 16px;
      }
      .hero {
        border: 2px solid #0f172a;
        border-radius: 22px;
        padding: 18px 20px;
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #7c4a2f 100%);
        color: #ffffff;
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.16);
      }
      .eyebrow {
        display: inline-flex;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(255,255,255,0.12);
        border: 1px solid rgba(255,255,255,0.22);
        font-size: 10px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.16em;
      }
      h1 {
        margin: 10px 0 6px;
        font-size: 28px;
        line-height: 1.08;
      }
      .subtitle {
        font-size: 14px;
        font-weight: 700;
        color: rgba(255,255,255,0.82);
      }
      .section-card {
        border: 1px solid #cbd5e1;
        border-radius: 18px;
        padding: 14px;
        background: rgba(255,255,255,0.94);
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.07);
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .section-title {
        margin: 0 0 10px;
        font-size: 18px;
        font-weight: 900;
        color: #0f172a;
      }
      .meta-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 10px;
      }
      .meta-pill {
        display: inline-flex;
        align-items: center;
        padding: 4px 8px;
        border-radius: 999px;
        border: 1px solid #cbd5e1;
        background: #eff6ff;
        color: #334155;
        font-size: 11px;
        font-weight: 800;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      th, td {
        padding: 7px 9px;
        border-bottom: 1px solid #dbeafe;
        text-align: left;
      }
      th {
        background: #dbeafe;
        color: #0f172a;
        font-size: 11px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      tbody tr:nth-child(even) td {
        background: #f8fafc;
      }
      .empty {
        color: #64748b;
        font-style: italic;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <header class="hero">
        <div class="eyebrow">${eyebrow}</div>
        <h1>${heading}</h1>
        ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}
      </header>
      ${body}
    </div>
  </body>
</html>
`
