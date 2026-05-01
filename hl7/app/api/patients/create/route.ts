import { NextResponse } from 'next/server';
import { getDbConnection, generateUUID } from '@/lib/db';
import { fhirClient } from '@/lib/fhir-client';
import { patientToFHIR } from '@/lib/fhir-mapper';

/**
 * POST /api/patients/create
 * Legt einen neuen Patienten an und sendet ihn an den FHIR-Server
 */
export async function POST(request: Request) {
    try {
        const patientData = await request.json();

        // Validierung
        if (!patientData.kv_nummer || !patientData.firstname || !patientData.lastname) {
            return NextResponse.json(
                { error: 'KV-Nummer, Vorname und Nachname sind erforderlich' },
                { status: 400 }
            );
        }

        const connection = await getDbConnection();

        // Prüfe ob Patient bereits existiert
        const [existing] = await connection.execute(
            'SELECT id FROM patients WHERE kv_nummer = ?',
            [patientData.kv_nummer]
        );

        if ((existing as any[]).length > 0) {
            await connection.end();
            return NextResponse.json(
                { error: 'Patient mit dieser KV-Nummer existiert bereits' },
                { status: 409 }
            );
        }

        // Patient lokal speichern (is_external = false = eigener Patient)
        const patientId = generateUUID();
        const [result] = await connection.execute(
            `INSERT INTO patients 
        (id, kv_nummer, firstname, lastname, birthdate, gender, street, zip, city, phone, email, provider_name, provider_id, is_external)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                patientId,
                patientData.kv_nummer,
                patientData.firstname,
                patientData.lastname,
                patientData.birthdate || null,
                patientData.gender || null,
                patientData.street || null,
                patientData.zip || null,
                patientData.city || null,
                patientData.phone || null,
                patientData.email || null,
                patientData.provider_name || null,
                patientData.provider_id || null,
                false, // is_external = false für lokal angelegte Patienten
            ]
        );

        const dbPatientId = patientId;

        // Jetzt den Patienten an FHIR-Server senden
        const patientFromDb = {
            id: dbPatientId,
            kv_nummer: patientData.kv_nummer,
            firstname: patientData.firstname,
            lastname: patientData.lastname,
            birthdate: patientData.birthdate || null,
            gender: patientData.gender || null,
            street: patientData.street || null,
            zip: patientData.zip || null,
            city: patientData.city || null,
            phone: patientData.phone || null,
            email: patientData.email || null,
            provider_name: patientData.provider_name || null,
            provider_id: patientData.provider_id || null,
            is_external: false,
            sync_token: undefined,
        };

        try {
            const fhirPatient = patientToFHIR(patientFromDb);
            const sentPatient = await fhirClient.sendPatient(fhirPatient);

            // Speichere FHIR ID als sync_token
            await connection.execute(
                'UPDATE patients SET sync_token = ? WHERE id = ?',
                [sentPatient.id, dbPatientId]
            );

            await connection.end();

            return NextResponse.json({
                success: true,
                message: 'Patient erfolgreich angelegt und an FHIR-Server gesendet',
                patientId: dbPatientId,
                fhirId: sentPatient.id,
            });
        } catch (fhirError: any) {
            // Patient wurde lokal gespeichert, aber FHIR-Versand fehlgeschlagen
            await connection.end();
            console.error('FHIR Send Error:', fhirError);

            return NextResponse.json({
                success: true,
                warning: 'Patient lokal gespeichert, aber FHIR-Versand fehlgeschlagen',
                patientId: dbPatientId,
                error: fhirError.message,
            }, { status: 201 });
        }
    } catch (error: any) {
        console.error('Error creating patient:', error);
        return NextResponse.json(
            { error: error.message || 'Patient konnte nicht angelegt werden' },
            { status: 500 }
        );
    }
}
