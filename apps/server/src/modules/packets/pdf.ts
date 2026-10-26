// The printable job packet as a PDF (TSK-0069; HH-PKT-07, HH-PKT-01, HH-PKT-02, HH-OFF-02, HH-SEC-04, T28, T43,
// OWN-DEC-121, RULE-NO-INVENTED-FACTS).
// - Built from the packet view only (view.ts), with the staff member's interface language for the labels; data stays
//   as stored (SOP text is English, verbatim). The layout is the estimate PDF's renderer (renderPdfModel).
// - TSK-0147 (OWN-DEC-196 D2, D3; HH-PKT-07): every page carries the print time and "Printed copies may be out of
//   date; check the app before starting" (the mark), and the job reference, the packet revision and its generation
//   time (the footer); the first page lists them again with the print time. A version that is not the latest says so
//   on its first lines. Printing keeps the "View job packet" permission and the PDF its rate limit.
// - What is never in it: an access code (the packet holds none; the PDF says how many codes exist, by kind, and that
//   they are revealed in the app, online, on the visit date), a code's label, signed photo links, a price, and the
//   site contact beyond what the packet holds. Deterministic for the same view and print time.
import { labelKey, staffTranslator, type LabelFamily, type StaffKey, type StaffLocale } from '@handyhub/i18n'
import { renderPdfModel, type CustomerPdfModel, type PdfBlock } from '../estimates/customer-pdf.js'
import { addressLine, type PacketView } from './view.js'

export type PacketPdfInput = {
  readonly view: PacketView
  readonly locale: StaffLocale
  readonly printedAt: Date
  /** The zone the print time and dates are shown in (the property's). */
  readonly timeZone: string
  /**
   * TSK-0128 (OWN-DEC-171): the reader's visit-day access is closed, so the server left the address, the site-access
   * details, the site contact and the codes out: the print says they show on the visit day only.
   */
  readonly visitDayClosed?: boolean
}

function translator(locale: StaffLocale) {
  const tr = staffTranslator(locale)
  const t = (key: string, values?: Record<string, string | number>) => tr.t(key as StaffKey, values)
  const label = (family: LabelFamily, code: string | null | undefined) => {
    if (code === null || code === undefined) return '—'
    try {
      return tr.t(labelKey(family, code) as StaffKey)
    } catch {
      return code
    }
  }
  return { t, label }
}

function when(iso: Date | string, locale: StaffLocale, timeZone: string) {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short',
  }).format(new Date(iso))
}

/** What the packet PDF says, page furniture aside (tested on its own). */
export function packetPdfModel(input: PacketPdfInput): CustomerPdfModel {
  const { view, locale, timeZone } = input
  const { t, label } = translator(locale)
  const at = (d: Date | string) => when(d, locale, timeZone)
  const blocks: PdfBlock[] = []
  const heading = (key: string) => blocks.push({ kind: 'heading', text: t(key) })
  const list = (items: string[], empty: string) =>
    blocks.push(items.length ? { kind: 'list', items } : { kind: 'text', text: t(empty) })

  if (!view.freshness.current)
    blocks.push({
      kind: 'text',
      text: t('packet.print.notLatest', { version: view.packet.version, latest: view.freshness.latestVersion }),
    })
  // TSK-0147: the print metadata of OWN-DEC-196 D2 (one job per project: the job reference is the project's).
  blocks.push({ kind: 'text', text: t('packet.print.outdated') })
  blocks.push({
    kind: 'facts',
    rows: [
      { label: t('packet.field.jobReference'), value: view.job.projectReference },
      { label: t('packet.field.revision'), value: String(view.packet.version) },
      { label: t('packet.field.generated'), value: at(view.packet.generatedAt) },
      { label: t('packet.field.printed'), value: at(input.printedAt) },
      { label: t('packet.field.firstGenerated'), value: at(view.freshness.firstGeneratedAt) },
      { label: t('packet.field.jobState'), value: label('jobState', view.job.jobState) },
      {
        label: t('packet.field.services'),
        value: view.services.map((s) => label('service', s.serviceCode)).join(', '),
      },
    ],
  })

  heading('packet.section.identity')
  list(
    view.visits.map((v) =>
      t('packet.print.visit', {
        number: v.number,
        purpose: label('visitPurpose', v.purpose),
        date: v.localDate,
        start: v.windowStart,
        end: v.windowEnd,
        zone: v.timeZone,
        state: label('visitState', v.state),
        team: v.team.length
          ? v.team.map((w) => `${w.name ?? t('packet.unnamed')} (${label('reservationRole', w.role)})`).join(', ')
          : t('packet.noTeam'),
      }),
    ),
    'packet.noVisits',
  )

  heading('packet.section.site_access')
  const detailRow = (d: PacketView['occupants'][number]) => ({
    label: label('propertyDetail', d.detail),
    value: t('packet.print.detail', {
      value: d.value ?? t('packet.detailCleared'),
      source: label('detailSource', d.source),
      confirmed: at(d.confirmedAt),
    }),
  })
  blocks.push({
    kind: 'facts',
    rows: [
      {
        label: t('packet.field.address'),
        value: view.site.address
          ? addressLine(view.site.address)
          : input.visitDayClosed && view.site.serviceArea
            ? t('packet.addressVisitDay', { city: view.site.serviceArea.city, state: view.site.serviceArea.state })
            : t('packet.addressUnavailable'),
      },
      { label: t('packet.field.propertyType'), value: label('propertyType', view.site.propertyType) },
      ...view.site.details.map(detailRow),
      {
        label: t('packet.field.accessCodes'),
        value: view.site.accessCodes.length
          ? t('packet.print.accessCodes', {
              count: view.site.accessCodes.length,
              kinds: [...new Set(view.site.accessCodes.map((c) => label('accessSecretKind', c.kind)))].join(', '),
            })
          : input.visitDayClosed
            ? t('packet.visitDayOnly')
            : t('packet.noAccessCodes'),
      },
    ],
  })

  heading('packet.section.occupants')
  if (view.occupants.length) blocks.push({ kind: 'facts', rows: view.occupants.map(detailRow) })
  else blocks.push({ kind: 'text', text: t('packet.nothingRecorded') })

  heading('packet.section.scope')
  if (view.scope.version === null) blocks.push({ kind: 'text', text: t('packet.noScope') })
  else {
    blocks.push({
      kind: 'text',
      text: t('packet.scopeVersion', { version: view.scope.version, source: label('scopeSource', view.scope.source) }),
    })
    blocks.push({
      kind: 'table',
      head: [t('packet.field.description'), t('packet.field.quantity'), t('packet.field.unit'), t('packet.field.kind')],
      rows: view.scope.lines.map(
        (l) => [l.description ?? '—', l.quantity ?? '—', l.unit ?? '—', label('estimateLineKind', l.kind)] as const,
      ),
    })
    for (const [k, items] of Object.entries(view.scope.texts))
      if (items.length) {
        blocks.push({ kind: 'text', text: label('scopeText', k) })
        blocks.push({ kind: 'list', items: [...items] })
      }
  }

  heading('packet.section.evidence')
  blocks.push({ kind: 'text', text: t('packet.print.photos', { count: view.evidence.photos.length }) })
  list(
    view.sop.preWork.map((e) => `${e.serviceCode} ${label('sopStage', e.stage)}: ${e.text}`),
    'packet.noPreWork',
  )

  heading('packet.section.sop')
  list(
    view.sop.packages.map((p) =>
      p.state === 'pinned'
        ? t('packet.print.sop', {
            service: p.serviceCode,
            sop: p.sopId ?? '—',
            version: p.version ?? 0,
            review: label('sopReviewState', p.reviewState),
            sha: (p.contentSha256 ?? '').slice(0, 12),
          })
        : t('packet.print.sopNotConfigured', { service: p.serviceCode }),
    ),
    'packet.noServices',
  )

  heading('packet.section.holds')
  list(
    view.holds.map((h) =>
      t('packet.print.hold', {
        category: label('hazardCategory', h.category),
        kind: label('holdKind', h.kind),
        state: label('holdState', h.state),
        note: h.note,
      }),
    ),
    'packet.noHolds',
  )

  heading('packet.section.resources')
  list(
    view.visits.flatMap((v) =>
      [...v.equipment.map((e) => e.name), ...v.requested].map((name) =>
        t('packet.print.item', { number: v.number, name }),
      ),
    ),
    'packet.noEquipment',
  )
  // TSK-0071: the loadout list per service (item names only; confirmations are recorded in the app, online).
  if (view.materials.state === 'listed')
    for (const p of view.materials.packages)
      list(
        p.items.map((i) =>
          t(i.criticality === 'required' ? 'loadout.print.required' : 'loadout.print.niceToHave', {
            service: label('service', p.serviceCode),
            name: i.name ?? i.key,
          }),
        ),
        'loadout.notConfigured',
      )
  else blocks.push({ kind: 'text', text: t('packet.materialsNotRecorded') })

  heading('packet.section.dependencies')
  blocks.push({
    kind: 'facts',
    rows: [
      { label: t('packet.field.approved'), value: at(view.dependencies.approvedAt) },
      {
        label: t('packet.field.deposit'),
        value: view.dependencies.deposit ? label('depositState', view.dependencies.deposit.state) : '—',
      },
      { label: t('packet.field.blockingHolds'), value: String(view.dependencies.blockingHolds) },
    ],
  })

  heading('packet.section.communication')
  blocks.push({
    kind: 'facts',
    rows: [
      {
        label: t('packet.field.siteContact'),
        value:
          view.communication.siteContact?.value ??
          t(input.visitDayClosed ? 'packet.visitDayOnly' : 'packet.nothingRecorded'),
      },
      // TSK-0147: what the authorized site contact may authorize (visit-day data for a worker, like the contact).
      ...(view.communication.siteContactAuthority
        ? [
            {
              label: t('packet.field.siteContactAuthority'),
              value: view.communication.siteContactAuthority.authority.length
                ? view.communication.siteContactAuthority.authority
                    .map((a) => label('siteContactAuthority', a))
                    .join(', ')
                : t('siteChecks.contact.noAuthority'),
            },
          ]
        : []),
      // TSK-0129: the number the Owner entered, so the paper copy works without the app (PROPOSED), or NOT CONFIGURED.
      {
        label: t('packet.field.escalation'),
        value:
          view.communication.escalationContact.state === 'configured'
            ? view.communication.escalationContact.display
            : t('packet.escalationNotConfigured'),
      },
      { label: t('start.emergency.call911'), value: '911' },
    ],
  })
  blocks.push({ kind: 'text', text: t('packet.emergencyNeverWait') })
  // The procedure of OWN-DEC-172: in Spanish the owner's instruction exactly as given.
  blocks.push({ kind: 'text', text: t('escalation.procedure') })
  for (const g of view.communication.stopWork) {
    blocks.push({ kind: 'text', text: t('packet.print.stopWork', { service: g.serviceCode }) })
    blocks.push({ kind: 'list', items: g.items.map((i) => i.text) })
  }

  heading('packet.section.completion')
  list(
    view.sop.completion.map((e) => `${e.serviceCode} ${label('sopStage', e.stage)}: ${e.text}`),
    'packet.noCompletion',
  )
  blocks.push({ kind: 'text', text: t('packet.qualityReviewNext') })
  blocks.push({ kind: 'text', text: t('packet.careNotesNone') })

  return {
    mark: t('packet.print.mark', { time: at(input.printedAt) }),
    title: t('packet.print.title', { reference: view.job.projectReference, version: view.packet.version }),
    footer: t('packet.print.footer', {
      reference: view.job.projectReference,
      version: view.packet.version,
      generated: at(view.packet.generatedAt),
    }),
    blocks,
  }
}

export async function renderPacketPdf(input: PacketPdfInput, options: { compress?: boolean } = {}): Promise<Buffer> {
  const { t } = translator(input.locale)
  return renderPdfModel(
    packetPdfModel(input),
    { author: null, createdAt: input.printedAt, pageLabel: (page, pages) => t('packet.print.page', { page, pages }) },
    options,
  )
}
