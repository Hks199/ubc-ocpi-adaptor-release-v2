
// Address type
export type BecknAddress = {
    streetAddress?: string;
    addressLocality?: string;
    addressRegion?: string;
    postalCode?: string;
    addressCountry?: string;
};

// Geo coordinates type
export type BecknGeo = {
    type: "Point";
    coordinates: [number, number];
};

// Location type
export type BecknLocation = {
    "@type": "beckn:Location";
    geo?: BecknGeo;
    address?: BecknAddress;
};

// Service Location type (with required geo and address)
export type BecknServiceLocation = {
    geo: BecknGeo;
    "@type"?: "beckn:Location";
    address: BecknAddress;
};

