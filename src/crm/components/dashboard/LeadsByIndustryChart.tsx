import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Lead } from '@/crm/data/types'

type LeadsByIndustryChartProps = {
  leads: Lead[]
}

export function LeadsByIndustryChart({ leads }: LeadsByIndustryChartProps) {
  const data = useMemo(() => {
    const counts = new Map<string, number>()
    for (const lead of leads) {
      counts.set(lead.industry, (counts.get(lead.industry) ?? 0) + 1)
    }

    return Array.from(counts.entries()).map(([industry, count]) => ({
      industry,
      count,
    }))
  }, [leads])

  if (data.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
        Add a few contacts to see the relationship mix.
      </div>
    )
  }

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis
            dataKey="industry"
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: 'hsl(var(--muted))' }}
            contentStyle={{
              borderRadius: '12px',
              border: '1px solid hsl(var(--border))',
              background: 'hsl(var(--background))',
            }}
          />
          <Bar dataKey="count" radius={[8, 8, 0, 0]} fill="hsl(var(--primary))" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
