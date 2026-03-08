'use client';

import { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';

interface Listing {
  address?: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  area?: string;
  source?: string;
  building_amenities?: {
    gym?: boolean;
    roof_deck?: boolean;
    pool?: boolean;
    doorman?: boolean;
  };
}

interface ListingsData {
  lastUpdated: string;
  listings: Listing[];
}

// Building coordinates (approximate)
const COORDS: Record<string, [number, number]> = {
  '70 pine street': [40.7066, -74.0074],
  '50 west street': [40.7092, -74.0172],
  '180 pearl street': [40.7051, -74.0045],
  '19 dutch street': [40.7095, -74.0075],
  '95 wall street': [40.7054, -74.0071],
  '88 fulton street': [40.7096, -74.0050],
  '25 broad street': [40.7056, -74.0114],
  '125 greenwich street': [40.7094, -74.0118],
  '360 east 65th street': [40.7635, -73.9583],
  '345 east 94th street': [40.7815, -73.9470],
  '240 east 86th street': [40.7781, -73.9509],
  '225 east 95th street': [40.7833, -73.9467],
  '1735 york avenue': [40.7732, -73.9478],
  '420 east 61st street': [40.7610, -73.9584],
  '220 east 72nd street': [40.7683, -73.9577],
  '333 east 83rd street': [40.7754, -73.9498],
};

function getCoords(address: string): [number, number] | null {
  const addrLower = address.toLowerCase().replace(/#.*$/, '').trim();
  for (const [key, coords] of Object.entries(COORDS)) {
    if (addrLower.includes(key) || key.includes(addrLower.split(' ').slice(0, 3).join(' '))) {
      return coords;
    }
  }
  // Default coords based on area
  return null;
}

export default function ApartmentsPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [filteredListings, setFilteredListings] = useState<Listing[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [filter, setFilter] = useState<'all' | 'fidi' | 'ues'>('all');
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    // Try filtered first, fall back to scraped
    fetch('/data/listings-filtered.json')
      .then(r => r.ok ? r.json() : fetch('/data/listings-scraped.json').then(r => r.json()))
      .then((data: ListingsData) => {
        setListings(data.listings);
        setFilteredListings(data.listings);
        setLastUpdated(data.lastUpdated);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load listings:', err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (filter === 'all') {
      setFilteredListings(listings);
    } else {
      setFilteredListings(listings.filter(l => l.area === filter));
    }
  }, [filter, listings]);

  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current || listings.length === 0) return;

    // Load Leaflet dynamically
    const loadMap = async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');

      if (mapInstance.current) {
        mapInstance.current.remove();
      }

      const map = L.map(mapRef.current!).setView([40.7400, -73.9900], 12);
      mapInstance.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(map);

      // Clear old markers
      markersRef.current.forEach(m => map.removeLayer(m));
      markersRef.current = [];

      // Add markers for filtered listings
      const bounds: [number, number][] = [];
      
      filteredListings.forEach(listing => {
        if (!listing.address) return;
        const coords = getCoords(listing.address);
        if (!coords) return;

        bounds.push(coords);
        
        const color = listing.area === 'fidi' ? '#4361ee' : '#7209b7';
        const icon = L.divIcon({
          className: 'custom-marker',
          html: `<div style="background:${color};width:20px;height:20px;border-radius:50%;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });

        const amenities = listing.building_amenities;
        const amenityTags = [];
        if (amenities?.gym) amenityTags.push('🏋️ Gym');
        if (amenities?.roof_deck) amenityTags.push('🌇 Roof');
        if (amenities?.pool) amenityTags.push('🏊 Pool');
        if (amenities?.doorman) amenityTags.push('🚪 Doorman');

        const marker = L.marker(coords, { icon })
          .addTo(map)
          .bindPopup(`
            <div style="min-width:200px;">
              <strong>${listing.address}</strong><br/>
              <span style="font-size:1.2em;color:#2563eb;">$${listing.price?.toLocaleString() || '?'}/mo</span><br/>
              ${listing.beds || '?'} bed · ${listing.baths || '?'} bath · ${listing.sqft ? listing.sqft + ' sqft' : ''}<br/>
              ${amenityTags.length > 0 ? '<div style="margin-top:4px;">' + amenityTags.join(' ') + '</div>' : ''}
              <div style="margin-top:8px;">
                <a href="https://streeteasy.com/for-rent/nyc?search=${encodeURIComponent(listing.address || '')}" 
                   target="_blank" style="color:#4361ee;">View on StreetEasy →</a>
              </div>
            </div>
          `);
        
        markersRef.current.push(marker);
      });

      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    };

    loadMap();
  }, [filteredListings]);

  const formatPrice = (price?: number) => price ? `$${price.toLocaleString()}` : 'N/A';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-slate-900 text-white p-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-xl font-bold mb-2">🏠 NYC Apartment Search</h1>
          <p className="text-sm text-gray-300 mb-3">2+ bed, 2+ bath, W/D, Gym, Roof Deck</p>
          
          <div className="flex gap-2">
            {(['all', 'fidi', 'ues'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                  filter === f 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                }`}
              >
                {f === 'all' ? 'All' : f === 'fidi' ? 'Financial District' : 'Upper East Side'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row" style={{ height: 'calc(100vh - 120px)' }}>
        {/* Map */}
        <div ref={mapRef} className="w-full lg:w-3/5 h-[50vh] lg:h-full" />

        {/* Listings */}
        <div className="w-full lg:w-2/5 overflow-y-auto bg-white border-l">
          <div className="p-4 border-b bg-gray-50">
            <div className="flex justify-between items-center">
              <span className="font-medium">{filteredListings.length} listings</span>
              <span className="text-sm text-gray-500">
                Updated: {lastUpdated ? new Date(lastUpdated).toLocaleDateString() : 'N/A'}
              </span>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading listings...</div>
          ) : (
            <div className="divide-y">
              {filteredListings.map((listing, i) => (
                <div 
                  key={i} 
                  className="p-4 hover:bg-gray-50 cursor-pointer"
                  onClick={() => {
                    const coords = listing.address ? getCoords(listing.address) : null;
                    if (coords && mapInstance.current) {
                      mapInstance.current.setView(coords, 16);
                      const marker = markersRef.current[i];
                      if (marker) marker.openPopup();
                    }
                  }}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      listing.area === 'fidi' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                    }`}>
                      {listing.area === 'fidi' ? 'FiDi' : 'UES'}
                    </span>
                    <span className="text-lg font-bold text-blue-600">{formatPrice(listing.price)}</span>
                  </div>
                  
                  <h3 className="font-medium text-gray-900">{listing.address || 'Unknown'}</h3>
                  
                  <div className="text-sm text-gray-600 mt-1">
                    {listing.beds} bed · {listing.baths} bath
                    {listing.sqft && ` · ${listing.sqft} sqft`}
                  </div>

                  {listing.building_amenities && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {listing.building_amenities.gym && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">🏋️ Gym</span>
                      )}
                      {listing.building_amenities.roof_deck && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">🌇 Roof</span>
                      )}
                      {listing.building_amenities.pool && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">🏊 Pool</span>
                      )}
                      {listing.building_amenities.doorman && (
                        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">🚪 Doorman</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
