import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Building2 } from 'lucide-react';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('renders the title, value, and icon', () => {
    render(<StatCard title="Eviction Leads" value={3139} icon={Building2} variant="primary" />);
    expect(screen.getByText('Eviction Leads')).toBeTruthy();
    expect(screen.getByText('3,139')).toBeTruthy();
  });

  it('renders an upward trend with an up arrow', () => {
    render(<StatCard title="MLS Leads" value={10} trend={{ direction: 'up', label: '12% vs last 30 days' }} />);
    expect(screen.getByText(/▲/)).toBeTruthy();
    expect(screen.getByText(/12% vs last 30 days/)).toBeTruthy();
  });

  it('renders a downward trend with a down arrow', () => {
    render(<StatCard title="Overdue" value={2} trend={{ direction: 'down', label: '5% vs last 30 days' }} />);
    expect(screen.getByText(/▼/)).toBeTruthy();
  });

  it('wraps the icon in a tinted circle whose tint follows the variant', () => {
    const { container } = render(<StatCard title="Deals" value={8} icon={Building2} variant="success" />);
    const circle = container.querySelector('span.rounded-full');
    expect(circle).toBeTruthy();
    expect(circle?.className).toContain('bg-success/15');
    expect(circle?.className).toContain('text-success');
  });
});
