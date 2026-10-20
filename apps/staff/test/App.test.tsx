import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../src/App'

describe('HandyHub staff skeleton (TSK-0001, HH-AUD-01)', () => {
  it('renders its top-level heading', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'HandyHub staff' })).toBeTruthy()
  })
})
