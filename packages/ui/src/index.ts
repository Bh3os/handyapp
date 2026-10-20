// @handyhub/ui: the HandyHub design system (TSK-0018, HH-BASE-01). Tokens and component styles are in
// `@handyhub/ui/styles.css`; these React components render its classes. Components hold no text of their own: every
// label comes from the caller's i18n catalog.
export const PACKAGE_NAME = '@handyhub/ui'

export { BRAND, type BrandColour } from './tokens.js'
export { Button, type ButtonProps, type ButtonVariant } from './Button.js'
export { Field, type FieldProps } from './Field.js'
export { Card, type CardProps } from './Card.js'
export { Tabs, type TabItem, type TabsProps } from './Tabs.js'
export { Dialog, type DialogProps } from './Dialog.js'
export { ToastRegion, type ToastItem, type ToastRegionProps, type ToastTone } from './Toast.js'
export { StatusBadge, type StatusTone } from './StatusBadge.js'
export { StateView, STATE_KINDS, type StateKind, type StateViewProps } from './StateView.js'
