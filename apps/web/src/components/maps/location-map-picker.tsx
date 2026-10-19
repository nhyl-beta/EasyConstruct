// apps/web/src/components/maps/location-map-picker.tsx — NEW
//
// Map-based location picker (#5) with an auto-derived geofence (#6): click
// or drag the pin to set siteLatitude/siteLongitude, and the geofence circle
// follows it at the current radius (defaulting to the schema's own default —
// apps/api/src/db/schema/projects.ts's `geofence_radius_m default 300` — the
// first time a point is pinned with no radius set yet).
//
// Leaflet + OpenStreetMap tiles: no API key, no existing map dependency in
// the app to reuse (checked — see punch-list item #5/#6), and both packages
// together are a few hundred KB, small enough for a form field.
//
// Built on the raw Leaflet API rather than react-leaflet's <MapContainer>:
// react-leaflet initializes the map from a mount effect against a DOM node
// it renders itself, and under React 18/19 StrictMode's double-invoke of
// mount effects that throws "Map container is already initialized" — the
// second init call hits a container Leaflet already attached itself to,
// and the map (and the page around it, with no error boundary here) crashes.
// Driving Leaflet directly from our own effect lets the cleanup function run
// synchronously between the two invocations, and clearing `_leaflet_id`
// defends against it either way.
import "leaflet/dist/leaflet.css";

import { useEffect, useRef } from "react";
import L from "leaflet";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

// Leaflet's default marker icon references image URLs that don't survive a
// Vite bundle (relative paths resolved against leaflet's own package dir,
// not the built asset location) — rebuild it from bundled asset URLs.
import markerIconUrl from "leaflet/dist/images/marker-icon.png";
import markerIcon2xUrl from "leaflet/dist/images/marker-icon-2x.png";
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png";

const defaultIcon = L.icon({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIcon2xUrl,
  shadowUrl: markerShadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const DEFAULT_GEOFENCE_RADIUS_M = 300;
const DEFAULT_CENTER: [number, number] = [12.8797, 121.774]; // Philippines, matches existing coordinate placeholders

interface LocationMapPickerProps {
  latitude: number | null;
  longitude: number | null;
  radiusM: number | null;
  onChange: (next: { latitude: number; longitude: number; radiusM: number }) => void;
  className?: string;
}

export function LocationMapPicker({
  latitude,
  longitude,
  radiusM,
  onChange,
  className,
}: LocationMapPickerProps) {
  const hasPin = latitude != null && longitude != null;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  // Always current inside Leaflet's event handlers, which close over
  // whatever `onChange`/`radiusM` were at mount time otherwise.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const radiusRef = useRef(radiusM);
  radiusRef.current = radiusM;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Defends against StrictMode's mount → cleanup → mount replay landing on
    // the same DOM node before Leaflet considers itself detached from it.
    if ((el as unknown as { _leaflet_id?: number })._leaflet_id) {
      delete (el as unknown as { _leaflet_id?: number })._leaflet_id;
    }

    const map = L.map(el, {
      center: hasPin ? [latitude as number, longitude as number] : DEFAULT_CENTER,
      zoom: hasPin ? 15 : 6,
    });
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    const setPin = (lat: number, lng: number) => {
      onChangeRef.current({
        latitude: Math.round(lat * 1e7) / 1e7,
        longitude: Math.round(lng * 1e7) / 1e7,
        radiusM: radiusRef.current ?? DEFAULT_GEOFENCE_RADIUS_M,
      });
    };

    map.on("click", (e: L.LeafletMouseEvent) => setPin(e.latlng.lat, e.latlng.lng));

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
    // Only ever constructed once per mounted container; position/radius
    // updates below are applied imperatively instead of re-creating the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the marker + geofence circle in sync with props without tearing the
  // map down (re-running the effect above would re-trigger the StrictMode
  // issue this component exists to avoid).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!hasPin) {
      markerRef.current?.remove();
      markerRef.current = null;
      circleRef.current?.remove();
      circleRef.current = null;
      return;
    }

    const pos: L.LatLngExpression = [latitude as number, longitude as number];
    const radius = radiusM ?? DEFAULT_GEOFENCE_RADIUS_M;

    if (!markerRef.current) {
      const marker = L.marker(pos, { icon: defaultIcon, draggable: true }).addTo(map);
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        onChangeRef.current({
          latitude: Math.round(p.lat * 1e7) / 1e7,
          longitude: Math.round(p.lng * 1e7) / 1e7,
          radiusM: radiusRef.current ?? DEFAULT_GEOFENCE_RADIUS_M,
        });
      });
      markerRef.current = marker;
      map.setView(pos, 15);
    } else {
      markerRef.current.setLatLng(pos);
    }

    if (!circleRef.current) {
      circleRef.current = L.circle(pos, {
        radius,
        color: "rgb(110, 235, 37)",
        fillColor: "rgb(110, 235, 37)",
        fillOpacity: 0.15,
      }).addTo(map);
    } else {
      circleRef.current.setLatLng(pos);
      circleRef.current.setRadius(radius);
    }
  }, [hasPin, latitude, longitude, radiusM]);

  return (
    <div className={className}>
      {/* Q3: Leaflet's own CSS sets z-index up to 1000 on its zoom control
          and panes, which escaped above the app's sticky header once the
          page scrolled the map under it. `isolation: isolate` gives this
          wrapper its own stacking context, so nothing inside — regardless
          of Leaflet's internal z-index values — can ever paint above
          content outside this box. */}
      <div className="relative overflow-hidden rounded-xl border border-border" style={{ isolation: "isolate" }}>
        <div ref={containerRef} style={{ height: "280px", width: "100%" }} />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Click the map, or drag the pin, to set the project's site location.
        The geofence radius is set automatically and can be adjusted below.
      </p>

      {hasPin && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Coordinates</Label>
            <Input
              readOnly
              value={`${(latitude as number).toFixed(6)}, ${(longitude as number).toFixed(6)}`}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Geofence radius: {radiusM ?? DEFAULT_GEOFENCE_RADIUS_M} m</Label>
            <Slider
              min={10}
              max={2000}
              step={10}
              value={[radiusM ?? DEFAULT_GEOFENCE_RADIUS_M]}
              onValueChange={([v]) =>
                onChange({ latitude: latitude as number, longitude: longitude as number, radiusM: v })
              }
              className="py-2"
            />
          </div>
        </div>
      )}
    </div>
  );
}

LocationMapPicker.displayName = "LocationMapPicker";
