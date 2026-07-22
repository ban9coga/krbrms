const fs = require('fs');
const path = require('path');

const clientFile = path.resolve('src/app/admin/events/[eventId]/live-draw/LiveDrawClient.tsx');
let clientContent = fs.readFileSync(clientFile, 'utf8');

// Replace drawLogo and buildDrawBatchPngBlob
const drawLogoStart = clientContent.indexOf('const drawLogo = async');
const getFileNameStart = clientContent.indexOf('const sanitizeFileName =');

if (drawLogoStart !== -1 && getFileNameStart !== -1) {
  const newFns = `
  const drawLogo = async (ctx: CanvasRenderingContext2D, logoUrl: string | null) => {
    ctx.save()
    drawRoundRect(ctx, 64, 48, 116, 116, 28)
    ctx.fillStyle = '#111'
    ctx.fill()
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 2
    ctx.stroke()
    if (logoUrl) {
      try {
        const logo = await loadCanvasImage(logoUrl)
        const size = 92
        ctx.save()
        drawRoundRect(ctx, 76, 60, size, size, 20)
        ctx.clip()
        ctx.drawImage(logo, 76, 60, size, size)
        ctx.restore()
      } catch {
        ctx.fillStyle = '#f8ce3d'
        ctx.beginPath()
        ctx.arc(122, 106, 34, 0, Math.PI * 2)
        ctx.fill()
      }
    } else {
      ctx.fillStyle = '#f8ce3d'
      ctx.beginPath()
      ctx.arc(122, 106, 34, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  const buildDrawBatchPngBlob = async ({
    batchLabel,
    motos,
  }: {
    batchLabel: string
    motos: Array<{
      title: string
      rows: Array<{ gate: number; plate: string; name: string }>
    }>
  }) => {
    const canvas = document.createElement('canvas')
    canvas.width = 1920
    canvas.height = 1080
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas tidak tersedia.')

    // Dark gradient background
    const gradient = ctx.createLinearGradient(0, 0, 1920, 1080)
    gradient.addColorStop(0, '#1a1a1a')
    gradient.addColorStop(0.5, '#0e0e0e')
    gradient.addColorStop(1, '#050505')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 1920, 1080)

    // Checkered pattern subtle overlay
    ctx.fillStyle = 'rgba(255,255,255,0.02)'
    for (let i = -220; i < 2200; i += 120) {
      ctx.save()
      ctx.translate(i, 0)
      ctx.rotate(-0.35)
      ctx.fillRect(0, 0, 54, 2100)
      ctx.restore()
    }

    await drawLogo(ctx, eventLogoUrl)

    // Header Left Text
    ctx.textAlign = 'left'
    ctx.fillStyle = '#f8ce3d'
    ctx.font = 'italic 900 24px Arial, Helvetica, sans-serif'
    ctx.fillText('DRAW RESULT', 204, 86)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'italic 900 38px Arial, Helvetica, sans-serif'
    wrapCanvasText(ctx, eventName, 204, 132, 800, 42, 1)

    // Header Right Text
    ctx.textAlign = 'right'
    ctx.fillStyle = '#e9c400'
    ctx.font = 'italic 900 28px Arial, Helvetica, sans-serif'
    ctx.fillText(selectedCategoryLabel.toUpperCase(), 1856, 86)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'italic 900 64px Arial, Helvetica, sans-serif'
    ctx.fillText(batchLabel.toUpperCase(), 1856, 150)
    ctx.textAlign = 'left'

    // Calculate dynamic columns based on number of motos
    const numMotos = Math.max(1, motos.length)
    const gap = 32
    const totalWidth = 1792
    const colWidth = (totalWidth - (gap * (numMotos - 1))) / numMotos

    motos.forEach((moto, motoIndex) => {
      const x = 64 + (colWidth + gap) * motoIndex
      let y = 210

      // Moto Title BG
      drawRoundRect(ctx, x, y, colWidth, 54, 12)
      ctx.fillStyle = '#f8ce3d'
      ctx.fill()
      ctx.fillStyle = '#1c1b1b'
      ctx.font = 'italic 900 24px Arial, Helvetica, sans-serif'
      ctx.fillText(moto.title.toUpperCase(), x + 24, y + 36)
      y += 74

      moto.rows.slice(0, 14).forEach((row) => {
        const rowHeight = 64
        drawRoundRect(ctx, x, y, colWidth, rowHeight, 10)
        ctx.fillStyle = '#151515'
        ctx.fill()
        ctx.lineWidth = 2
        ctx.strokeStyle = '#2a2a2a'
        ctx.stroke()
        
        // Red accent line on left edge
        ctx.fillStyle = '#f8ce3d'
        ctx.beginPath()
        ctx.moveTo(x + 10, y)
        ctx.lineTo(x, y + 10)
        ctx.lineTo(x, y + rowHeight - 10)
        ctx.lineTo(x + 10, y + rowHeight)
        ctx.lineTo(x + 6, y + rowHeight)
        ctx.lineTo(x + 6, y)
        ctx.fill()

        ctx.fillStyle = '#ffffff'
        ctx.font = '900 22px Arial, Helvetica, sans-serif'
        ctx.fillText(\`G\${row.gate}\`, x + 34, y + 40)
        ctx.fillStyle = '#e9c400'
        ctx.fillText(row.plate, x + 84, y + 40)
        ctx.fillStyle = '#e5e2e1'
        ctx.font = '800 21px Arial, Helvetica, sans-serif'
        wrapCanvasText(ctx, row.name, x + 160, y + 27, colWidth - 170, 24, 1)
        y += rowHeight + 10
      })

      if (moto.rows.length > 14) {
        ctx.fillStyle = '#888'
        ctx.font = '900 20px Arial, Helvetica, sans-serif'
        ctx.fillText(\`+ \${moto.rows.length - 14} rider lainnya\`, x + 24, y + 18)
        y += 40
      }
    })

    // Footer
    ctx.fillStyle = '#151515'
    drawRoundRect(ctx, 64, 960, 1792, 70, 14)
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = '#2a2a2a'
    ctx.stroke()
    ctx.fillStyle = '#f8ce3d'
    ctx.font = '900 22px Arial, Helvetica, sans-serif'
    ctx.fillText('Cek nomor plate dan gate masing-masing sebelum race.', 96, 1004)

    const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', 1))
    if (!pngBlob) throw new Error('Gagal membuat PNG.')
    return pngBlob
  }

  `;
  clientContent = clientContent.substring(0, drawLogoStart) + newFns + clientContent.substring(getFileNameStart);
}

// Add the Bagikan Draw button in footer
const share1Kategori = \`              <button
                type="button"
                onClick={() =>
                  shareTextOutput(
                    \\\`Draw \${selectedCategoryLabel}\\\`,
                    categoryLocked ? buildSavedCategoryShareText() : buildDraftCategoryShareText()
                  )
                }
                disabled={!categoryLocked && drawnOrder.length === 0}
              >
                Share 1 Kategori
              </button>\`;

const bagikanDraw = \`
              <button
                type="button"
                onClick={async () => {
                  try {
                    const batches = categoryLocked ? savedMotoBatches : batchLayouts
                    const files: File[] = []
                    for (const batch of batches as any) {
                      if (categoryLocked) {
                        const blob = await buildDrawBatchPngBlob({
                          batchLabel: \\\`Batch \${batch.batchNo}\\\`,
                          motos: batch.motos.map((moto: any) => ({
                            title: moto.moto_name,
                            rows: moto.gates.map((gate: any) => ({
                              gate: gate.gate_position,
                              plate: gate.no_plate_display,
                              name: gate.name,
                            })),
                          })),
                        })
                        const filename = \\\`\${sanitizeFileName(eventName)}-\${sanitizeFileName(selectedCategoryLabel)}-batch-\${batch.batchNo}.png\\\`
                        files.push(new File([blob], filename, { type: 'image/png' }))
                      } else {
                        const moto2Manual = drawMode === 'external_draw' && externalBatchInputMode === 'PER_BATCH' && externalPerBatchValidation.moto2Provided ? externalPerBatchValidation.orderedMoto2Batches[batch.index - 1] ?? [] : []
                        const moto2Riders = moto2Manual.length > 0 ? moto2Manual : [...batch.riders].reverse()
                        const blob = await buildDrawBatchPngBlob({
                          batchLabel: \\\`Batch \${batch.index}\\\`,
                          motos: [
                            {
                              title: \\\`Moto 1 - Batch \${batch.index}\\\`,
                              rows: batch.riders.map((rider: any, index: number) => ({ gate: index + 1, plate: rider.no_plate_display, name: rider.name })),
                            },
                            {
                              title: \\\`Moto 2 - Batch \${batch.index}\\\`,
                              rows: moto2Riders.map((rider: any, index: number) => ({ gate: index + 1, plate: rider.no_plate_display, name: rider.name })),
                            },
                          ],
                        })
                        const filename = \\\`\${sanitizeFileName(eventName)}-\${sanitizeFileName(selectedCategoryLabel)}-batch-\${batch.index}.png\\\`
                        files.push(new File([blob], filename, { type: 'image/png' }))
                      }
                    }

                    const title = \\\`Draw \${selectedCategoryLabel}\\\`
                    const canShareFile = typeof navigator.canShare === 'function' && navigator.canShare({ files })
                    if (navigator.share && canShareFile) {
                      try {
                        await navigator.share({ title, files })
                        return
                      } catch (err: unknown) {
                        if (err instanceof DOMException && err.name === 'AbortError') return
                      }
                    }
                    
                    for (const file of files) {
                      const url = URL.createObjectURL(file)
                      const link = document.createElement('a')
                      link.href = url
                      link.download = file.name
                      document.body.appendChild(link)
                      link.click()
                      link.remove()
                      URL.revokeObjectURL(url)
                    }
                  } catch (err) {
                    alert(err instanceof Error ? err.message : 'Gagal membuat PNG')
                  }
                }}
                disabled={!categoryLocked && drawnOrder.length === 0}
              >
                Bagikan Draw
              </button>\`;

// First clean up if Bagikan Draw is already there just in case
clientContent = clientContent.replace(share1Kategori, share1Kategori + bagikanDraw);

fs.writeFileSync(clientFile, clientContent);
console.log('Restored TSX changes');
