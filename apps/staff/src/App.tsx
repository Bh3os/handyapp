// TSK-0001 placeholder; screens arrive with their tasks. Text comes from the staff catalogs (TSK-0008, HH-LANG-02);
// the language switch and the stored per-staff locale arrive with TSK-0040.
import { staffTranslator, type StaffLocale } from '@handyhub/i18n'

export function App({ locale = 'en' }: { locale?: StaffLocale }) {
  const { t } = staffTranslator(locale)
  return (
    <main lang={locale}>
      <h1>{t('app.title')}</h1>
    </main>
  )
}
