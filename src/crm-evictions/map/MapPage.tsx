import { useCallback, useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2 } from 'lucide-react';
import { getGeocodeStatus, getMapPoints } from '../api/evictionsCrm';
import { STAGES, SERVICE_INTERESTS, type Stage } from '../constants';
import type { GeocodeStatus, MapPoint } from '../types/crm';
import { ErrorBanner } from '../components/ErrorBanner';
import { LeadProfile } from '../leads/LeadProfile';

/** Bexar County, so an empty map still opens somewhere meaningful. */
const SAN_ANTONIO: [number, number] = [29.4241, -98.4936];

/**
 * Pin colours per stage. These are hex rather than Tailwind tokens because
 * Leaflet paints to canvas/SVG outside React's class-driven styling.
 */
const STAGE_COLOR: Record<string, string> = {
  'New Lead': '#94a3b8',
  Researching: '#e8a33d',
  'Ready to Contact': '#1d4ed8',
  'Attempted Contact': '#1d4ed8',
  Contacted: '#2563eb',
  'Follow-Up': '#e8a33d',
  'Appointment Scheduled': '#7c3aed',
  Interested: '#15803d',
  'Not Interested': '#94a3b8',
  'Under Contract': '#15803d',
  Closed: '#166534',
  'Do Not Contact': '#a94738',
};

const colorFor = (stage: string) => STAGE_COLOR[stage] || '#94a3b8';

export function MapPage() {
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [status, setStatus] = useState<GeocodeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stage, setStage] = useState('');
  const [service, setService] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestSeq.current;
    setLoading(true);
    setError('');
    try {
      const [data, geo] = await Promise.all([getMapPoints({ stage, service }), getGeocodeStatus()]);
      if (requestSeq.current !== requestId) return;
      setPoints(data.points);
      setStatus(geo);
    } catch (e) {
      if (requestSeq.current !== requestId) return;
      setError(e instanceof Error ? e.message : 'Unable to load the map');
    } finally {
      if (requestSeq.current === requestId) setLoading(false);
    }
  }, [stage, service]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 flex flex-col h-full">
      <div className="mb-4">
        <p className="label mb-1">Geography</p>
        <h1 className="text-2xl font-semibold">Map</h1>
        <p className="text-sm text-muted-foreground">
          Landlord mailing addresses from eviction filings &mdash; not verified rental locations
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
        <select className="h-10 rounded-md border bg-background px-2 text-sm" value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="">All stages</option>
          {STAGES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="h-10 rounded-md border bg-background px-2 text-sm" value={service} onChange={(e) => setService(e.target.value)}>
          <option value="">All services</option>
          {SERVICE_INTERESTS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <div className="flex items-center text-xs text-muted-foreground">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : `${points.length.toLocaleString()} plotted`}
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {status && !status.complete && (
        <div className="mb-3 rounded-md border bg-card p-3 text-sm">
          <span className="font-medium">{status.ok.toLocaleString()}</span> of{' '}
          <span className="font-medium">{status.total.toLocaleString()}</span> addresses geocoded
          {status.failed > 0 && <> &middot; {status.failed.toLocaleString()} could not be resolved</>}
          {status.pending > 0 && (
            <div className="text-muted-foreground mt-1">
              {status.pending.toLocaleString()} still pending. Run{' '}
              <code className="text-xs">scripts/geocode-eviction-addresses.js</code> to fill them in.
            </div>
          )}
        </div>
      )}

      <div className="flex-1 min-h-[420px] rounded-lg border overflow-hidden">
        <MapContainer center={SAN_ANTONIO} zoom={11} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MarkerClusterGroup chunkedLoading maxClusterRadius={50}>
            {points.map((p) => (
              <CircleMarker
                key={p.id}
                center={[p.lat, p.lng]}
                radius={6}
                pathOptions={{ color: colorFor(p.contactStage), fillColor: colorFor(p.contactStage), fillOpacity: 0.8, weight: 1 }}
              >
                <Popup>
                  <div className="text-sm">
                    <p className="font-semibold">{p.landlordName}</p>
                    <p className="text-xs">{p.address}</p>
                    <p className="text-xs mt-1">{p.contactStage}</p>
                    <button className="text-xs underline mt-2" onClick={() => setOpenId(p.landlordId)}>
                      Open lead
                    </button>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MarkerClusterGroup>
        </MapContainer>
      </div>

      {openId && <LeadProfile leadId={openId} onClose={() => setOpenId(null)} onSaved={load} />}
    </div>
  );
}
