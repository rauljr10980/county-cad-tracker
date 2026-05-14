import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { LeadDetailDrawer } from '@/crm/components/leads/LeadDetailDrawer'
import { LeadsTable } from '@/crm/components/leads/LeadsTable'
import { ScheduleMeetingDialog } from '@/crm/components/leads/ScheduleMeetingDialog'
import { useSearchStore } from '@/crm/lib/searchStore'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ConnectionRating } from '@/crm/data/types'
import { metPersonallyForRating } from '@/crm/lib/connectionRating'
import { selectContacts } from '@/crm/store/selectors'
import { useCrmStore } from '@/crm/store/useCrmStore'

const ANY = '__any__'

export default function ContactsView() {
  const leads = useCrmStore(useShallow(selectContacts))
  const updateLead = useCrmStore((state) => state.updateLead)
  const query = useSearchStore((state) => state.query).trim().toLowerCase()
  const [jobTitleIndustry, setJobTitleIndustry] = useState(ANY)
  const [city, setCity] = useState(ANY)
  const [firm, setFirm] = useState(ANY)
  const [asset, setAsset] = useState(ANY)
  const [specialization, setSpecialization] = useState(ANY)
  const [openLeadId, setOpenLeadId] = useState<string | null>(null)
  const [scheduleLeadId, setScheduleLeadId] = useState<string | null>(null)

  const jobTitleIndustries = useMemo(
    () => Array.from(new Set(leads.map((lead) => lead.jobTitleIndustry).filter(Boolean))).sort(),
    [leads],
  )

  const cities = useMemo(
    () => Array.from(new Set(leads.map((lead) => lead.city).filter(Boolean))).sort(),
    [leads],
  )

  const firms = useMemo(
    () => Array.from(new Set(leads.map((lead) => lead.firm || lead.businessName).filter(Boolean))).sort(),
    [leads],
  )

  const assets = useMemo(
    () => Array.from(new Set(leads.map((lead) => lead.asset).filter(Boolean))).sort(),
    [leads],
  )

  const specializations = useMemo(
    () => Array.from(new Set(leads.map((lead) => lead.specialization).filter(Boolean))).sort(),
    [leads],
  )

  const filteredLeads = useMemo(() => {
    return leads
      .filter((lead) => {
        if (jobTitleIndustry !== ANY && lead.jobTitleIndustry !== jobTitleIndustry) return false
        if (city !== ANY && lead.city !== city) return false
        if (firm !== ANY && (lead.firm || lead.businessName) !== firm) return false
        if (asset !== ANY && lead.asset !== asset) return false
        if (specialization !== ANY && lead.specialization !== specialization) return false
        if (
          query &&
          !`${lead.jobTitleIndustry} ${lead.ownerName} ${lead.city} ${lead.firm} ${lead.businessName} ${lead.email} ${lead.phone} ${lead.asset} ${lead.specialization} ${lead.lastConversationNotes} ${lead.metPersonally}`
            .toLowerCase()
            .includes(query)
        ) {
          return false
        }
        return true
      })
      .sort((left, right) => {
        return (left.jobTitleIndustry || '').localeCompare(right.jobTitleIndustry || '')
          || (left.ownerName || '').localeCompare(right.ownerName || '')
      })
  }, [asset, city, firm, jobTitleIndustry, leads, query, specialization])

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            {filteredLeads.length} of {leads.length} industry relationships to keep warm for referrals, investors, and future deals.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-md border px-3 py-1">Local workspace</span>
          <span className="rounded-md border px-3 py-1">Notes searchable</span>
        </div>
      </div>

      <div className="rounded-md border border-border/70 bg-card p-4 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <FilterSelect label="JOB TITLE/INDUSTRY" value={jobTitleIndustry} onChange={setJobTitleIndustry} options={jobTitleIndustries} />
          <FilterSelect label="City" value={city} onChange={setCity} options={cities} />
          <FilterSelect label="Firm" value={firm} onChange={setFirm} options={firms} />
          <FilterSelect label="Asset" value={asset} onChange={setAsset} options={assets} />
          <FilterSelect label="Specialization" value={specialization} onChange={setSpecialization} options={specializations} />
          <Button
            variant="ghost"
            onClick={() => {
              setJobTitleIndustry(ANY)
              setCity(ANY)
              setFirm(ANY)
              setAsset(ANY)
              setSpecialization(ANY)
            }}
          >
            Clear filters
          </Button>
        </div>
      </div>

      <LeadsTable
        leads={filteredLeads}
        onRowClick={(leadId) => setOpenLeadId(leadId)}
        onRateConnection={(leadId, rating: ConnectionRating) =>
          updateLead(leadId, {
            connectionRating: rating,
            metPersonally: metPersonallyForRating(rating),
          })
        }
        onScheduleMeeting={(leadId) => setScheduleLeadId(leadId)}
      />

      <LeadDetailDrawer leadId={openLeadId} onClose={() => setOpenLeadId(null)} />
      <ScheduleMeetingDialog
        leadId={scheduleLeadId}
        onClose={() => setScheduleLeadId(null)}
      />
    </div>
  )
}

type FilterSelectProps = {
  label: string
  value: string
  onChange: (value: string) => void
  options: readonly string[]
}

function FilterSelect({ label, value, onChange, options }: FilterSelectProps) {
  return (
    <div className="min-w-[180px]">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>All {label}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
