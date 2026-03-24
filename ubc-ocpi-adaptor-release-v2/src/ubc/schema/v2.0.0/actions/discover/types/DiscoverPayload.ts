import { UBCDiscoverContext } from "./DiscoverContext";

// Request payload for discover action
export type UBCDiscoverRequestPayload = {
    context: UBCDiscoverContext,
    message: {
        spatial: {
            op: string;
            targets: string;
            geometry: {
                type: string;
                coordinates: [number, number];
            };
            distanceMeters: number;
        }[];
    },
};