// apps/web/src/components/maps/use-geocode-search.ts — NEW (Part B, item 6)
//
// Forward geocoding for the free-text "Location" input on the project
// create form — before this, typing a location did nothing to the map;
// the pin had to be dragged by hand every time. Debounced 400ms+ against
// OpenStreetMap Nominatim's public search endpoint (same "no API key"
// choice location-map-picker.tsx already made for its own tiles), with a
// User-Agent header per Nominatim's usage policy
// (https://operations.osmfoundation.org/policies/nominatim/ — "provide a
// valid HTTP Referer or User-Agent identifying the application").
import { useEffect, useRef, useState } from "react";

export interface GeocodeSuggestion {
  displayName: string;
  latitude: number;
  longitude: number;
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
// Nominatim asks for a descriptive identifier, not a browser UA string —
// browsers silently drop a custom User-Agent header on fetch/XHR anyway, so
// this is sent as best-effort (works from non-browser callers/tests) and
// paired with the documented Referer the browser sends automatically.
const USER_AGENT = "EasyConstruct-Demo/1.0 (construction-management-thesis-project)";
const DEBOUNCE_MS = 450;
const MIN_QUERY_LENGTH = 3;

/**
 * Debounced Nominatim forward-geocoding search. Returns the live query
 * state, the latest suggestions, a loading flag, and a `search(query)`
 * setter the input's onChange calls directly.
 */
export function useGeocodeSearch() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setLoading(false);
      setError(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      const requestId = ++requestIdRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);

      const url = `${NOMINATIM_URL}?format=jsonv2&limit=5&addressdetails=0&q=${encodeURIComponent(trimmed)}`;
      fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      })
        .then((res) => {
          if (!res.ok) throw new Error(`Nominatim returned ${res.status}`);
          return res.json();
        })
        .then((rows: { display_name: string; lat: string; lon: string }[]) => {
          // A stale response landing after a newer request must not
          // overwrite the newer one's suggestions.
          if (requestId !== requestIdRef.current) return;
          setSuggestions(
            rows.map((r) => ({
              displayName: r.display_name,
              latitude: Number(r.lat),
              longitude: Number(r.lon),
            })),
          );
        })
        .catch((err) => {
          if (err?.name === "AbortError") return;
          if (requestId !== requestIdRef.current) return;
          setSuggestions([]);
          setError("Couldn't search that location — check your connection and try again.");
        })
        .finally(() => {
          if (requestId === requestIdRef.current) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { query, setQuery, suggestions, loading, error, clearSuggestions: () => setSuggestions([]) };
}
