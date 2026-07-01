import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    google: any;
  }
}

export interface GooglePlaceResult {
  formatted_address: string;
  suburb: string;
  state: string;
  postcode: string;
  place_id: string;
  latitude: number;
  longitude: number;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelected?: (place: GooglePlaceResult) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

export default function GooglePlacesAutocomplete({
  value,
  onChange,
  onPlaceSelected,
  placeholder = "Search address...",
  className = "",
  required = false,
}: Props) {
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.warn("VITE_GOOGLE_MAPS_API_KEY is not defined. Google Places Autocomplete will fall back to manual text entry.");
      return;
    }

    if (window.google?.maps?.places) {
      setGoogleAvailable(true);
      return;
    }

    const scriptId = "google-maps-places-script";
    let script = document.getElementById(scriptId) as HTMLScriptElement;

    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&region=AU`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    const handleScriptLoad = () => {
      if (window.google?.maps?.places) {
        setGoogleAvailable(true);
      }
    };

    script.addEventListener("load", handleScriptLoad);

    return () => {
      script.removeEventListener("load", handleScriptLoad);
    };
  }, []);

  useEffect(() => {
    if (!googleAvailable || !inputRef.current) return;

    try {
      const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: "au" },
        fields: ["address_components", "formatted_address", "geometry", "place_id"],
        types: ["address"],
      });

      autocompleteRef.current = autocomplete;

      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (!place.address_components) return;

        let locality = ""; // Suburb
        let state = "";
        let postcode = "";

        for (const component of place.address_components) {
          const types = component.types;
          if (types.includes("locality")) {
            locality = component.long_name;
          } else if (types.includes("administrative_area_level_1")) {
            state = component.short_name; // VIC, NSW, QLD, etc.
          } else if (types.includes("postal_code")) {
            postcode = component.long_name;
          }
        }

        const lat = place.geometry?.location?.lat() || 0;
        const lng = place.geometry?.location?.lng() || 0;
        const formatted_address = place.formatted_address || "";

        onChange(formatted_address);

        if (onPlaceSelected) {
          onPlaceSelected({
            formatted_address,
            suburb: locality,
            state,
            postcode,
            place_id: place.place_id || "",
            latitude: lat,
            longitude: lng,
          });
        }
      });
    } catch (err) {
      console.error("Error initializing Google Places Autocomplete:", err);
    }
  }, [googleAvailable, onChange, onPlaceSelected]);

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
      required={required}
    />
  );
}
