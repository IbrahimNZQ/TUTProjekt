import { NextResponse } from 'next/server';
import { getDbConnection, generateUUID } from '@/lib/db';
import { fhirClient } from '@/lib/fhir-client';
import { medicationStatementToFHIR } from '@/lib/fhir-mapper';

/**
 * Konvertiert ISO-8601 Datum zu MySQL DATETIME Format (YYYY-MM-DD HH:MM:SS)
 */
function convertToMySQLDateTime(isoDate: string | null | undefined): string | null {
    if (!isoDate) return null;
    
    // Wenn bereits im MySQL Format (enthält Leerzeichen statt T)
    if (isoDate.includes(' ') && !isoDate.includes('T')) {
        return isoDate;
    }
    
    // Konvertiere ISO-8601 zu MySQL Format
    // Entferne 'Z' und Millisekunden, ersetze 'T' mit Leerzeichen
    const mysqlDate = isoDate
        .replace('T', ' ')
        .replace(/\.\d{3}Z?$/, '')
        .replace(/Z$/, '');
    
    return mysqlDate;
}

/**
 * POST /api/patients/[id]/medications
 * Erstellt eine neue MedicationStatement (Medikation) für einen Patienten
 */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: patientId } = await params;
        const medicationData = await request.json();

        // Validierung
        if (!medicationData.medication_code || !medicationData.medication_display) {
            return NextResponse.json(
                { error: 'Medikations-Code und Display sind erforderlich' },
                { status: 400 }
            );
        }

        const connection = await getDbConnection();

        // Prüfe ob Patient existiert
        const [patientRows] = await connection.execute(
            'SELECT id, sync_token FROM patients WHERE id = ?',
            [patientId]
        );

        if ((patientRows as any[]).length === 0) {
            await connection.end();
            return NextResponse.json(
                { error: 'Patient nicht gefunden' },
                { status: 404 }
            );
        }

        const patient = (patientRows as any[])[0];

        // MedicationStatement erstellen
        const medicationId = generateUUID();
        
        // Konvertiere Datumsfelder zu MySQL Format
        const recordedDate = convertToMySQLDateTime(
            medicationData.recorded_date || new Date().toISOString()
        );
        const effectivePeriodStart = convertToMySQLDateTime(medicationData.effective_period_start);
        const effectivePeriodEnd = convertToMySQLDateTime(medicationData.effective_period_end);
        
        await connection.execute(
            `INSERT INTO medication_statements 
            (id, patient_id, status, medication_system, medication_code, medication_display,
             effective_period_start, effective_period_end, dosage_text, dosage_route_code, 
             dosage_route_display, note_text, recorded_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                medicationId,
                patientId,
                medicationData.status || 'active',
                medicationData.medication_system || 'http://www.whocc.no/atc',
                medicationData.medication_code,
                medicationData.medication_display,
                effectivePeriodStart,
                effectivePeriodEnd,
                medicationData.dosage_text || null,
                medicationData.dosage_route_code || null,
                medicationData.dosage_route_display || null,
                medicationData.note_text || null,
                recordedDate,
            ]
        );

        // Optional: An FHIR-Server senden, wenn Patient synchronisiert ist
        let fhirMedicationId = null;
        if (patient.sync_token && medicationData.syncToFHIR !== false) {
            try {
                const medicationFromDb = {
                    id: medicationId,
                    patient_id: patientId,
                    status: medicationData.status || 'active',
                    medication_system: medicationData.medication_system || 'http://www.whocc.no/atc',
                    medication_code: medicationData.medication_code,
                    medication_display: medicationData.medication_display,
                    effective_period_start: medicationData.effective_period_start,
                    effective_period_end: medicationData.effective_period_end,
                    dosage_text: medicationData.dosage_text,
                    dosage_route_code: medicationData.dosage_route_code,
                    dosage_route_display: medicationData.dosage_route_display,
                    note_text: medicationData.note_text,
                    recorded_date: medicationData.recorded_date || new Date().toISOString(),
                };

                const fhirMedication = medicationStatementToFHIR(medicationFromDb, patient.sync_token);
                const sentMedication = await fhirClient.sendMedicationStatement(fhirMedication);
                fhirMedicationId = sentMedication.id;
            } catch (fhirError: any) {
                console.error('FHIR Send Error:', fhirError);
                // MedicationStatement wurde lokal gespeichert, FHIR-Versand fehlgeschlagen
            }
        }

        await connection.end();

        return NextResponse.json({
            success: true,
            message: 'MedicationStatement erfolgreich erstellt',
            medicationId,
            fhirId: fhirMedicationId,
        }, { status: 201 });
    } catch (error: any) {
        console.error('Error creating medication:', error);
        return NextResponse.json(
            { error: error.message || 'MedicationStatement konnte nicht erstellt werden' },
            { status: 500 }
        );
    }
}
