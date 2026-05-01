import { NextResponse } from 'next/server';
import { getDbConnection, generateUUID } from '@/lib/db';
import { fhirClient } from '@/lib/fhir-client';
import { conditionToFHIR, patientToFHIR } from '@/lib/fhir-mapper';

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
 * POST /api/patients/[id]/conditions
 * Erstellt eine neue Condition (Diagnose) für einen Patienten
 */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: patientId } = await params;
        const conditionData = await request.json();

        // Validierung
        if (!conditionData.code_value || !conditionData.code_display) {
            return NextResponse.json(
                { error: 'Code-Wert und Code-Display sind erforderlich' },
                { status: 400 }
            );
        }

        const connection = await getDbConnection();

        // Prüfe ob Patient existiert
        const [patientRows] = await connection.execute(
            'SELECT * FROM patients WHERE id = ?',
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

        // Condition erstellen
        const conditionId = generateUUID();
        
        // Konvertiere Datumsfelder zu MySQL Format
        const recordedDate = convertToMySQLDateTime(
            conditionData.recorded_date || new Date().toISOString()
        );
        const onsetDateTime = convertToMySQLDateTime(conditionData.onset_datetime);
        const abatementDateTime = convertToMySQLDateTime(conditionData.abatement_datetime);
        
        await connection.execute(
            `INSERT INTO conditions 
            (id, patient_id, code_system, code_value, code_display, clinical_status_code, clinical_status_system,
             verification_status_code, verification_status_system, severity_code, severity_display,
             body_site_code, body_site_display, category_code, category_display,
             onset_datetime, abatement_datetime, recorded_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                conditionId,
                patientId,
                conditionData.code_system || 'http://fhir.de/CodeSystem/bfarm/icd-10-gm',
                conditionData.code_value,
                conditionData.code_display,
                conditionData.clinical_status_code || 'active',
                conditionData.clinical_status_system || 'http://terminology.hl7.org/CodeSystem/condition-clinical',
                conditionData.verification_status_code || 'confirmed',
                conditionData.verification_status_system || 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
                conditionData.severity_code || null,
                conditionData.severity_display || null,
                conditionData.body_site_code || null,
                conditionData.body_site_display || null,
                conditionData.category_code || null,
                conditionData.category_display || null,
                onsetDateTime,
                abatementDateTime,
                recordedDate,
            ]
        );

        // Notizen speichern, falls vorhanden
        if (conditionData.note_text) {
            const noteId = generateUUID();
            await connection.execute(
                `INSERT INTO condition_notes (id, condition_id, text)
                VALUES (?, ?, ?)`,
                [noteId, conditionId, conditionData.note_text]
            );
        }

        // Condition aus Datenbank abrufen (inkl. Notizen) für FHIR-Versand
        const [conditionRows] = await connection.execute(
            'SELECT * FROM conditions WHERE id = ?',
            [conditionId]
        );
        const conditionFromDb = (conditionRows as any[])[0];

        // Notizen für diese Condition abrufen
        const [noteRows] = await connection.execute(
            'SELECT text FROM condition_notes WHERE condition_id = ?',
            [conditionId]
        );
        const notes = (noteRows as any[]).map(row => row.text);

        // An FHIR-Server senden (wenn nicht explizit deaktiviert)
        let fhirConditionId = null;
        if (conditionData.syncToFHIR !== false) {
            try {
                let fhirPatientId = patient.sync_token;
                
                // Patient immer aktualisieren/synchronisieren mit aktuellen Attributen
                const fhirPatient = patientToFHIR(patient as any);
                
                if (fhirPatientId) {
                    // Patient existiert bereits auf HAPI - aktualisieren mit PUT
                    fhirPatient.id = fhirPatientId;
                    const updatedPatient = await fhirClient.updateResource(fhirPatient);
                    fhirPatientId = updatedPatient.id!;
                    console.log(`Patient ${patientId} aktualisiert auf HAPI (FHIR ID: ${fhirPatientId})`);
                } else {
                    // Patient noch nicht synchronisiert - erstellen mit POST
                    const sentPatient = await fhirClient.sendPatient(fhirPatient);
                    fhirPatientId = sentPatient.id!;
                    console.log(`Patient ${patientId} erstellt auf HAPI (FHIR ID: ${fhirPatientId})`);
                }
                
                // Sync-Token in DB speichern/aktualisieren
                await connection.execute(
                    'UPDATE patients SET sync_token = ? WHERE id = ?',
                    [fhirPatientId, patientId]
                );

                // Condition an HAPI senden (mit Notizen)
                const fhirCondition = conditionToFHIR(conditionFromDb, fhirPatientId);
                
                // Notizen hinzufügen, falls vorhanden
                if (notes.length > 0) {
                    fhirCondition.note = notes.map(text => ({ text }));
                }
                
                // Debug: Logge die Condition vor dem Senden
                console.log(`Sending Condition to HAPI:`, JSON.stringify({
                    resourceType: fhirCondition.resourceType,
                    subject: fhirCondition.subject,
                    code: fhirCondition.code,
                    clinicalStatus: fhirCondition.clinicalStatus,
                }, null, 2));
                
                const sentCondition = await fhirClient.sendCondition(fhirCondition as any);
                fhirConditionId = sentCondition.id;
                
                console.log(`Condition ${conditionId} erfolgreich an HAPI gesendet (FHIR ID: ${fhirConditionId}, Patient FHIR ID: ${fhirPatientId})`);
            } catch (fhirError: any) {
                console.error('FHIR Send Error:', fhirError);
                // Condition wurde lokal gespeichert, FHIR-Versand fehlgeschlagen
                // Fehler wird geloggt, aber nicht weitergegeben, damit die Condition lokal gespeichert bleibt
            }
        }

        await connection.end();

        return NextResponse.json({
            success: true,
            message: 'Condition erfolgreich erstellt',
            conditionId,
            fhirId: fhirConditionId,
        }, { status: 201 });
    } catch (error: any) {
        console.error('Error creating condition:', error);
        return NextResponse.json(
            { error: error.message || 'Condition konnte nicht erstellt werden' },
            { status: 500 }
        );
    }
}
