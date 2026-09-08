import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LeadFormDialog } from './LeadFormDialog'
import { useCrmStore } from '@/crm/store/useCrmStore'
import { dataService } from '@/crm/data/dataService'
import { EMPTY_STATE, type Lead } from '@/crm/data/types'

// Same mocking convention as useCrmStore.test.ts: mock the persistence layer
// only, and drive the real Zustand store so actions behave exactly as they
// do in the app.
vi.mock('@/crm/data/dataService', () => ({
  dataService: {
    load: vi.fn(),
    save: vi.fn(),
    clear: vi.fn(),
  },
}))

const existingLead: Lead = {
  id: 'lead-1',
  businessName: 'Acme Co',
  ownerName: 'Jane Prospect',
  jobTitleIndustry: '',
  firm: '',
  phone: '',
  email: '',
  industry: 'Other',
  city: '',
  secondaryPhone: '',
  website: '',
  streetAddress: '',
  state: '',
  zip: '',
  linkedIn: '',
  relationshipType: '',
  asset: '',
  specialization: '',
  metPersonally: '',
  source: 'Referral',
  websiteStatus: 'This Month',
  connectionRating: 'none',
  lastConversationNotes: '',
  notes: '',
  kind: 'industry',
  lastContactedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
}

describe('LeadFormDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useCrmStore.setState({
      ...EMPTY_STATE,
      leads: [existingLead],
      hydrated: true,
      hydrateError: null,
    })
  })

  it('updates the existing lead by id when editLeadId is set, and never creates a new one', () => {
    const onSaved = vi.fn()
    const updateLeadSpy = vi.spyOn(useCrmStore.getState(), 'updateLead')
    const addLeadSpy = vi.spyOn(useCrmStore.getState(), 'addLead')

    render(
      <LeadFormDialog
        open
        onOpenChange={() => {}}
        editLeadId="lead-1"
        onSaved={onSaved}
        initialValues={{ ownerName: 'Jane Prospect', notes: 'Scanned from card' }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(updateLeadSpy).toHaveBeenCalledTimes(1)
    const [id, patch] = updateLeadSpy.mock.calls[0]
    expect(id).toBe('lead-1')
    expect(patch).toMatchObject({ ownerName: 'Jane Prospect', notes: 'Scanned from card' })

    expect(addLeadSpy).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()

    // Confirm the write actually landed on the existing record, not a new one.
    const state = useCrmStore.getState()
    expect(state.leads).toHaveLength(1)
    expect(state.leads[0].id).toBe('lead-1')
    expect(state.leads[0].notes).toBe('Scanned from card')
  })

  it('reports the created values only after persistence confirms success', () => {
    const onSaved = vi.fn()
    render(<LeadFormDialog open onOpenChange={() => {}} initialValues={{ ownerName: 'Raul Medina' }} onSaved={onSaved} />)
    fireEvent.click(screen.getByRole('button', { name: 'Create Contact' }))
    expect(onSaved).not.toHaveBeenCalled()
    const [state, saved] = vi.mocked(dataService.save).mock.calls.at(-1)!
    saved!()
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(onSaved).toHaveBeenCalledWith(state.leads.at(-1))
  })
})
