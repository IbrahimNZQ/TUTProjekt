/**
 * Resource Handler Implementierungen für alle FHIR-Ressourcentypen
 */

import type { ResourceHandler, ResourceHandlerResult } from './fhir-resource-registry';
import type { MySQLConnection } from './db';
import { generateUUID } from './db';
import { extractPatientId } from './fhir-resource-registry';
import { fhirToCondition, fhirToObservation, fhirToMedicationStatement, fhirToProcedure } from './fhir-mapper';
import type { FHIRCondition, FHIRObservation, FHIRMedicationStatement, FHIRProcedure } from './fhir-client';

/**
 * Konvertiert ISO-8601 Datum zu MySQL DATETIME Format (YYYY-MM-DD HH:MM:SS)
 */
export function convertToMySQLDateTime(isoDate: string | null | undefined): string | null {
  if (!isoDate) return null;
  
  if (isoDate.includes(' ') && !isoDate.includes('T')) {
    return isoDate;
  }
  
  const mysqlDate = isoDate
    .replace('T', ' ')
    .replace(/\.\d{3}Z?$/, '')
    .replace(/Z$/, '');
  
  return mysqlDate;
}

/**
 * Condition Handler
 */
export const conditionHandler: ResourceHandler = {
  async process(resource, patientId, connection, patientMap): Promise<ResourceHandlerResult> {
    const fhirCondition = resource as FHIRCondition;
    
    if (!patientId) {
      const patientRef = fhirCondition.subject?.reference;
      return {
        id: fhirCondition.id || generateUUID(),
        resourceType: 'Condition',
        success: false,
        error: `Patient reference not found: ${patientRef}`,
      };
    }

    const conditionData = fhirToCondition(fhirCondition, patientId);
    const conditionId = fhirCondition.id || generateUUID();

    // Konvertiere Datumsfelder
    const recordedDate = convertToMySQLDateTime(conditionData.recorded_date);
    const onsetDateTime = convertToMySQLDateTime(conditionData.onset_datetime || null);
    const abatementDateTime = convertToMySQLDateTime(conditionData.abatement_datetime || null);

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

    // Notizen speichern
    if (fhirCondition.note && fhirCondition.note.length > 0) {
      await connection.execute(
        'DELETE FROM condition_notes WHERE condition_id = ?',
        [conditionId]
      );
      
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

    return {
      id: conditionId,
      patientId,
      resourceType: 'Condition',
      success: true,
    };
  },
};

/**
 * Observation Handler
 */
export const observationHandler: ResourceHandler = {
  async process(resource, patientId, connection, patientMap): Promise<ResourceHandlerResult> {
    const fhirObservation = resource as FHIRObservation;
    
    if (!patientId) {
      const patientRef = fhirObservation.subject?.reference;
      return {
        id: fhirObservation.id || generateUUID(),
        resourceType: 'Observation',
        success: false,
        error: `Patient reference not found: ${patientRef}`,
      };
    }

    const observationData = fhirToObservation(fhirObservation, patientId);
    const observationId = fhirObservation.id || generateUUID();
    const effectiveDateTime = convertToMySQLDateTime(observationData.effective_datetime);

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
        observationData.category_code || null,
        observationData.category_display || null,
        observationData.value_quantity_value || null,
        observationData.value_quantity_unit || null,
        observationData.value_quantity_system || null,
        observationData.value_quantity_code || null,
        observationData.interpretation_code || null,
        observationData.interpretation_display || null,
        effectiveDateTime,
        observationData.note_text || null,
      ]
    );

    return {
      id: observationId,
      patientId,
      resourceType: 'Observation',
      success: true,
    };
  },
};

/**
 * MedicationStatement Handler
 */
export const medicationStatementHandler: ResourceHandler = {
  async process(resource, patientId, connection, patientMap): Promise<ResourceHandlerResult> {
    const fhirMedication = resource as FHIRMedicationStatement;
    
    if (!patientId) {
      const patientRef = fhirMedication.subject?.reference;
      return {
        id: fhirMedication.id || generateUUID(),
        resourceType: 'MedicationStatement',
        success: false,
        error: `Patient reference not found: ${patientRef}`,
      };
    }

    const medicationData = fhirToMedicationStatement(fhirMedication, patientId);
    const medicationId = fhirMedication.id || generateUUID();
    const recordedDate = convertToMySQLDateTime(medicationData.recorded_date);
    const effectivePeriodStart = convertToMySQLDateTime(medicationData.effective_period_start || null);
    const effectivePeriodEnd = convertToMySQLDateTime(medicationData.effective_period_end || null);

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
        medicationData.medication_system || null,
        medicationData.medication_code || null,
        medicationData.medication_display || null,
        effectivePeriodStart,
        effectivePeriodEnd,
        medicationData.dosage_text || null,
        medicationData.dosage_route_code || null,
        medicationData.dosage_route_display || null,
        medicationData.note_text || null,
        recordedDate,
      ]
    );

    return {
      id: medicationId,
      patientId,
      resourceType: 'MedicationStatement',
      success: true,
    };
  },
};

/**
 * Procedure Handler mit Complications Support
 */
export const procedureHandler: ResourceHandler = {
  async process(resource, patientId, connection, patientMap): Promise<ResourceHandlerResult> {
    const fhirProcedure = resource as FHIRProcedure;
    
    if (!patientId) {
      const patientRef = fhirProcedure.subject?.reference;
      return {
        id: fhirProcedure.id || generateUUID(),
        resourceType: 'Procedure',
        success: false,
        error: `Patient reference not found: ${patientRef}`,
      };
    }

    const procedureData = fhirToProcedure(fhirProcedure, patientId);
    const procedureId = fhirProcedure.id || generateUUID();
    const recordedDate = convertToMySQLDateTime(procedureData.recorded_date);
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

    return {
      id: procedureId,
      patientId,
      resourceType: 'Procedure',
      success: true,
    };
  },
};
