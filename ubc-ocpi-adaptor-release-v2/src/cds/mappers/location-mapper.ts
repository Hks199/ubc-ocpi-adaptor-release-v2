// Maps OCPI Location format to CDS/UBC format
export class LocationMapper {
    toCDS(ocpiLocation: any): any {
        // Convert OCPI location to CDS format
        // This is a placeholder - actual mapping depends on CDS API specification
        return {
            id: ocpiLocation.locationId,
            name: ocpiLocation.name,
            address: ocpiLocation.address,
            coordinates: ocpiLocation.coordinates,
            evses: ocpiLocation.evses,
            // Add other CDS-specific fields as needed
        };
    }

    fromCDS(cdsLocation: any): any {
        // Convert CDS location to OCPI format
        return {
            id: cdsLocation.id,
            name: cdsLocation.name,
            address: cdsLocation.address,
            coordinates: cdsLocation.coordinates,
            evses: cdsLocation.evses,
        };
    }
}

export const locationMapper = new LocationMapper();
