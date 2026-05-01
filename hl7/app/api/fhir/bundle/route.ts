import { NextResponse } from 'next/server';
import { getDbConnection, generateUUID } from '@/lib/db';
import { fhirToPatient, fhirToCondition, fhirToObservation, fhirToMedicationStatement, fhirToProcedure } from '@/lib/fhir-mapper';
import { convertToMySQLDateTime } from '@/lib/fhir-resource-handlers';
import { fhirClient } from '@/lib/fhir-client';
import type { FHIRBundle, FHIRPatient, FHIRCondition, FHIRObservation, FHIRMedicationStatement, FHIRProcedure } from '@/lib/fhir-client';

/**
 * POST /api/fhir/bundle
 * Verarbeitet ein FHIR Transaction Bundle und speichert alle Ressourcen in der Datenbank
 */
export async function POST(request: Request) {
    const connection = await getDbConnection();
    try {
        const bundle: FHIRBundle = await request.json();

        if (!bundle.resourceType || bundle.resourceType !== 'Bundle') {
            await connection.end();
            return NextResponse.json(
                { error: 'Invalid bundle: resourceType must be Bundle' },
                { status: 400 }
            );
        }

        if (bundle.type !== 'transaction' && bundle.type !== 'batch') {
            await connection.end();
            return NextResponse.json(
                { error: 'Only transaction and batch bundles are supported' },
                { status: 400 }
            );
        }

        // Schritt 1: Bundle an HAPI FHIR-Server senden
        let hapiResponse: FHIRBundle | null = null;
        let hapiErrors: string[] = [];
        try {
            hapiResponse = await fhirClient.processBundle(bundle);
        } catch (error: any) {
            console.error('Error sending bundle to HAPI:', error);
            hapiErrors.push(`HAPI send error: ${error.message}`);
            // Weiter mit DB-Speicherung auch wenn HAPI fehlschlägt
        }

        // Schritt 2: Daten in lokale Datenbank speichern
        const results: any = {
            patients: [],
            conditions: [],
            observations: [],
            medicationStatements: [],
            procedures: [],
            errors: [],
        };

        // Erste Phase: Alle Patienten verarbeiten (müssen zuerst existieren)
        const patientMap = new Map<string, { fhirId: string; dbId: string }>();

        for (const entry of bundle.entry || []) {
            if (entry.resource?.resourceType === 'Patient') {
                try {
                    const fhirPatient = entry.resource as FHIRPatient;
                    const patientData = fhirToPatient(fhirPatient);
                    const fhirPatientId = fhirPatient.id || entry.request?.url?.split('/').pop() || generateUUID();

                    // Prüfe ob Patient bereits existiert
                    // Suche zuerst nach sync_token, dann nach KV-Nummer (falls vorhanden)
                    let existingPatient: any[] = [];
                    
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

                    if ((existingPatient as any[]).length > 0) {
                        // Patient existiert bereits - aktualisieren
                        // Bundle-Importierte Patienten werden als fremd markiert
                        dbPatientId = (existingPatient as any[])[0].id;
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
                                patientData.kv_nummer || null,
                                patientData.firstname || null,
                                patientData.lastname || null,
                                patientData.birthdate || null,
                                patientData.gender || null,
                                patientData.street || null,
                                patientData.zip || null,
                                patientData.city || null,
                                patientData.phone || null,
                                patientData.email || null,
                                true, // Bundle-Importierte Patienten sind immer fremd
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
                                patientData.kv_nummer || null, // Optional - kann null sein
                                patientData.firstname || 'Unknown', // Fallback für NOT NULL Feld
                                patientData.lastname || 'Unknown', // Fallback für NOT NULL Feld
                                patientData.birthdate || null,
                                patientData.gender || null,
                                patientData.street || null,
                                patientData.zip || null,
                                patientData.city || null,
                                patientData.phone || null,
                                patientData.email || null,
                                patientData.is_external || true,
                                fhirPatientId,
                            ]
                        );
                    }

                    patientMap.set(fhirPatientId, { fhirId: fhirPatientId, dbId: dbPatientId });
                    results.patients.push({ fhirId: fhirPatientId, dbId: dbPatientId });
                } catch (error: any) {
                    results.errors.push({ resource: 'Patient', error: error.message });
                }
            }
        }

        // Zweite Phase: Alle anderen Ressourcen verarbeiten
        for (const entry of bundle.entry || []) {
            const resource = entry.resource;
            if (!resource) continue;

            try {
                // Patient-Referenz auflösen (unterstützt verschiedene Referenzformate)
                const getPatientId = (reference: string | undefined): string | null => {
                    if (!reference) return null;
                    
                    // Entferne führende # für interne Referenzen
                    let refId = reference.startsWith('#') ? reference.substring(1) : reference;
                    
                    // Entferne URL-Präfix falls vorhanden
                    if (refId.includes('://')) {
                        refId = refId.split('/').pop() || refId;
                    }
                    
                    // Split nach / und nimm letzten Teil
                    const refParts = refId.split('/');
                    refId = refParts[refParts.length - 1];
                    
                    // Versuche verschiedene Formate zu finden
                    // 1. Direkte ID
                    if (patientMap.has(refId)) {
                        return patientMap.get(refId)?.dbId || null;
                    }
                    
                    // 2. Suche nach Patient/ID Format
                    if (refId.includes('Patient/')) {
                        const patientId = refId.replace('Patient/', '');
                        if (patientMap.has(patientId)) {
                            return patientMap.get(patientId)?.dbId || null;
                        }
                    }
                    
                    // 3. Durchsuche alle Einträge in patientMap
                    for (const [fhirId, { dbId }] of patientMap.entries()) {
                        if (fhirId === refId || fhirId.endsWith(refId) || refId.endsWith(fhirId)) {
                            return dbId;
                        }
                    }
                    
                    return null;
                };

                switch (resource.resourceType) {
                    case 'Condition': {
                        const fhirCondition = resource as FHIRCondition;
                        const patientRef = fhirCondition.subject?.reference;
                        const patientId = getPatientId(patientRef);

                        if (!patientId) {
                            results.errors.push({
                                resource: 'Condition',
                                error: `Patient reference not found: ${patientRef}`,
                            });
                            break;
                        }

                        const conditionData = fhirToCondition(fhirCondition, patientId);
                        const conditionId = fhirCondition.id || generateUUID();

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
                                conditionId,
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

                        // Notizen speichern (mehrere Notizen pro Condition möglich)
                        if (fhirCondition.note && fhirCondition.note.length > 0) {
                            // Lösche alte Notizen für diese Condition (um Duplikate zu vermeiden)
                            await connection.execute(
                                'DELETE FROM condition_notes WHERE condition_id = ?',
                                [conditionId]
                            );
                            
                            // Füge neue Notizen ein
                            for (const note of fhirCondition.note) {
                                if (note.text) {
                                    const noteId = generateUUID();
                                    await connection.execute(
                                        `INSERT INTO condition_notes (id, condition_id, text)
                                        VALUES (?, ?, ?)`,
                                        [noteId, conditionId, note.text]
                                    );
                                }
                            }
                        }

                        results.conditions.push({ id: conditionId, patientId });
                        break;
                    }

                    case 'Observation': {
                        const fhirObservation = resource as FHIRObservation;
                        const patientRef = fhirObservation.subject?.reference;
                        const patientId = getPatientId(patientRef);

                        if (!patientId) {
                            results.errors.push({
                                resource: 'Observation',
                                error: `Patient reference not found: ${patientRef}`,
                            });
                            break;
                        }

                        const observationData = fhirToObservation(fhirObservation, patientId);
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
                            code_system = VALUES(code_system),
                            code_value = VALUES(code_value),
                            code_display = VALUES(code_display),
                            category_code = VALUES(category_code),
                            category_display = VALUES(category_display),
                            value_quantity_value = VALUES(value_quantity_value),
                            value_quantity_unit = VALUES(value_quantity_unit),
                            value_quantity_system = VALUES(value_quantity_system),
                            value_quantity_code = VALUES(value_quantity_code),
                            interpretation_code = VALUES(interpretation_code),
                            interpretation_display = VALUES(interpretation_display),
                            effective_datetime = VALUES(effective_datetime),
                            note_text = VALUES(note_text)`,
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

                        results.observations.push({ id: observationId, patientId });
                        break;
                    }

                    case 'MedicationStatement': {
                        const fhirMedication = resource as FHIRMedicationStatement;
                        const patientRef = fhirMedication.subject?.reference;
                        const patientId = getPatientId(patientRef);

                        if (!patientId) {
                            results.errors.push({
                                resource: 'MedicationStatement',
                                error: `Patient reference not found: ${patientRef}`,
                            });
                            break;
                        }

                        const medicationData = fhirToMedicationStatement(fhirMedication, patientId);
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

                        results.medicationStatements.push({ id: medicationId, patientId });
                        break;
                    }

                    case 'Procedure': {
                        const fhirProcedure = resource as FHIRProcedure;
                        const patientRef = fhirProcedure.subject?.reference;
                        const patientId = getPatientId(patientRef);

                        if (!patientId) {
                            results.errors.push({
                                resource: 'Procedure',
                                error: `Patient reference not found: ${patientRef}`,
                            });
                            break;
                        }

                        const procedureData = fhirToProcedure(fhirProcedure, patientId);
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

                        results.procedures.push({ id: procedureId, patientId });
                        break;
                    }

                    case 'Patient':
                        // Bereits in Phase 1 verarbeitet
                        break;

                    default:
                        results.errors.push({
                            resource: resource.resourceType,
                            error: `Unsupported resource type: ${resource.resourceType}`,
                        });
                }
            } catch (error: any) {
                results.errors.push({
                    resource: resource.resourceType,
                    error: error.message,
                });
            }
        }

        await connection.end();

        return NextResponse.json({
            success: true,
            message: 'Bundle processed successfully',
            hapi: {
                sent: hapiResponse !== null,
                response: hapiResponse,
                errors: hapiErrors,
            },
            results: {
                patientsProcessed: results.patients.length,
                conditionsProcessed: results.conditions.length,
                observationsProcessed: results.observations.length,
                medicationStatementsProcessed: results.medicationStatements.length,
                proceduresProcessed: results.procedures.length,
                errors: results.errors.length,
            },
            details: results,
        });
    } catch (error: any) {
        console.error('Error processing bundle:', error);
        try {
            await connection.end();
        } catch (endError) {
            // Ignoriere Fehler beim Schließen der Verbindung
        }
        return NextResponse.json(
            { error: error.message || 'Failed to process bundle' },
            { status: 500 }
        );
    }
}
