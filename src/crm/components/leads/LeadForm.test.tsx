import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LeadForm, type FormValues } from './LeadForm'

describe('LeadForm', () => {
  it('passes every scanned field through to onSubmit unchanged, keyed off `initial`', () => {
    const onSubmit = vi.fn()
    const initial: Partial<FormValues> = {
      ownerName: 'Jane Prospect',
      secondaryPhone: '(210) 555-9999',
      website: 'abcdevelopment.com',
      streetAddress: '123 Main St',
      state: 'TX',
      zip: '78205-1234',
      linkedIn: 'linkedin.com/in/janeprospect',
      relationshipType: 'Investor',
    }

    render(<LeadForm initial={initial} onSubmit={onSubmit} />)

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const submitted = onSubmit.mock.calls[0][0] as FormValues
    expect(submitted).toMatchObject({
      secondaryPhone: initial.secondaryPhone,
      website: initial.website,
      streetAddress: initial.streetAddress,
      state: initial.state,
      zip: initial.zip,
      linkedIn: initial.linkedIn,
      relationshipType: initial.relationshipType,
    })
  })
})
