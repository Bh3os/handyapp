import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../src/App'

describe('HandyHub customer portal skeleton (TSK-0001, HH-AUD-01)', () => {
  it('renders its top-level heading', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'HandyHub customer portal' })).toBeTruthy()
  })
})

describe('customer text from the English catalog (TSK-0008, RULE-LANGUAGES)', () => {
  it('[RULE-LANGUAGES] the portal renders in English', () => {
    const { container } = render(<App />)
    expect(container.querySelector('main')?.getAttribute('lang')).toBe('en')
  })
})
