# Google Places & Location Autocomplete Plan

This document outlines the foundation setup for Google Places address autocomplete integration in TradieHubAU.

## 1. Environment Variable Configuration

To enable the address autocomplete search feature, define the following variable in your local `.env` and production Cloudflare/hosting environment:

```env
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

### Setup Steps in Google Cloud Console:
1. **Create a Project** on the Google Cloud Console.
2. **Enable APIs**: Enable the **Maps JavaScript API** and **Places API** (Places API Web Service or Places API New).
3. **Billing**: Associate a billing account with the Google Cloud project (required by Google for API key activation).
4. **Key Restrictions (Production)**:
   - Restrict the API key to "HTTP referrers (web sites)".
   - Add your authorized domains (e.g., `*.tradiehub.au/*`, `localhost/*`).
   - Restrict API usage to the Maps JavaScript API and Places API to prevent abuse.

---

## 2. Reusable Autocomplete Component

The `GooglePlacesAutocomplete` component (`frontend/src/components/GooglePlacesAutocomplete.tsx`) is designed with defensive coding best practices:
- **Zero-Dependency Crash Avoidance**: If `VITE_GOOGLE_MAPS_API_KEY` is undefined or the script load fails, it operates as a standard text input field.
- **Form Submission Integrity**: Manual address entry still works, and form validations are not blocked by Google API issues.

---

## 3. Database Schema Foundation

Migration `087_add_google_places_location_fields.sql` introduces these fields:
- `formatted_address` (text): Full formatted string from Google Places.
- `place_id` (text): Unique Places identifier.
- `latitude` (numeric): Geographic latitude.
- `longitude` (numeric): Geographic longitude.

### Target Tables:
- **`public.jobs`**: Stored on job creation for precise location-based tradie routing.
- **`public.users`**: Stored on customer/tradie profiles to establish home or service radius coordinates.

The migration also adjusts the `protect_job_lifecycle_updates` trigger function allowlist to allow users to update these new location coordinates when editing open jobs before quotes are received.
