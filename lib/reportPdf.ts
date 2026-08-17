import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import type { CompanySettings } from '@/lib/domain'

type PdfTable = {
  title?: string
  head: string[]
  body: (string | number)[][]
  foot?: (string | number)[]
  rightAlign?: number[]
}

type PdfKpi = { label: string; value: string }

const forest = [47, 111, 87] as const
const ink = [45, 40, 32] as const
const muted = [120, 112, 98] as const

const stamp = () =>
  new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export const reportFileName = (slug: string) =>
  `${slug}-${new Date().toISOString().slice(0, 10)}.pdf`

/** Helvetica (WinAnsi) cannot draw Unicode minus/dashes — they become garbage like `"`. */
const pdfSafe = (value: string | number) =>
  String(value)
    .replace(/\u2212/g, '-')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00B7/g, ' | ')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()

const lastTableY = (doc: jsPDF, fallback: number) => {
  const y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY
  return typeof y === 'number' ? y : fallback
}

const drawFooter = (doc: jsPDF, companyName: string) => {
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i)
    const width = doc.internal.pageSize.getWidth()
    const height = doc.internal.pageSize.getHeight()
    doc.setDrawColor(...forest)
    doc.setLineWidth(0.3)
    doc.line(14, height - 14, width - 14, height - 14)
    doc.setFontSize(8)
    doc.setTextColor(...muted)
    doc.text(pdfSafe(companyName), 14, height - 9)
    doc.text(`Page ${i} of ${pageCount}`, width - 14, height - 9, { align: 'right' })
  }
}

const drawLetterhead = (doc: jsPDF, company: CompanySettings, title: string, period: string) => {
  const name = company.name?.trim() || 'Pyramid Snack'
  const lines = [
    company.address,
    [company.phone, company.email].filter(Boolean).join('  ·  '),
    [
      company.brn ? `BRN ${company.brn}` : '',
      company.vatRegistered && company.vatNumber ? `VAT ${company.vatNumber}` : company.vatRegistered ? 'VAT registered' : 'Not VAT registered',
    ].filter(Boolean).join('  ·  '),
  ].filter(Boolean)

  doc.setFillColor(...forest)
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 8, 'F')

  let x = 14
  if (company.logo?.startsWith('data:image')) {
    try {
      const format = company.logo.includes('image/png') ? 'PNG' : 'JPEG'
      doc.addImage(company.logo, format, 14, 14, 16, 16)
      x = 34
    } catch {
      x = 14
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...ink)
  doc.text(pdfSafe(name), x, 20)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...muted)
  let y = 25
  lines.forEach(line => {
    doc.text(pdfSafe(line), x, y)
    y += 4.2
  })

  y = Math.max(y, 36) + 4
  doc.setDrawColor(210, 200, 184)
  doc.setLineWidth(0.4)
  doc.line(14, y, doc.internal.pageSize.getWidth() - 14, y)

  y += 10
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...ink)
  doc.text(pdfSafe(title), 14, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...muted)
  doc.text(pdfSafe(`Period: ${period}`), 14, y)
  doc.text(pdfSafe(`Generated ${stamp()}`), doc.internal.pageSize.getWidth() - 14, y, { align: 'right' })
  return y + 6
}

export async function downloadReportPdf({
  company,
  title,
  period,
  filename,
  kpis = [],
  tables,
  notes = [],
  orientation = 'portrait',
}: {
  company: CompanySettings
  title: string
  period: string
  filename: string
  kpis?: PdfKpi[]
  tables: PdfTable[]
  notes?: string[]
  orientation?: 'portrait' | 'landscape'
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation })
  const pageWidth = doc.internal.pageSize.getWidth()
  const isLandscape = orientation === 'landscape'
  const pageBreakY = isLandscape ? 170 : 250
  let y = drawLetterhead(doc, company, title, period)

  if (kpis.length) {
    autoTable(doc, {
      startY: y,
      theme: 'plain',
      styles: { fontSize: 8.5, cellPadding: 3, textColor: [...ink] },
      columnStyles: Object.fromEntries(kpis.map((_, i) => [i, { halign: 'left' as const }])),
      head: [kpis.map(k => pdfSafe(k.label))],
      body: [kpis.map(k => pdfSafe(k.value))],
      headStyles: { fillColor: [246, 241, 231], textColor: [...muted], fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontStyle: 'bold', fontSize: 10 },
      margin: { left: 14, right: 14 },
    })
    y = lastTableY(doc, y) + 8
  }

  tables.forEach(table => {
    if (y > pageBreakY) {
      doc.addPage()
      y = 18
    }
    if (table.title) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(...ink)
      doc.text(pdfSafe(table.title), 14, y)
      y += 4
    }
    const right = new Set(table.rightAlign ?? [])
    autoTable(doc, {
      startY: y,
      head: [table.head.map(pdfSafe)],
      body: (table.body.length ? table.body : [table.head.map(() => '-')]).map(row => row.map(pdfSafe)),
      foot: table.foot ? [table.foot.map(pdfSafe)] : undefined,
      showFoot: table.foot ? 'lastPage' : undefined,
      theme: 'grid',
      styles: { fontSize: isLandscape ? 8 : 7.5, cellPadding: 2, textColor: [...ink], lineColor: [226, 218, 204], lineWidth: 0.2, overflow: 'linebreak' },
      headStyles: { fillColor: [...forest], textColor: 255, fontStyle: 'bold', fontSize: 8, overflow: 'linebreak' },
      footStyles: { fillColor: [246, 241, 231], textColor: [...ink], fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [252, 249, 243] },
      columnStyles: Object.fromEntries(
        table.head.map((label, i) => {
          const moneyCol = /VAT|Total|Revenue|MUR|Share/i.test(String(label))
          return [i, {
            halign: right.has(i) ? 'right' as const : 'left' as const,
            ...(moneyCol ? { cellWidth: String(label) === 'VAT' ? 22 : 28 } : {}),
          }]
        })
      ),
      margin: { left: 14, right: 14, bottom: 18 },
    })
    y = lastTableY(doc, y) + 10
  })

  if (notes.length) {
    if (y > pageBreakY - 10) {
      doc.addPage()
      y = 18
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...ink)
    doc.text('Notes', 14, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...muted)
    notes.forEach((note, i) => {
      const wrapped = doc.splitTextToSize(pdfSafe(`${i + 1}. ${note}`), pageWidth - 28)
      if (y + wrapped.length * 4 > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage()
        y = 18
      }
      doc.text(wrapped, 14, y)
      y += wrapped.length * 4 + 1.5
    })
  }

  drawFooter(doc, company.name?.trim() || 'Pyramid Snack')
  doc.save(filename)
}
