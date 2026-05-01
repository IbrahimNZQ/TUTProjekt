import { NextResponse } from 'next/server';
import { fhirClient } from '@/lib/fhir-client';
import { getDbConnection, generateUUID } from '@/lib/db';
import { fhirToPatient, fhirToCondition, fhirToObservation, fhirToMedicationStatement, fhirToProcedure } from '@/lib/fhir-mapper';
import { convertToMySQLDateTime } from '@/lib/fhir-resource-handlers';

/**
 * POST /api/fhir/receive
 * Empfängt Daten vom FHIR-Server und speichert sie in der Datenbank
 */
export async function POST(request: Request) {
    let connection: any = null;
    try {
        const { fhirPatientId } = await request.json();

        if (!fhirPatientId) {
            return NextResponse.json(
                { error: 'FHIR Patient ID is required' },
                { status: 400 }
            );
        }

        connection = await getDbConnection();

        // Patient vom FHIR-Server empfangen als Bundle mit verwandten Ressourcen
        let bundle: any;
        try {
            bundle = await fhirClient.receivePatient(fhirPatientId);
        } catch (error: any) {
            console.error('Error fetching patient from FHIR server:', error);
            if (connection) {
                try {
                    await connection.end();
                } catch (closeError) {
                    console.error('Error closing connection:', closeError);
                }
            }
            return NextResponse.json(
                { error: `Failed to fetch patient from FHIR server: ${error.message || 'Unknown error'}` },
                { status: 500 }
            );
        }
        
        // Finde Patient im Bundle
        if (!bundle || !bundle.entry || !Array.isArray(bundle.entry)) {
            await connection.end();
            return NextResponse.json(
                { error: 'Invalid Bundle response from FHIR server' },
                { status: 500 }
            );
        }

        // Prüfe ob Bundle leer ist
        if (bundle.entry.length === 0) {
            await connection.end();
            return NextResponse.json(
                { error: `Patient with ID ${fhirPatientId} not found on FHIR server` },
                { status: 404 }
            );
        }

        const patientEntry = bundle.entry.find((e: any) => e.resource?.resourceType === 'Patient');
        if (!patientEntry || !patientEntry.resource) {
            await connection.end();
            return NextResponse.json(
                { error: 'Patient not found in Bundle' },
                { status: 404 }
            );
        }
        
        const fhirPatient = patientEntry.resource;
        
        const patientData = fhirToPatient(fhirPatient);

        // Wenn Patient explizit importiert wird, entferne ihn aus deleted_sync_tokens
        // damit er wieder importiert werden kann (Benutzer möchte ihn explizit wiederherstellen)
        try {
            await connection.execute(
                'DELETE FROM deleted_sync_tokens WHERE sync_token = ?',
                [fhirPatientId]
            );
        } catch (error: any) {
            // Ignoriere Fehler wenn Tabelle nicht existiert (für Backwards-Kompatibilität)
            console.warn('Could not remove from deleted_sync_tokens:', error.message);
        }

        // Patient in Datenbank einfügen oder aktualisieren
        // Suche zuerst nach sync_token, dann nach KV-Nummer (falls vorhanden)
        let existingPatient: any[] = [];

        // Suche nach sync_token (höchste Priorität)
        const [patientBySyncToken] = await connection.execute(
            'SELECT id FROM patients WHERE sync_token = ?',
            [fhirPatientId]
        );
        existingPatient = patientBySyncToken as any[];

        // Falls nicht gefunden und KV-Nummer vorhanden, suche nach KV-Nummer
        if (existingPatient.length === 0 && patientData.kv_nummer) {
            const [patientByKvNummer] = await connection.execute(
                'SELECT id FROM patients WHERE kv_nummer = ?',
                [patientData.kv_nummer]
            );
            existingPatient = patientByKvNummer as any[];
        }

        let dbPatientId: string;

        if (existingPatient.length > 0) {
            // Patient existiert bereits - aktualisieren
            // Vom FHIR-Server empfangene Patienten werden als fremd markiert
            dbPatientId = existingPatient[0].id;
            await connection.execute(
                            `UPDATE patients SET 
                    kv_nummer = COALESCE(?, kv_nummer),
                    firstname = COALESCE(?, firstname),
                    lastname = COALESCE(?, lastname),
                    birthdate = COALESCE(?, birthdate),
                    gender = COALESCE(?, gender),
                    street = COALESCE(?, street),
                    zip = COALESCE(?, zip),
                    city = COALESCE(?, city),
                    phone = COALESCE(?, phone),
                    email = COALESCE(?, email),
                    is_external = ?,
                    sync_token = ?
                    WHERE id = ?`,
                            [
                    patientData.kv_nummer || undefined,
                    patientData.firstname || null,
                    patientData.lastname || undefined,
                    patientData.birthdate || undefined,
                    patientData.gender || undefined,
                    patientData.street || undefined,
                    patientData.zip || undefined,
                    patientData.city || undefined,
                    patientData.phone || undefined,
                    patientData.email || undefined,
                    true, // Vom FHIR-Server empfangene Patienten sind fremd
                    fhirPatientId,
                    dbPatientId,
                ]
            );
        } else {
            // Neuen Patient einfügen
            dbPatientId = generateUUID();
            await connection.execute(
                `INSERT INTO patients 
          (id, kv_nummer, firstname, lastname, birthdate, gender, street, zip, city, phone, email, is_external, sync_token)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    dbPatientId,
                    patientData.kv_nummer || undefined,
                    patientData.firstname || 'Unknown', // Fallback für NOT NULL Feld
                    patientData.lastname || 'Unknown', // Fallback für NOT NULL Feld
                    patientData.birthdate || null,
                    patientData.gender || undefined,
                    patientData.street || null,
                    patientData.zip || undefined,
                    patientData.city || undefined,
                    patientData.phone || undefined,
                    patientData.email || undefined,
                    patientData.is_external || true,
                    fhirPatientId,
                ]
            );
        }

        // Verwandte Ressourcen aus Bundle extrahieren (falls vorhanden)
        let fhirConditions: any[] = [];
        let fhirObservations: any[] = [];
        let fhirMedicationStatements: any[] = [];
        let fhirProcedures: any[] = [];
        
        if (bundle && bundle.entry) {
            // Extrahiere alle Ressourcen aus dem Bundle
            for (const entry of bundle.entry) {
                const resource = entry.resource;
                if (!resource) continue;
                
                switch (resource.resourceType) {
                    case 'Condition':
                        fhirConditions.push(resource);
                        break;
                    case 'Observation':
                        fhirObservations.push(resource);
                        break;
                    case 'MedicationStatement':
                        fhirMedicationStatements.push(resource);
                        break;
                    case 'Procedure':
                        fhirProcedures.push(resource);
                        break;
                }
            }
        } else {
            // Fallback: Wenn kein Bundle vorhanden, einzeln abrufen
            fhirConditions = await fhirClient.receiveConditions(fhirPatientId);
            fhirObservations = await fhirClient.receiveObservations(fhirPatientId);
            fhirMedicationStatements = await fhirClient.receiveMedicationStatements(fhirPatientId);
            fhirProcedures = await fhirClient.receiveProcedures(fhirPatientId);
        }

        // Conditions hinzufügen/aktualisieren ohne lokale zu löschen
        for (const fhirCondition of fhirConditions) {
            const conditionData = fhirToCondition(fhirCondition, dbPatientId.toString());
            const conditionId = fhirCondition.id || generateUUID();

            // Prüfe ob Condition bereits existiert (basierend auf FHIR-ID oder Code-Kombination)
            const [existingConditions] = await connection.execute(
                'SELECT id FROM conditions WHERE id = ? OR (patient_id = ? AND code_value = ? AND code_display = ?)',
                [conditionId, dbPatientId, conditionData.code_value, conditionData.code_display]
            );

            const existingCondition = (existingConditions as any[])[0];
            const finalConditionId = existingCondition?.id || conditionId;

            // Konvertiere Datumsfelder von ISO-Format zu MySQL-Format
            const onsetDateTime = convertToMySQLDateTime(conditionData.onset_datetime || null);
            const abatementDateTime = convertToMySQLDateTime(conditionData.abatement_datetime || null);
            const recordedDate = convertToMySQLDateTime(conditionData.recorded_date || null);

            await connection.execute(
                `INSERT INTO conditions 
          (id, patient_id, code_system, code_value, code_display, clinical_status_code, clinical_status_system, 
           verification_status_code, verification_status_system, severity_code, severity_display,
           body_site_code, body_site_display, category_code, category_display,
           onset_datetime, abatement_datetime, recorded_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         code_system = VALUES(code_system),
         code_value = VALUES(code_value),
         code_display = VALUES(code_display),
         clinical_status_code = VALUES(clinical_status_code),
         clinical_status_system = VALUES(clinical_status_system),
         verification_status_code = VALUES(verification_status_code),
         verification_status_system = VALUES(verification_status_system),
         severity_code = VALUES(severity_code),
         severity_display = VALUES(severity_display),
         body_site_code = VALUES(body_site_code),
         body_site_display = VALUES(body_site_display),
         category_code = VALUES(category_code),
         category_display = VALUES(category_display),
         onset_datetime = VALUES(onset_datetime),
         abatement_datetime = VALUES(abatement_datetime),
         recorded_date = VALUES(recorded_date)`,
                [
                    finalConditionId,
                    conditionData.patient_id,
                    conditionData.code_system,
                    conditionData.code_value,
                    conditionData.code_display,
                    conditionData.clinical_status_code,
                    conditionData.clinical_status_system,
                    conditionData.verification_status_code,
                    conditionData.verification_status_system,
                    conditionData.severity_code,
                    conditionData.severity_display,
                    conditionData.body_site_code,
                    conditionData.body_site_display,
                    conditionData.category_code,
                    conditionData.category_display,
                    onsetDateTime,
                    abatementDateTime,
                    recordedDate,
                ]
            );

            // Notizen speichern
            if (fhirCondition.note && fhirCondition.note.length > 0) {
                // Lösche alte Notizen für diese Condition
                await connection.execute(
                    'DELETE FROM condition_notes WHERE condition_id = ?',
                    [finalConditionId]
                );

                // Füge neue Notizen ein
                for (const note of fhirCondition.note) {
                    const noteId = generateUUID();
                    await connection.execute(
                        `INSERT INTO condition_notes (id, condition_id, text)
                        VALUES (?, ?, ?)`,
                        [noteId, finalConditionId, note.text]
                    );
                }
            }
        }

        // Observations hinzufügen/aktualisieren ohne lokale zu löschen
        for (const fhirObservation of fhirObservations) {
            const observationData = fhirToObservation(fhirObservation, dbPatientId.toString());
            const observationId = fhirObservation.id || generateUUID();
            
            // Konvertiere Datumsfelder von ISO-Format zu MySQL-Format
            const effectiveDateTime = convertToMySQLDateTime(observationData.effective_datetime || null);
            
            await connection.execute(
                `INSERT INTO observations 
          (id, patient_id, status, code_system, code_value, code_display, category_code, category_display,
           value_quantity_value, value_quantity_unit, value_quantity_system, value_quantity_code, 
           interpretation_code, interpretation_display, effective_datetime, note_text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         value_quantity_value = VALUES(value_quantity_value),
         effective_datetime = VALUES(effective_datetime)`,
                [
                    observationId,
                    observationData.patient_id,
                    observationData.status,
                    observationData.code_system,
                    observationData.code_value,
                    observationData.code_display,
                    observationData.category_code,
                    observationData.category_display,
                    observationData.value_quantity_value,
                    observationData.value_quantity_unit,
                    observationData.value_quantity_system,
                    observationData.value_quantity_code,
                    observationData.interpretation_code,
                    observationData.interpretation_display,
                    effectiveDateTime,
                    observationData.note_text,
                ]
            );
        }

        // MedicationStatements hinzufügen/aktualisieren ohne lokale zu löschen
        for (const fhirMedication of fhirMedicationStatements) {
            const medicationData = fhirToMedicationStatement(fhirMedication, dbPatientId.toString());
            const medicationId = fhirMedication.id || generateUUID();
            
            // Konvertiere Datumsfelder von ISO-Format zu MySQL-Format
            const effectivePeriodStart = convertToMySQLDateTime(medicationData.effective_period_start || null);
            const effectivePeriodEnd = convertToMySQLDateTime(medicationData.effective_period_end || null);
            const recordedDate = convertToMySQLDateTime(medicationData.recorded_date || null);
            
            await connection.execute(
                `INSERT INTO medication_statements 
          (id, patient_id, status, medication_system, medication_code, medication_display,
           effective_period_start, effective_period_end, dosage_text, dosage_route_code, 
           dosage_route_display, note_text, recorded_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         medication_system = VALUES(medication_system),
         medication_code = VALUES(medication_code),
         medication_display = VALUES(medication_display),
         effective_period_start = VALUES(effective_period_start),
         effective_period_end = VALUES(effective_period_end),
         dosage_text = VALUES(dosage_text),
         dosage_route_code = VALUES(dosage_route_code),
         dosage_route_display = VALUES(dosage_route_display),
         note_text = VALUES(note_text),
         recorded_date = VALUES(recorded_date)`,
                [
                    medicationId,
                    medicationData.patient_id,
                    medicationData.status,
                    medicationData.medication_system,
                    medicationData.medication_code,
                    medicationData.medication_display,
                    effectivePeriodStart,
                    effectivePeriodEnd,
                    medicationData.dosage_text,
                    medicationData.dosage_route_code,
                    medicationData.dosage_route_display,
                    medicationData.note_text,
                    recordedDate,
                ]
            );
        }

        // Procedures hinzufügen/aktualisieren ohne lokale zu löschen
        for (const fhirProcedure of fhirProcedures) {
            const procedureData = fhirToProcedure(fhirProcedure, dbPatientId.toString());
            const procedureId = fhirProcedure.id || generateUUID();

            // Konvertiere Datumsfelder von ISO-Format zu MySQL-Format
            const recordedDate = convertToMySQLDateTime(procedureData.recorded_date) || convertToMySQLDateTime(new Date().toISOString());
            const performedDateTime = convertToMySQLDateTime(procedureData.performed_datetime || null);
            const performedPeriodStart = convertToMySQLDateTime(procedureData.performed_period_start || null);
            const performedPeriodEnd = convertToMySQLDateTime(procedureData.performed_period_end || null);

            await connection.execute(
                `INSERT INTO procedures 
          (id, patient_id, status, status_reason_code, status_reason_display, category_code, category_display,
           code_system, code_value, code_display, body_site_code, body_site_display,
           performed_datetime, performed_period_start, performed_period_end,
           outcome_code, outcome_display, performer_actor_reference, performer_function_code,
           performer_function_display, location_reference, recorded_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         status_reason_code = VALUES(status_reason_code),
         status_reason_display = VALUES(status_reason_display),
         category_code = VALUES(category_code),
         category_display = VALUES(category_display),
         code_system = VALUES(code_system),
         code_value = VALUES(code_value),
         code_display = VALUES(code_display),
         body_site_code = VALUES(body_site_code),
         body_site_display = VALUES(body_site_display),
         performed_datetime = VALUES(performed_datetime),
         performed_period_start = VALUES(performed_period_start),
         performed_period_end = VALUES(performed_period_end),
         outcome_code = VALUES(outcome_code),
         outcome_display = VALUES(outcome_display),
         performer_actor_reference = VALUES(performer_actor_reference),
         performer_function_code = VALUES(performer_function_code),
         performer_function_display = VALUES(performer_function_display),
         location_reference = VALUES(location_reference),
         recorded_date = VALUES(recorded_date)`,
                [
                    procedureId,
                    procedureData.patient_id,
                    procedureData.status,
                    procedureData.status_reason_code || null,
                    procedureData.status_reason_display || null,
                    procedureData.category_code || null,
                    procedureData.category_display || null,
                    procedureData.code_system,
                    procedureData.code_value,
                    procedureData.code_display,
                    procedureData.body_site_code || null,
                    procedureData.body_site_display || null,
                    performedDateTime,
                    performedPeriodStart,
                    performedPeriodEnd,
                    procedureData.outcome_code || null,
                    procedureData.outcome_display || null,
                    procedureData.performer_actor_reference || null,
                    procedureData.performer_function_code || null,
                    procedureData.performer_function_display || null,
                    procedureData.location_reference || null,
                    recordedDate,
                ]
            );

            // Procedure Complications speichern
            if (fhirProcedure.complication && fhirProcedure.complication.length > 0) {
                // Lösche alte Komplikationen für diese Procedure
                await connection.execute(
                    'DELETE FROM procedure_complications WHERE procedure_id = ?',
                    [procedureId]
                );

                // Füge neue Komplikationen ein
                for (const complication of fhirProcedure.complication) {
                    const complicationCoding = complication.coding?.[0];
                    if (complicationCoding?.code) {
                        const complicationId = generateUUID();
                        await connection.execute(
                            `INSERT INTO procedure_complications (id, procedure_id, complication_code, complication_display)
                            VALUES (?, ?, ?, ?)`,
                            [
                                complicationId,
                                procedureId,
                                complicationCoding.code,
                                complicationCoding.display || null,
                            ]
                        );
                    }
                }
            }
        }

        await connection.end();

        return NextResponse.json({
            success: true,
            message: 'Data received from FHIR server successfully',
            patientId: dbPatientId,
            conditionsCount: fhirConditions.length,
            observationsCount: fhirObservations.length,
            medicationStatementsCount: fhirMedicationStatements.length,
            proceduresCount: fhirProcedures.length,
        });
    } catch (error: any) {
        console.error('Error receiving from FHIR server:', error);
        if (connection) {
            try {
                await connection.end();
            } catch (closeError) {
                console.error('Error closing connection:', closeError);
            }
        }
        return NextResponse.json(
            { error: error.message || 'Failed to receive data from FHIR server' },
            { status: 500 }
        );
    }
}
