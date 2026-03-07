import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Building2, AlertCircle, Clock, TrendingUp, Minus, ThumbsUp, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { updateDrivingLead } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { formatDistanceToNow, format, addYears } from 'date-fns';
import type { DrivingLead, D4dWorkflow } from '@/types/property';

const RESEARCH_ITEMS = [
  { key: 'bcad_tax', label: 'BCAD - TAX' },
  { key: 'tps', label: 'TPS' },
  { key: 'google', label: 'GOOGLE' },
  { key: 'land_records', label: 'LAND RECORDS' },
  { key: 'obituary', label: 'OBITUARY' },
];

const CONTACT_ITEMS = [
  { key: 'called', label: 'Called' },
  { key: 'emailed', label: 'Emailed all available emails' },
];

const PIPELINE_STAGES = [
  { key: 'NEW' as const, label: 'Leads', color: '#3B82F6', num: 1 },
  { key: 'RESEARCHING' as const, label: 'Researching', color: '#EAB308', num: 2 },
  { key: 'FOUND_OBITUARY' as const, label: 'Found Obituary', color: '#F43F5E', num: 3 },
  { key: 'CONTACTED' as const, label: 'Contacted', color: '#A855F7', num: 4 },
  { key: 'UNDER_CONTRACT' as const, label: 'Under Contract', color: '#22C55E', num: 5 },
];

export function D4dPipelineView({ leads, onViewDetails }: { leads: DrivingLead[]; onViewDetails?: (lead: DrivingLead) => void }) {
  const queryClient = useQueryClient();
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  // Optimistic local metadata overrides
  const [localMeta, setLocalMeta] = useState<Record<string, D4dWorkflow>>({});

  const getWorkflow = (lead: DrivingLead): D4dWorkflow =>
    localMeta[lead.id] !== undefined
      ? { ...(lead.metadata as D4dWorkflow || {}), ...localMeta[lead.id] }
      : (lead.metadata as D4dWorkflow || {});

  const saveMeta = async (leadId: string, wf: D4dWorkflow) => {
    setLocalMeta(prev => ({ ...prev, [leadId]: wf }));
    try {
      await updateDrivingLead(leadId, { metadata: wf as Record<string, unknown> });
      queryClient.invalidateQueries({ queryKey: ['driving-leads'] });
    } catch {
      setLocalMeta(prev => { const n = { ...prev }; delete n[leadId]; return n; });
      toast({ title: 'Failed to save', variant: 'destructive' });
    }
  };

  const toggleCheck = (lead: DrivingLead, field: 'researchChecks' | 'contactChecks', key: string) => {
    const wf = getWorkflow(lead);
    const cur = wf[field] || [];
    const updated = cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key];
    saveMeta(lead.id, { ...wf, [field]: updated });
  };

  const markContacted = (lead: DrivingLead) => {
    const wf = getWorkflow(lead);
    saveMeta(lead.id, { ...wf, lastContactedAt: new Date().toISOString() });
  };

  const setUnderContract = (lead: DrivingLead, value: boolean) => {
    const wf = getWorkflow(lead);
    saveMeta(lead.id, { ...wf, underContract: value });
  };

  const setDeadReason = (lead: DrivingLead, reason: 'real_estate_company' | 'doesnt_want_to_sell') => {
    const wf = getWorkflow(lead);
    saveMeta(lead.id, {
      ...wf,
      deadReason: reason,
      lastContactedAt: wf.lastContactedAt || new Date().toISOString(),
    });
  };

  const getAddress = (lead: DrivingLead) => lead.street || lead.rawAddress;

  // Stage counts
  const deadLeads = leads.filter(l => l.status === 'DEAD');
  const stageCounts = Object.fromEntries(PIPELINE_STAGES.map(s => [s.key, s.key === 'NEW' ? leads.length : leads.filter(l => l.status === s.key).length]));
  const maxCount = Math.max(1, ...Object.values(stageCounts), deadLeads.length);

  // ── Render helpers ──────────────────────────────────────────────────────────

  const renderProgressBar = (done: number, total: number) => {
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return (
      <div className="flex items-center gap-2 mt-2">
        <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', pct === 100 ? 'bg-green-500' : 'bg-primary')}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={cn('text-xs font-mono w-8 text-right', pct === 100 ? 'text-green-400 font-semibold' : 'text-muted-foreground')}>
          {pct}%
        </span>
      </div>
    );
  };

  const renderCheckbox = (checked: boolean, label: string, onClick: () => void) => (
    <button
      key={label}
      className="flex items-center gap-2 w-full text-left hover:bg-secondary/40 rounded px-1 py-0.5 transition-colors"
      onClick={onClick}
    >
      <div className={cn(
        'h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors',
        checked ? 'bg-primary border-primary' : 'border-muted-foreground/40'
      )}>
        {checked && <span className="text-primary-foreground text-[10px] leading-none font-bold">✓</span>}
      </div>
      <span className={cn('text-xs', checked && 'line-through text-muted-foreground')}>{label}</span>
    </button>
  );

  const renderViewBtn = (lead: DrivingLead) =>
    onViewDetails ? (
      <button
        className="ml-auto p-1 rounded hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        title="View property details"
        onClick={e => { e.stopPropagation(); onViewDetails(lead); }}
      >
        <Eye className="h-3.5 w-3.5" />
      </button>
    ) : null;

  const renderNewCard = (lead: DrivingLead) => (
    <div key={lead.id} className="bg-card border border-border rounded-lg p-3">
      <div className="flex items-start gap-1">
        <p className="font-medium text-sm flex-1">{getAddress(lead)}</p>
        {renderViewBtn(lead)}
      </div>
      {lead.notes && <p className="text-xs text-muted-foreground mt-1 italic line-clamp-2">{lead.notes}</p>}
      <p className="text-xs text-muted-foreground mt-1">
        Added {formatDistanceToNow(new Date(lead.createdAt), { addSuffix: true })}
      </p>
    </div>
  );

  const renderResearchCard = (lead: DrivingLead) => {
    const wf = getWorkflow(lead);
    const checks = wf.researchChecks || [];
    return (
      <div key={lead.id} className="bg-card border border-border rounded-lg p-3 space-y-1">
        <div className="flex items-start gap-1">
          <p className="font-medium text-sm flex-1">{getAddress(lead)}</p>
          {renderViewBtn(lead)}
        </div>
        <div className="mt-2 space-y-0.5">
          {RESEARCH_ITEMS.map(item =>
            renderCheckbox(
              checks.includes(item.key),
              item.label,
              () => toggleCheck(lead, 'researchChecks', item.key)
            )
          )}
        </div>
        {renderProgressBar(checks.length, RESEARCH_ITEMS.length)}
      </div>
    );
  };

  const renderObitCard = (lead: DrivingLead) => (
    <div key={lead.id} className="bg-card border border-rose-500/20 rounded-lg p-3">
      <div className="flex items-start gap-1">
        <p className="font-medium text-sm flex-1">{getAddress(lead)}</p>
        {renderViewBtn(lead)}
      </div>
      {lead.notes && <p className="text-xs text-muted-foreground mt-1 italic line-clamp-2">{lead.notes}</p>}
      <p className="text-xs text-muted-foreground mt-1">
        {formatDistanceToNow(new Date(lead.updatedAt), { addSuffix: true })}
      </p>
    </div>
  );

  const CONTACTED_OUTCOMES = [
    { key: 'doesnt_want_to_sell' as const, label: "Doesn't Want to Sell", icon: AlertCircle, color: 'text-red-400' },
    { key: 'thinking_about_selling' as const, label: 'Thinking About Selling', icon: Minus, color: 'text-yellow-400' },
    { key: 'wants_to_sell' as const, label: 'Wants to Sell', icon: ThumbsUp, color: 'text-green-400' },
  ];

  const setContactedOutcome = (lead: DrivingLead, outcome: 'doesnt_want_to_sell' | 'thinking_about_selling' | 'wants_to_sell') => {
    const wf = getWorkflow(lead);
    saveMeta(lead.id, { ...wf, contactedOutcome: outcome });
  };

  const renderContactedCard = (lead: DrivingLead) => {
    const wf = getWorkflow(lead);
    const checks = wf.contactChecks || [];
    return (
      <div key={lead.id} className="bg-card border border-border rounded-lg p-3 space-y-2">
        <div className="flex items-start gap-1">
          <p className="font-medium text-sm flex-1">{getAddress(lead)}</p>
          {renderViewBtn(lead)}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {wf.lastContactedAt
            ? <>Last contacted: <span className="text-foreground">{formatDistanceToNow(new Date(wf.lastContactedAt), { addSuffix: true })}</span></>
            : 'Never contacted'}
        </div>
        {!wf.contactedOutcome && (
          <div className="flex flex-col gap-1">
            <p className="text-[11px] text-muted-foreground">Outcome?</p>
            {CONTACTED_OUTCOMES.map(o => (
              <Button key={o.key} size="sm" variant="outline" className="h-7 text-[11px] w-full justify-start gap-1.5"
                onClick={() => setContactedOutcome(lead, o.key)}>
                <o.icon className={cn('h-3 w-3', o.color)} />{o.label}
              </Button>
            ))}
          </div>
        )}
        {wf.contactedOutcome && (
          <div className="flex items-center justify-between">
            {(() => { const o = CONTACTED_OUTCOMES.find(x => x.key === wf.contactedOutcome)!;
              return <span className={cn('text-xs flex items-center gap-1', o.color)}><o.icon className="h-3 w-3" />{o.label}</span>; })()}
            <button className="text-[10px] text-muted-foreground underline"
              onClick={() => saveMeta(lead.id, { ...wf, contactedOutcome: undefined })}>change</button>
          </div>
        )}
        {/* Follow-up tracking */}
        <div className="border-t border-border/50 pt-2 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {wf.lastFollowUpAt
                ? <>Last follow up: <span className="text-foreground ml-0.5">{formatDistanceToNow(new Date(wf.lastFollowUpAt), { addSuffix: true })}</span></>
                : <span>No follow up yet</span>}
            </div>
            <button
              className="text-[10px] text-primary underline flex-shrink-0"
              onClick={() => saveMeta(lead.id, { ...wf, lastFollowUpAt: new Date().toISOString() })}
            >
              Mark Now
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground flex-shrink-0">Scheduled:</span>
            <input
              type="date"
              value={wf.scheduledFollowUpAt ? wf.scheduledFollowUpAt.slice(0, 10) : ''}
              onChange={e => saveMeta(lead.id, { ...wf, scheduledFollowUpAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
              className="flex-1 h-6 text-xs bg-secondary border border-border rounded px-1.5 text-foreground cursor-pointer"
            />
          </div>
          {wf.scheduledFollowUpAt && (() => {
            const scheduled = new Date(wf.scheduledFollowUpAt);
            const isPast = scheduled < new Date();
            const daysUntil = Math.ceil((scheduled.getTime() - Date.now()) / 86400000);
            return (
              <p className={cn('text-[11px]', isPast ? 'text-yellow-400' : 'text-muted-foreground')}>
                {isPast ? `⚠ Overdue by ${Math.abs(daysUntil)} day${Math.abs(daysUntil) !== 1 ? 's' : ''}` : `In ${daysUntil} day${daysUntil !== 1 ? 's' : ''} — ${format(scheduled, 'MMM d, yyyy')}`}
              </p>
            );
          })()}
        </div>
        <div className="space-y-0.5">
          {CONTACT_ITEMS.map(item =>
            renderCheckbox(checks.includes(item.key), item.label, () => toggleCheck(lead, 'contactChecks', item.key))
          )}
        </div>
        {renderProgressBar(checks.length, CONTACT_ITEMS.length)}
      </div>
    );
  };

  const renderUnderContractCard = (lead: DrivingLead) => {
    const wf = getWorkflow(lead);
    return (
      <div key={lead.id} className="bg-card border border-border rounded-lg p-3 space-y-2">
        <div className="flex items-start gap-1">
          <p className="font-medium text-sm flex-1">{getAddress(lead)}</p>
          {renderViewBtn(lead)}
        </div>
        <p className="text-xs text-muted-foreground">Under Contract?</p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={wf.underContract === true ? 'default' : 'outline'}
            className="flex-1 h-7 text-xs"
            onClick={() => setUnderContract(lead, true)}
          >
            Yes
          </Button>
          <Button
            size="sm"
            variant={wf.underContract === false ? 'default' : 'outline'}
            className="flex-1 h-7 text-xs"
            onClick={() => setUnderContract(lead, false)}
          >
            No
          </Button>
        </div>
        {wf.underContract === false && (
          <p className="text-xs text-muted-foreground text-center">Consider moving to Dead Deal</p>
        )}
      </div>
    );
  };

  const renderDeadCard = (lead: DrivingLead) => {
    const wf = getWorkflow(lead);
    const lastContact = wf.lastContactedAt ? new Date(wf.lastContactedAt) : null;
    const twoYearMark = lastContact ? addYears(lastContact, 2) : null;
    const daysUntil = twoYearMark
      ? Math.ceil((twoYearMark.getTime() - Date.now()) / 86400000)
      : null;
    return (
      <div key={lead.id} className="bg-card border border-border rounded-lg p-3 space-y-2">
        <div className="flex items-start gap-1">
          <p className="font-medium text-sm flex-1">{getAddress(lead)}</p>
          {renderViewBtn(lead)}
        </div>
        {!wf.deadReason && (
          <>
            <p className="text-xs text-muted-foreground">Why did this go dead?</p>
            <div className="flex flex-col gap-1.5">
              <Button size="sm" variant="outline" className="h-7 text-[11px] w-full" onClick={() => setDeadReason(lead, 'real_estate_company')}>
                RE company bought it
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-[11px] w-full" onClick={() => setDeadReason(lead, 'doesnt_want_to_sell')}>
                Doesn't want to sell
              </Button>
            </div>
          </>
        )}
        {lastContact && (
          <div className="text-xs space-y-0.5">
            <p className="text-muted-foreground">Last contact: {format(lastContact, 'MMM d, yyyy')}</p>
            {daysUntil !== null && daysUntil > 0 && (
              <p className="text-yellow-500">Re-contact in {daysUntil} days ({format(twoYearMark!, 'MMM d, yyyy')})</p>
            )}
            {daysUntil !== null && daysUntil <= 0 && (
              <p className="text-green-400 font-medium">✓ 2-year mark passed — consider reaching out</p>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderStageCards = (stageKey: string, stageLeads: DrivingLead[]) => {
    if (stageLeads.length === 0) {
      return <p className="text-sm text-muted-foreground py-3 text-center col-span-2">No leads in this stage</p>;
    }
    return stageLeads.map(lead => {
      if (stageKey === 'RESEARCHING') return renderResearchCard(lead);
      if (stageKey === 'FOUND_OBITUARY') return renderObitCard(lead);
      if (stageKey === 'CONTACTED') return renderContactedCard(lead);
      if (stageKey === 'UNDER_CONTRACT') return renderUnderContractCard(lead);
      return renderNewCard(lead);
    });
  };

  // Contacted leads split by outcome
  const contactedLeads = leads.filter(l => l.status === 'CONTACTED');
  const contactedDNWTS = contactedLeads.filter(l => getWorkflow(l).contactedOutcome === 'doesnt_want_to_sell');
  const contactedThinking = contactedLeads.filter(l => getWorkflow(l).contactedOutcome === 'thinking_about_selling');
  const contactedWants = contactedLeads.filter(l => getWorkflow(l).contactedOutcome === 'wants_to_sell');
  const contactedUnset = contactedLeads.filter(l => !getWorkflow(l).contactedOutcome);

  // Dead leads split by reason
  const deadRE = deadLeads.filter(l => getWorkflow(l).deadReason === 'real_estate_company');
  const deadNS = deadLeads.filter(l => getWorkflow(l).deadReason === 'doesnt_want_to_sell');
  const deadUnset = deadLeads.filter(l => !getWorkflow(l).deadReason);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      {/* Header */}
      <button
        className="flex items-center justify-between w-full"
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="text-left">
          <h3 className="text-base font-bold tracking-tight">D4$ Pipeline</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Sales funnel — current snapshot</p>
        </div>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', collapsed && '-rotate-90')} />
      </button>

      {!collapsed && (
        <div className="mt-4 space-y-1.5">
          {/* Active stage bars */}
          {PIPELINE_STAGES.map(stage => {
            const count = stageCounts[stage.key] || 0;
            const width = Math.max(count > 0 ? 5 : 0, (count / maxCount) * 100);
            const isExpanded = expandedStage === stage.key;
            return (
              <div key={stage.key}>
                <div
                  className={cn(
                    'cursor-pointer rounded-lg p-1.5 -mx-1.5 transition-colors',
                    isExpanded ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-secondary/30'
                  )}
                  onClick={() => setExpandedStage(prev => prev === stage.key ? null : stage.key)}
                >
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium">{stage.num}. {stage.label}</span>
                    <span className="text-muted-foreground text-xs">{count} {count === 1 ? 'lead' : 'leads'}</span>
                  </div>
                  <div className="relative w-full h-7 bg-secondary/50 rounded-lg overflow-hidden">
                    {count > 0 && (
                      <div
                        className="h-full flex items-center justify-center text-white font-semibold text-xs rounded-lg transition-all duration-300"
                        style={{ backgroundColor: stage.color, width: `${width}%` }}
                      >
                        {width > 15 ? count : ''}
                      </div>
                    )}
                  </div>
                </div>
                {isExpanded && stage.key !== 'CONTACTED' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 mb-1">
                    {renderStageCards(stage.key, stage.key === 'NEW' ? leads : leads.filter(l => l.status === stage.key))}
                  </div>
                )}
                {isExpanded && stage.key === 'CONTACTED' && (
                  <div className="mt-2 mb-1 space-y-4">
                    {[
                      { leads: contactedWants, icon: ThumbsUp, label: "Wants to Sell", color: 'text-green-400' },
                      { leads: contactedThinking, icon: Minus, label: "Thinking About Selling", color: 'text-yellow-400' },
                      { leads: contactedDNWTS, icon: AlertCircle, label: "Doesn't Want to Sell", color: 'text-red-400' },
                      { leads: contactedUnset, icon: Clock, label: "Outcome Not Set", color: 'text-muted-foreground' },
                    ].map(({ leads: bucket, icon: Icon, label, color }) => bucket.length > 0 && (
                      <div key={label}>
                        <p className={cn("text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5", color)}>
                          <Icon className="h-3.5 w-3.5" />{label} ({bucket.length})
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {bucket.map(l => renderContactedCard(l))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Dead Deal — separate section with 2 sub-buckets */}
          {(deadLeads.length > 0 || true) && (
            <div className="mt-1 pt-3 border-t border-border">
              <div
                className={cn(
                  'cursor-pointer rounded-lg p-1.5 -mx-1.5 transition-colors',
                  expandedStage === 'DEAD' ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-secondary/30'
                )}
                onClick={() => setExpandedStage(prev => prev === 'DEAD' ? null : 'DEAD')}
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-gray-500 inline-block" />
                    6. Dead Deal
                  </span>
                  <span className="text-muted-foreground text-xs">{deadLeads.length} {deadLeads.length === 1 ? 'lead' : 'leads'}</span>
                </div>
              </div>

              {expandedStage === 'DEAD' && (
                <div className="mt-3 space-y-4">
                  {/* Sub-bucket 1: RE company */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5" />
                      Real Estate Company Bought It ({deadRE.length})
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {deadRE.length > 0
                        ? deadRE.map(l => renderDeadCard(l))
                        : <p className="text-xs text-muted-foreground">None</p>}
                    </div>
                  </div>

                  {/* Sub-bucket 2: Doesn't want to sell */}
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Doesn't Want to Sell ({deadNS.length})
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {deadNS.length > 0
                        ? deadNS.map(l => renderDeadCard(l))
                        : <p className="text-xs text-muted-foreground">None</p>}
                    </div>
                  </div>

                  {/* Unset reason */}
                  {deadUnset.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        Reason Not Set ({deadUnset.length})
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {deadUnset.map(l => renderDeadCard(l))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
