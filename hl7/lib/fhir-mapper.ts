/**
 * Mapper: Datenbank <-> FHIR
 * Konvertierung zwischen SQL-Modell und FHIR-Ressourcen
 */

import type { Patient, Condition, Observation, MedicationStatement, Procedure } from './db';
import type { FHIRPatient, FHIRCondition, FHIRObservation, FHIRMedicationStatement, FHIRProcedure } from './fhir-client';

/**
 * SQL Patient -> FHIR Patient
 */
export function patientToFHIR(patient: Patient): FHIRPatient {
  const telecom: any[] = [];
  if (patient.phone) {
    telecom.push({
      system: 'phone',
      value: patient.phone,
    });
  }
  if (patient.email) {
    telecom.push({
      system: 'email',
      value: patient.email,
    });
  }

  const identifier: any[] = [];
  // Nur KV-Nummer hinzufügen, wenn vorhanden (optional)
  if (patient.kv_nummer) {
    identifier.push({
      system: 'http://fhir.de/NamingSystem/gkv/kvid-10',
      value: patient.kv_nummer,
    });
  }

  return {
    resourceType: 'Patient',
    identifier: identifier.length > 0 ? identifier : undefined,
    name: [
      {
        family: patient.lastname || 'Unknown',
        given: patient.firstname ? [patient.firstname] : ['Unknown'],
      },
    ],
    gender: mapGender(patient.gender),
    birthDate: patient.birthdate || undefined,
    address: patient.street ? [
      {
        line: [patient.street],
        city: patient.city || '',
        postalCode: patient.zip || '',
      },
    ] : undefined,
    telecom: telecom.length > 0 ? telecom : undefined,
  };
}

/**
 * FHIR Patient -> SQL Patient (partiell, ohne ID)
 */
export function fhirToPatient(fhir: FHIRPatient): Partial<Patient> {
  const kvId = fhir.identifier?.find(
    (id) => id.system === 'http://fhir.de/NamingSystem/gkv/kvid-10'
  );

  const name = fhir.name?.[0];
  const address = fhir.address?.[0];

  // Konvertiere birthDate von ISO 8601 zu YYYY-MM-DD Format
  let birthdate = fhir.birthDate || null;
  if (birthdate) {
    // Falls es ein DateTime-String ist (z.B. "1990-11-07T23:00:00.000Z"), extrahiere nur das Datum
    birthdate = birthdate.split('T')[0];
  }

  // Extrahiere telecom (Telefon/Email)
  const phone = fhir.telecom?.find(t => t.system === 'phone')?.value;
  const email = fhir.telecom?.find(t => t.system === 'email')?.value;

  return {
    kv_nummer: kvId?.value || undefined,
    firstname: name?.given?.[0] || undefined,
    lastname: name?.family || undefined,
    birthdate: birthdate || undefined,
    gender: mapGenderBack(fhir.gender) || undefined,
    street: address?.line?.[0] || undefined,
    zip: address?.postalCode || undefined,
    city: address?.city || undefined,
    phone: phone || undefined,
    email: email || undefined,
    is_external: true, // Markierung für vom FHIR-Server empfangene Daten
  };
}

/**
 * SQL Condition -> FHIR Condition
 */
export function conditionToFHIR(
  condition: Condition,
  patientFhirId: string
): FHIRCondition {
  const fhirCondition: FHIRCondition = {
    resourceType: 'Condition',
    subject: {
      reference: `Patient/${patientFhirId}`,
    },
    code: {
      coding: [
        {
          system: condition.code_system || 'http://fhir.de/CodeSystem/bfarm/icd-10-gm',
          code: condition.code_value,
          display: condition.code_display,
        },
      ],
    },
    clinicalStatus: {
      coding: [
        {
          system: condition.clinical_status_system || 'http://terminology.hl7.org/CodeSystem/condition-clinical',
          code: condition.clinical_status_code || 'active',
        },
      ],
    },
    verificationStatus: {
      coding: [
        {
          system: condition.verification_status_system || 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
          code: condition.verification_status_code || 'confirmed',
        },
      ],
    },
  };

  // Optional fields hinzufügen
  if (condition.recorded_date) {
    fhirCondition.recordedDate = condition.recorded_date;
  }

  if (condition.onset_datetime) {
    fhirCondition.onsetDateTime = condition.onset_datetime;
  }

  if (condition.abatement_datetime) {
    fhirCondition.abatementDateTime = condition.abatement_datetime;
  }

  if (condition.severity_code) {
    fhirCondition.severity = {
      coding: [
        {
          system: condition.severity_code,
          code: condition.severity_code,
          display: condition.severity_display,
        },
      ],
    };
  }

  if (condition.category_code) {
    fhirCondition.category = [
      {
        coding: [
          {
            system: condition.category_code,
            code: condition.category_code,
            display: condition.category_display,
          },
        ],
      },
    ];
  }

  if (condition.body_site_code) {
    fhirCondition.bodySite = [
      {
        coding: [
          {
            system: condition.body_site_code,
            code: condition.body_site_code,
            display: condition.body_site_display,
          },
        ],
      },
    ];
  }

  return fhirCondition;
}

/**
 * FHIR Condition -> SQL Condition (partiell)
 */
export function fhirToCondition(fhir: FHIRCondition, patientId: string): Partial<Condition> {
  const icd10 = fhir.code.coding.find(
    (c) => c.system?.includes('icd-10') || c.system?.includes('snomed')
  ) || fhir.code.coding[0];

  const severity = fhir.severity?.coding?.[0];
  const bodySite = fhir.bodySite?.[0]?.coding?.[0];
  const category = fhir.category?.[0]?.coding?.[0];

  return {
    patient_id: patientId,
    code_system: icd10?.system || 'http://fhir.de/CodeSystem/bfarm/icd-10-gm',
    code_value: icd10?.code || '',
    code_display: icd10?.display || '',
    clinical_status_code: fhir.clinicalStatus?.coding[0]?.code || 'active',
    clinical_status_system: fhir.clinicalStatus?.coding[0]?.system || 'http://terminology.hl7.org/CodeSystem/condition-clinical',
    verification_status_code: fhir.verificationStatus?.coding[0]?.code || 'confirmed',
    verification_status_system: fhir.verificationStatus?.coding[0]?.system || 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
    severity_code: severity?.code,
    severity_display: severity?.display,
    body_site_code: bodySite?.code,
    body_site_display: bodySite?.display,
    category_code: category?.code,
    category_display: category?.display,
    onset_datetime: fhir.onsetDateTime || null,
    abatement_datetime: fhir.abatementDateTime || null,
    recorded_date: fhir.recordedDate || new Date().toISOString(),
  };
}

/**
 * SQL Observation -> FHIR Observation
 */
export function observationToFHIR(
  observation: Observation,
  patientFhirId: string
): FHIRObservation {
  return {
    resourceType: 'Observation',
    status: (observation.status as any) || 'final',
    subject: {
      reference: `Patient/${patientFhirId}`,
    },
    code: {
      coding: [
        {
          system: observation.code_system || 'http://loinc.org',
          code: observation.code_value,
          display: observation.code_display,
        },
      ],
    },
    valueQuantity: observation.value_quantity_value !== undefined ? {
      value: observation.value_quantity_value,
      unit: observation.value_quantity_unit || '',
      system: observation.value_quantity_system,
      code: observation.value_quantity_code,
    } : undefined,
    effectiveDateTime: observation.effective_datetime,
  };
}

/**
 * FHIR Observation -> SQL Observation (partiell)
 */
export function fhirToObservation(fhir: FHIRObservation, patientId: string): Partial<Observation> {
  const loinc = fhir.code.coding.find((c) => c.system === 'http://loinc.org') || fhir.code.coding[0];
  const category = fhir.category?.[0]?.coding?.[0];
  const note = fhir.note?.[0]?.text;
  
  // Interpretation kann auch nur display ohne code haben
  const interpretation = fhir.interpretation?.[0];
  const interpretationCoding = interpretation?.coding?.[0];
  // Falls interpretation nur text hat, verwende das als display
  const interpretationDisplay = interpretationCoding?.display || interpretation?.text || interpretationCoding?.code;

  return {
    patient_id: patientId,
    status: fhir.status || 'final',
    code_system: loinc?.system || 'http://loinc.org',
    code_value: loinc?.code || '',
    code_display: loinc?.display || '',
    category_code: category?.code || undefined,
    category_display: category?.display || undefined,
    value_quantity_value: fhir.valueQuantity?.value,
    value_quantity_unit: fhir.valueQuantity?.unit,
    value_quantity_system: fhir.valueQuantity?.system,
    value_quantity_code: fhir.valueQuantity?.code,
    interpretation_code: interpretationCoding?.code || undefined,
    interpretation_display: interpretationDisplay || undefined,
    effective_datetime: fhir.effectiveDateTime || new Date().toISOString(),
    note_text: note || undefined,
  };
}

// Hilfsfunktionen
function mapGender(sqlGender: string | null): 'male' | 'female' | 'other' | 'unknown' {
  if (!sqlGender) return 'unknown';
  const map: Record<string, 'male' | 'female' | 'other' | 'unknown'> = {
    M: 'male',
    W: 'female',
    F: 'female',
    D: 'other',
  };
  return map[sqlGender.toUpperCase()] || 'unknown';
}

function mapGenderBack(fhirGender?: string): string | null {
  if (!fhirGender) return null;
  const map: Record<string, string> = {
    male: 'M',
    female: 'W',
    other: 'D',
    unknown: 'U',
  };
  return map[fhirGender] || null;
}

/**
 * FHIR MedicationStatement -> SQL MedicationStatement (partiell)
 */
export function fhirToMedicationStatement(fhir: FHIRMedicationStatement, patientId: string): Partial<MedicationStatement> {
  const medication = fhir.medicationCodeableConcept?.coding?.[0];
  const dosage = fhir.dosage?.[0];
  const note = fhir.note?.[0]?.text;
  
  // Route kann auch nur display ohne code haben
  const routeCoding = dosage?.route?.coding?.[0];
  const routeDisplay = routeCoding?.display || routeCoding?.code || undefined;

  return {
    patient_id: patientId,
    status: fhir.status || 'active',
    medication_system: medication?.system || undefined,
    medication_code: medication?.code || undefined,
    medication_display: medication?.display || undefined,
    effective_period_start: fhir.effectivePeriod?.start || undefined,
    effective_period_end: fhir.effectivePeriod?.end || undefined,
    dosage_text: dosage?.text || undefined,
    dosage_route_code: routeCoding?.code || undefined,
    dosage_route_display: routeDisplay || undefined,
    note_text: note || undefined,
    recorded_date: new Date().toISOString(),
  };
}

/**
 * SQL MedicationStatement -> FHIR MedicationStatement
 */
export function medicationStatementToFHIR(
  medicationStatement: MedicationStatement,
  patientFhirId: string
): FHIRMedicationStatement {
  return {
    resourceType: 'MedicationStatement',
    status: medicationStatement.status as any,
    medicationCodeableConcept: medicationStatement.medication_code ? {
      coding: [
        {
          system: medicationStatement.medication_system || 'http://www.whocc.no/atc',
          code: medicationStatement.medication_code,
          display: medicationStatement.medication_display,
        },
      ],
    } : undefined,
    subject: {
      reference: `Patient/${patientFhirId}`,
    },
    effectivePeriod: medicationStatement.effective_period_start || medicationStatement.effective_period_end ? {
      start: medicationStatement.effective_period_start || undefined,
      end: medicationStatement.effective_period_end || undefined,
    } : undefined,
    note: medicationStatement.note_text ? [
      {
        text: medicationStatement.note_text,
      },
    ] : undefined,
    dosage: medicationStatement.dosage_text ? [
      {
        text: medicationStatement.dosage_text,
        route: medicationStatement.dosage_route_code ? {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v3-RouteOfAdministration',
              code: medicationStatement.dosage_route_code,
              display: medicationStatement.dosage_route_display || undefined,
            },
          ],
        } : undefined,
      },
    ] : undefined,
  };
}

/**
 * FHIR Procedure -> SQL Procedure (partiell)
 */
export function fhirToProcedure(fhir: FHIRProcedure, patientId: string): Partial<Procedure> {
  const opsCode = fhir.code.coding.find(
    (c) => c.system?.includes('ops') || c.system?.includes('procedure')
  ) || fhir.code.coding[0];

  const category = fhir.category?.coding?.[0];
  const statusReason = fhir.statusReason?.coding?.[0];
  const bodySite = fhir.bodySite?.[0]?.coding?.[0];
  const outcome = fhir.outcome?.coding?.[0];
  const performer = fhir.performer?.[0];
  const performerFunction = performer?.function?.coding?.[0];

  return {
    patient_id: patientId,
    status: fhir.status || 'unknown',
    status_reason_code: statusReason?.code || null,
    status_reason_display: statusReason?.display || null,
    category_code: category?.code || null,
    category_display: category?.display || null,
    code_system: opsCode?.system || 'http://fhir.de/CodeSystem/bfarm/ops',
    code_value: opsCode?.code || '',
    code_display: opsCode?.display || '',
    body_site_code: bodySite?.code || null,
    body_site_display: bodySite?.display || null,
    performed_datetime: fhir.performedDateTime || null,
    performed_period_start: fhir.performedPeriod?.start || null,
    performed_period_end: fhir.performedPeriod?.end || null,
    outcome_code: outcome?.code || null,
    outcome_display: outcome?.display || null,
    performer_actor_reference: performer?.actor?.reference || null,
    performer_function_code: performerFunction?.code || null,
    performer_function_display: performerFunction?.display || null,
    location_reference: fhir.location?.reference || null,
    recorded_date: new Date().toISOString(),
  };
}

/**
 * SQL Procedure -> FHIR Procedure
 */
export function procedureToFHIR(
  procedure: Procedure,
  patientFhirId: string
): FHIRProcedure {
  return {
    resourceType: 'Procedure',
    status: procedure.status as any,
    category: procedure.category_code ? {
      coding: [
        {
          system: 'http://snomed.info/sct',
          code: procedure.category_code,
          display: procedure.category_display || undefined,
        },
      ],
    } : undefined,
    code: {
      coding: [
        {
          system: procedure.code_system || 'http://fhir.de/CodeSystem/bfarm/ops',
          code: procedure.code_value,
          display: procedure.code_display,
        },
      ],
    },
    subject: {
      reference: `Patient/${patientFhirId}`,
    },
    statusReason: procedure.status_reason_code ? {
      coding: [
        {
          system: 'http://snomed.info/sct',
          code: procedure.status_reason_code,
          display: procedure.status_reason_display || undefined,
        },
      ],
    } : undefined,
    bodySite: procedure.body_site_code ? [
      {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: procedure.body_site_code,
            display: procedure.body_site_display || undefined,
          },
        ],
      },
    ] : undefined,
    performedDateTime: procedure.performed_datetime || undefined,
    performedPeriod: procedure.performed_period_start || procedure.performed_period_end ? {
      start: procedure.performed_period_start || undefined,
      end: procedure.performed_period_end || undefined,
    } : undefined,
    outcome: procedure.outcome_code ? {
      coding: [
        {
          system: 'http://snomed.info/sct',
          code: procedure.outcome_code,
          display: procedure.outcome_display || undefined,
        },
      ],
    } : undefined,
    performer: procedure.performer_actor_reference ? [
      {
        actor: {
          reference: procedure.performer_actor_reference,
        },
        function: procedure.performer_function_code ? {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: procedure.performer_function_code,
              display: procedure.performer_function_display || undefined,
            },
          ],
        } : undefined,
      },
    ] : undefined,
    location: procedure.location_reference ? {
      reference: procedure.location_reference,
    } : undefined,
  };
}
