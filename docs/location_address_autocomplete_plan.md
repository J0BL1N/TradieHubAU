# Google Places & Location Autocomplete Plan (De-emphasised for Beta)

This document outlines the foundation setup for Google Places address autocomplete integration in TradieHubAU.

## 1. Beta Default Approach: Local National Database
For the public beta launch (`v0.1.0`), TradieHubAU defaults to using its own **local location database (public.location_suburbs and public.location_regions)**.
- **No Google API Required**: The default flow uses a lightweight, self-hosted postcode/region database.
- **Zero Paid APIs**: Search and selection work completely keyless.

## 2. Google Places as Premium/Later Enhancement
Google Places remains implemented as an optional, later premium enhancement. If enabled, it allows:
- Full street address search.
- Exact lat/lng geolocation mapping.
- Automatically mapping to local State/Region/Suburb options.

### Setup Steps in Google Cloud Console (If Enabled):
1. **Create a Project** on the Google Cloud Console.
2. **Enable APIs**: Enable the **Maps JavaScript API** and **Places API** (Places API Web Service or Places API New).
3. **Billing**: Associate a billing account with the Google Cloud project (required by Google for API key activation).
4. **Key Restrictions (Production)**:
   - Restrict the API key to "HTTP referrers (web sites)".
   - Add your authorized domains (e.g., `*.tradiehub.au/*`, `localhost/*`).
   - Restrict API usage to the Maps JavaScript API and Places API to prevent abuse.

---

## 3. Alternative/Future Autocomplete Options
- **Geoapify/Other Providers**: Can be integrated as future address autocomplete endpoints.
- **Full G-NAF Address Import**: Future advanced phases can import G-NAF's raw 15+ million address records directly into PostgreSQL for custom keyless address autocomplete.
- **Nominatim Warning**: Public OpenStreetMap Nominatim servers **must NOT** be used for autocomplete searches due to strict rate limits and terms of service limitations.

---

## 4. Reusable Autocomplete Component

The `GooglePlacesAutocomplete` component (`frontend/src/components/GooglePlacesAutocomplete.tsx`) is designed with defensive coding best practices:
- **Zero-Dependency Crash Avoidance**: If `VITE_GOOGLE_MAPS_API_KEY` is undefined or the script load fails, it operates as a standard text input field.
- **Form Submission Integrity**: Manual address entry still works, and form validations are not blocked by Google API issues.

---

## 5. Database Schema Foundation

Migration `087_add_google_places_location_fields.sql` introduces these fields:
- `formatted_address` (text): Full formatted string from Google Places.
- `place_id` (text): Unique Places identifier.
- `latitude` (numeric): Geographic latitude.
- `longitude` (numeric): Geographic longitude.

### Target Tables:
- **`public.jobs`**: Stored on job creation for precise location-based tradie routing.
- **`public.users`**: Stored on customer/tradie profiles to establish home or service radius coordinates.

The migration also adjusts the `protect_job_lifecycle_updates` trigger function allowlist to allow users to update these new location coordinates when editing open jobs before quotes are received.
