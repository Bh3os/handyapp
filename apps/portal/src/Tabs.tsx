// The workspace tabs beside the Overview (TSK-0039; HH-PORT-09, HH-PORT-06, HH-ARC-10, OWN-DEC-106, RULE-LANGUAGES).
// - Each tab reads its own customer view from the server the first time it is shown, and refreshes only while it is
//   shown (useLive's `active`): a tab that is not on screen never polls.
// - Each says truthfully what it holds today. Messages: the conversation is not shown here yet (it is never claimed
//   empty). Documents, Appointments, Payments: nothing exists yet, with what will appear. Photos: how many photos
//   the project has by state, the same counts as the receipt, and that viewing them here is not available yet.
// - A tab once opened stays mounted while another is shown, so anything typed in it survives a tab switch.
// English only, from the customer catalog; the wording no decision gives is PROPOSED (OQ-PORTAL-WORDING).
import type { CustomerKey } from '@handyhub/i18n'
import { StateView } from '@handyhub/ui'
import { useEffect, useState } from 'react'
import { portalApi, type Fetch, type TabData, type WorkspaceTab } from './api'
import { t } from './labels'
import { useLive } from './live'
import { NotShown, RefreshLine } from './States'

export type Tab = 'overview' | WorkspaceTab

/** The tab names of OWN-DEC-106, Overview first (on phones too). */
export const TAB_LABEL: Record<Tab, CustomerKey> = {
  overview: 'portal.overview.title',
  messages: 'portal.tab.messages',
  documents: 'portal.tab.documents',
  photos: 'portal.tab.photos',
  appointments: 'portal.tab.appointments',
  payments: 'portal.tab.payments',
}
export const TAB_ORDER: readonly Tab[] = ['overview', 'messages', 'documents', 'photos', 'appointments', 'payments']

/** The page of a tab: the Overview is the project page itself. */
export const tabPath = (reference: string, tab: Tab) =>
  `/portal/p/${encodeURIComponent(reference)}${tab === 'overview' ? '' : `/${tab}`}`

function Empty({ title, text, more }: { title: CustomerKey; text: CustomerKey; more?: CustomerKey }) {
  return (
    <StateView kind="empty" title={t(title)}>
      <p>{t(text)}</p>
      {more ? <p>{t(more)}</p> : null}
    </StateView>
  )
}

function Content({ data }: { data: TabData }) {
  switch (data.tab) {
    case 'messages':
      return <Empty title="portal.messages.notShown.title" text="portal.messages.notShown.text" />
    case 'documents':
      return <Empty title="portal.documents.none.title" text="portal.documents.none.text" />
    case 'appointments':
      return <Empty title="portal.appointment.none.title" text="portal.appointment.none.text" />
    case 'payments':
      return <Empty title="portal.payment.none.title" text="portal.payment.none.text" more="portal.payments.recorded" />
    case 'photos': {
      const { received, processing, failed } = data.photos
      if (received + processing + failed === 0)
        return <Empty title="portal.photos.none.title" text="portal.photos.none.text" />
      return (
        <>
          <h3 className="hh-h3">{t('request.receipt.photos.title')}</h3>
          <ul className="portal-photo-counts">
            <li>{t('request.receipt.photos.received', { count: received })}</li>
            <li>{t('request.receipt.photos.processing', { count: processing })}</li>
            <li>{t('request.receipt.photos.failed', { count: failed })}</li>
          </ul>
          <p className="hh-muted">{t('portal.photos.notShown')}</p>
        </>
      )
    }
  }
}

function TabRead({
  reference,
  tab,
  active,
  fetchImpl,
}: {
  reference: string
  tab: WorkspaceTab
  active: boolean
  fetchImpl: Fetch
}) {
  const { live, refresh } = useLive(() => portalApi.tab(fetchImpl, reference, tab), `${reference}/${tab}`, active)
  return (
    <div className="portal-tab" data-tab={tab}>
      <h2 className="hh-visually-hidden">{t(TAB_LABEL[tab])}</h2>
      {live.phase !== 'ready' ? (
        <NotShown
          live={live}
          loading="portal.tab.loading"
          failedTitle="portal.tab.failed.title"
          onRetry={() => void refresh()}
        />
      ) : (
        <>
          <RefreshLine
            refreshedAt={live.refreshedAt}
            stale={live.stale}
            refreshing={live.refreshing}
            onRefresh={() => void refresh()}
          />
          <div
            className={live.stale ? 'portal-section portal-section--stale' : 'portal-section'}
            data-stale={live.stale || undefined}
          >
            <Content data={live.data} />
          </div>
        </>
      )}
    </div>
  )
}

/** One tab beside the Overview: nothing until first shown, then kept (hidden) while another tab is shown. */
export function TabPanel(props: { reference: string; tab: WorkspaceTab; active: boolean; fetchImpl: Fetch }) {
  const [opened, setOpened] = useState(props.active)
  useEffect(() => {
    if (props.active) setOpened(true)
  }, [props.active])
  return opened || props.active ? <TabRead {...props} /> : null
}
