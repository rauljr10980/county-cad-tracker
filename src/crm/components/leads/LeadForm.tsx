import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AGE_RANGES,
  LEAD_KINDS,
  WEBSITE_STATUSES,
  type AgeRange,
  type ConnectionRating,
  type Lead,
  type LeadKind,
  type WebsiteStatus,
} from '@/crm/data/types'
import {
  RELATIONSHIP_DROPDOWN_OPTIONS,
  metPersonallyForRating,
  ratingFromMetPersonally,
  relationshipRatingMeta,
} from '@/crm/lib/connectionRating'
import { cn } from '@/crm/lib/utils'

type FormValues = Omit<Lead, 'id' | 'createdAt' | 'lastContactedAt'>

type LeadFormProps = {
  initial?: Partial<FormValues>
  submitLabel?: string
  onSubmit: (values: FormValues) => void
  onCancel?: () => void
  defaultKind?: LeadKind
  showKindToggle?: boolean
}

export function LeadForm({
  initial,
  submitLabel = 'Save',
  onSubmit,
  onCancel,
  defaultKind,
  showKindToggle = false,
}: LeadFormProps) {
  const initialConnectionRating = initial?.connectionRating && initial.connectionRating !== 'none'
    ? initial.connectionRating
    : ratingFromMetPersonally(initial?.metPersonally ?? '')

  const [values, setValues] = useState<FormValues>({
    businessName: initial?.businessName ?? '',
    ownerName: initial?.ownerName ?? '',
    jobTitleIndustry: initial?.jobTitleIndustry ?? '',
    firm: initial?.firm ?? initial?.businessName ?? '',
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
    industry: initial?.industry ?? 'Other',
    city: initial?.city ?? '',
    asset: initial?.asset ?? '',
    specialization: initial?.specialization ?? '',
    metPersonally: initial?.metPersonally ?? '',
    source: initial?.source ?? 'Referral',
    websiteStatus: initial?.websiteStatus ?? 'This Week',
    connectionRating: initialConnectionRating as ConnectionRating,
    lastConversationNotes: initial?.lastConversationNotes ?? '',
    notes: initial?.notes ?? '',
    kind: initial?.kind ?? defaultKind ?? 'industry',
    ageRange: initial?.ageRange,
    letterCadenceDays: initial?.letterCadenceDays,
  })

  const updateField = <Key extends keyof FormValues>(key: Key, value: FormValues[Key]) =>
    setValues((current) => ({ ...current, [key]: value }))

  const updateRelationshipRating = (connectionRating: ConnectionRating) =>
    setValues((current) => ({
      ...current,
      connectionRating,
      metPersonally: metPersonallyForRating(connectionRating),
    }))

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (values.kind === 'retail') {
          const ownerName = values.ownerName.trim()
          if (!ownerName) return
          if (!values.phone.trim() && !values.email.trim()) return
          onSubmit({
            ...values,
            ownerName,
            businessName: '',
            firm: '',
            jobTitleIndustry: '',
            asset: '',
            specialization: '',
            lastConversationNotes: values.lastConversationNotes.trim(),
            notes: values.notes.trim(),
          })
          return
        }
        const firm = values.firm.trim() || values.businessName.trim()
        const businessName = firm || values.ownerName.trim()
        if (!businessName) return
        onSubmit({
          ...values,
          businessName,
          firm,
          ownerName: values.ownerName.trim(),
          jobTitleIndustry: values.jobTitleIndustry.trim(),
          asset: values.asset.trim(),
          specialization: values.specialization.trim(),
          metPersonally: metPersonallyForRating(values.connectionRating) || values.metPersonally.trim(),
          lastConversationNotes: values.lastConversationNotes.trim(),
          notes: values.notes.trim(),
        })
      }}
      className="space-y-4"
    >
      {showKindToggle ? (
        <div className="space-y-1.5">
          <Label>Contact type</Label>
          <Select
            value={values.kind}
            onValueChange={(value) => updateField('kind', value as LeadKind)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAD_KINDS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {kind === 'industry' ? 'Industry / Business pro' : 'Retail buyer'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {values.kind === 'retail' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="retail-name">Name</Label>
            <Input
              id="retail-name"
              value={values.ownerName}
              onChange={(event) => updateField('ownerName', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="retail-phone">Phone</Label>
            <Input
              id="retail-phone"
              value={values.phone}
              onChange={(event) => updateField('phone', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="retail-email">Email</Label>
            <Input
              id="retail-email"
              type="email"
              value={values.email}
              onChange={(event) => updateField('email', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Age range</Label>
            <Select
              value={values.ageRange ?? ''}
              onValueChange={(value) => updateField('ageRange', (value || undefined) as AgeRange | undefined)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Optional" />
              </SelectTrigger>
              <SelectContent>
                {AGE_RANGES.map((range) => (
                  <SelectItem key={range} value={range}>
                    {range}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="letter-cadence">Letter cadence (days)</Label>
            <Input
              id="letter-cadence"
              type="number"
              min={1}
              placeholder="90"
              value={values.letterCadenceDays ?? ''}
              onChange={(event) => {
                const raw = event.target.value
                updateField('letterCadenceDays', raw === '' ? undefined : Math.max(1, Number(raw)))
              }}
            />
          </div>
        </div>
      ) : null}

      {values.kind === 'industry' ? (
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="job-title-industry">JOB TITLE/INDUSTRY</Label>
          <Input
            id="job-title-industry"
            value={values.jobTitleIndustry}
            onChange={(event) => updateField('jobTitleIndustry', event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="owner-name">Name</Label>
          <Input
            id="owner-name"
            value={values.ownerName}
            onChange={(event) => updateField('ownerName', event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="city">City</Label>
          <Input
            id="city"
            value={values.city}
            onChange={(event) => updateField('city', event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="firm">Firm</Label>
          <Input
            id="firm"
            value={values.firm}
            onChange={(event) => {
              updateField('firm', event.target.value)
              updateField('businessName', event.target.value)
            }}
          />
        </div>
        <div className="hidden space-y-1.5">
          <Label htmlFor="business-name">Company / Account</Label>
          <Input
            id="business-name"
            value={values.businessName}
            onChange={(event) => updateField('businessName', event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={values.email}
            onChange={(event) => updateField('email', event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            value={values.phone}
            onChange={(event) => updateField('phone', event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="asset">Asset</Label>
          <Input
            id="asset"
            value={values.asset}
            onChange={(event) => updateField('asset', event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="specialization">Specialization</Label>
          <Input
            id="specialization"
            value={values.specialization}
            onChange={(event) => updateField('specialization', event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Met personally</Label>
          <Select
            value={values.connectionRating}
            onValueChange={(rating) =>
              updateRelationshipRating(rating as ConnectionRating)
            }
          >
            <SelectTrigger
              className={cn(
                relationshipRatingMeta[values.connectionRating].selectClass,
              )}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RELATIONSHIP_DROPDOWN_OPTIONS.map((rating) => (
                <SelectItem key={rating} value={rating}>
                  {relationshipRatingMeta[rating].tableLabel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Follow-Up Priority</Label>
          <Select
            value={values.websiteStatus}
            onValueChange={(value) =>
              updateField('websiteStatus', value as WebsiteStatus)
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEBSITE_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="lead-notes">General Notes</Label>
        <textarea
          id="lead-notes"
          className="flex min-h-[110px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          value={values.notes}
          onChange={(event) => updateField('notes', event.target.value)}
        />
      </div>

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  )
}
