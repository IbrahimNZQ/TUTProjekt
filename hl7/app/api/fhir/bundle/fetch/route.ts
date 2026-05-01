import { NextResponse } from 'next/server';
import { fhirClient } from '@/lib/fhir-client';
import type { FHIRBundle } from '@/lib/fhir-client';

/**
 * GET /api/fhir/bundle/fetch
 * Ruft ein Bundle vom FHIR-Server ab (entweder per Bundle ID oder Patient Identifier)
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const bundleId = searchParams.get('bundleId');
        const patientIdentifier = searchParams.get('patientIdentifier');

        if (!bundleId && !patientIdentifier) {
            return NextResponse.json(
                { error: 'Either bundleId or patientIdentifier is required' },
                { status: 400 }
            );
        }

        let bundle: FHIRBundle;

        if (bundleId) {
            // Bundle direkt vom Server abrufen
            bundle = await fhirClient.receiveBundle(bundleId);
        } else if (patientIdentifier) {
            // Patient nach Identifier suchen und Bundle mit verwandten Ressourcen abrufen
            bundle = await fhirClient.receivePatientByIdentifier(patientIdentifier);
        } else {
            return NextResponse.json(
                { error: 'Either bundleId or patientIdentifier is required' },
                { status: 400 }
            );
        }

        return NextResponse.json(bundle);
    } catch (error: any) {
        console.error('Error fetching bundle from FHIR server:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch bundle from FHIR server' },
            { status: 500 }
        );
    }
}

