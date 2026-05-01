import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { fhirClient } from '@/lib/fhir-client';
import { patientToFHIR, conditionToFHIR, observationToFHIR, medicationStatementToFHIR, procedureToFHIR } from '@/lib/fhir-mapper';

/**
 * POST /api/fhir/sync
 * Sendet alle Patienten ohne sync_token an den FHIR-Server und aktualisiert sync_token
 */
export async function POST() {
    const connection = await getDbConnection();
    try {
        const [patients] = await connection.execute(
            'SELECT * FROM patients WHERE sync_token IS NULL OR sync_token = ""'
        );

        const results: Array<{ id: string; fhirId?: string; error?: string }> = [];

        for (const patient of patients as any[]) {
            try {
                // Patient senden
                const fhirPatient = patientToFHIR(patient);
                const sentPatient = await fhirClient.sendPatient(fhirPatient);
                const fhirPatientId = sentPatient.id!;

                // Conditions senden
                const [conditions] = await connection.execute(
                    'SELECT * FROM conditions WHERE patient_id = ?',
                    [patient.id]
                );
                for (const c of conditions as any[]) {
                    const fhirCond = conditionToFHIR(c, fhirPatientId);
                    await fhirClient.sendCondition(fhirCond as any);
                }

                // Observations senden
                const [observations] = await connection.execute(
                    'SELECT * FROM observations WHERE patient_id = ?',
                    [patient.id]
                );
                for (const o of observations as any[]) {
                    const fhirObs = observationToFHIR(o, fhirPatientId);
                    await fhirClient.sendObservation(fhirObs as any);
                }

                // MedicationStatements senden
                const [medications] = await connection.execute(
                    'SELECT * FROM medication_statements WHERE patient_id = ?',
                    [patient.id]
                );
                for (const m of medications as any[]) {
                    const fhirMed = medicationStatementToFHIR(m, fhirPatientId);
                    await fhirClient.sendMedicationStatement(fhirMed);
                }

                // Procedures senden
                const [procedures] = await connection.execute(
                    'SELECT * FROM procedures WHERE patient_id = ?',
                    [patient.id]
                );
                for (const p of procedures as any[]) {
                    const fhirProc = procedureToFHIR(p, fhirPatientId);
                    await fhirClient.sendProcedure(fhirProc);
                }

                // sync_token aktualisieren
                await connection.execute(
                    'UPDATE patients SET sync_token = ? WHERE id = ?',
                    [fhirPatientId, patient.id]
                );

                results.push({ id: patient.id, fhirId: fhirPatientId });
            } catch (err: any) {
                results.push({ id: patient.id, error: err?.message || 'Unbekannter Fehler' });
            }
        }

        return NextResponse.json({ success: true, count: results.length, results });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Sync fehlgeschlagen' }, { status: 500 });
    } finally {
        await connection.end();
    }
}
