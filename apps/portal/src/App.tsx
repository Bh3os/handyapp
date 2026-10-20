// TSK-0001 placeholder; screens arrive with their tasks. Customer text comes from the English customer catalog
// (TSK-0008, RULE-LANGUAGES): the portal has no language choice.
import { customerTranslator } from '@handyhub/i18n'

export function App() {
  const { t } = customerTranslator()
  return (
    <main lang="en">
      <h1>{t('portal.title')}</h1>
    </main>
  )
}
