import { NextResponse } from 'next/server';
import { fhirClient } from '@/lib/fhir-client';
import { getDbConnection } from '@/lib/db';
import { patientToFHIR, conditionToFHIR, observationToFHIR, medicationStatementToFHIR, procedureToFHIR } from '@/lib/fhir-mapper';

/**
 * POST /api/fhir/send
 * Sendet Patienten und deren Behandlungsdaten an den FHIR-Server
 */
export async function POST(request: Request) {
  try {
    const { patientId } = await request.json();

    if (!patientId) {
      return NextResponse.json(
        { error: 'Patient ID is required' },
        { status: 400 }
      );
    }

    const connection = await getDbConnection();

    // Patient abrufen
    const [patientRows] = await connection.execute(
      'SELECT * FROM patients WHERE id = ?',
      [patientId]
    );
    const patient = (patientRows as any[])[0];

    if (!patient) {
      await connection.end();
      return NextResponse.json(
        { error: 'Patient not found' },
        { status: 404 }
      );
    }

    // Patient an FHIR-Server senden (PUT wenn bereits synchronisiert, sonst POST)
    const fhirPatient = patientToFHIR(patient);
    let sentPatient: any;
    
    if (patient.sync_token) {
      // Patient existiert bereits auf FHIR-Server - aktualisieren mit PUT
      fhirPatient.id = patient.sync_token;
      sentPatient = await fhirClient.updateResource(fhirPatient);
    } else {
      // Neuer Patient - erstellen mit POST
      sentPatient = await fhirClient.sendPatient(fhirPatient);
    }

    const fhirPatientId = sentPatient.id!;

    // Conditions abrufen und senden (inkl. Notizen)
    const [conditionRows] = await connection.execute(
      `SELECT c.*, 
       GROUP_CONCAT(cn.text SEPARATOR '|||') as notes
       FROM conditions c
       LEFT JOIN condition_notes cn ON c.id = cn.condition_id
       WHERE c.patient_id = ?
       GROUP BY c.id`,
      [patientId]
    );
    const conditions = conditionRows as any[];

    const sentConditions = [];
    for (const condition of conditions) {
      const fhirCondition = conditionToFHIR(condition, fhirPatientId);
      
      // Notizen hinzufügen, falls vorhanden
      if (condition.notes) {
        const notesArray = condition.notes.split('|||').filter((n: string) => n);
        if (notesArray.length > 0) {
          fhirCondition.note = notesArray.map((text: string) => ({ text }));
        }
      }
      
      // Condition senden oder aktualisieren
      let sent: any;
      if (condition.fhir_id) {
        // Condition existiert bereits - aktualisieren mit PUT
        fhirCondition.id = condition.fhir_id;
        sent = await fhirClient.updateResource(fhirCondition);
      } else {
        // Neue Condition - erstellen mit POST
        sent = await fhirClient.sendCondition(fhirCondition);
        // FHIR-ID in DB speichern (falls sync_token Spalte existiert)
        if (sent.id) {
          await connection.execute(
            'UPDATE conditions SET fhir_id = ? WHERE id = ?',
            [sent.id, condition.id]
          ).catch(() => {
            // Ignoriere Fehler falls Spalte nicht existiert
          });
        }
      }
      sentConditions.push(sent);
    }

    // Observations abrufen und senden
    const [observationRows] = await connection.execute(
      'SELECT * FROM observations WHERE patient_id = ?',
      [patientId]
    );
    const observations = observationRows as any[];

    const sentObservations = [];
    for (const observation of observations) {
      const fhirObservation = observationToFHIR(observation, fhirPatientId);
      
      // Observation senden oder aktualisieren
      let sent: any;
      if (observation.fhir_id) {
        // Observation existiert bereits - aktualisieren mit PUT
        fhirObservation.id = observation.fhir_id;
        sent = await fhirClient.updateResource(fhirObservation);
      } else {
        // Neue Observation - erstellen mit POST
        sent = await fhirClient.sendObservation(fhirObservation);
        // FHIR-ID in DB speichern (falls sync_token Spalte existiert)
        if (sent.id) {
          await connection.execute(
            'UPDATE observations SET fhir_id = ? WHERE id = ?',
            [sent.id, observation.id]
          ).catch(() => {
            // Ignoriere Fehler falls Spalte nicht existiert
          });
        }
      }
      sentObservations.push(sent);
    }

    // MedicationStatements abrufen und senden
    const [medicationRows] = await connection.execute(
      'SELECT * FROM medication_statements WHERE patient_id = ?',
      [patientId]
    );
    const medications = medicationRows as any[];

    const sentMedications = [];
    for (const medication of medications) {
      const fhirMedication = medicationStatementToFHIR(medication, fhirPatientId);
      
      // MedicationStatement senden oder aktualisieren
      let sent: any;
      if (medication.fhir_id) {
        // MedicationStatement existiert bereits - aktualisieren mit PUT
        fhirMedication.id = medication.fhir_id;
        sent = await fhirClient.updateResource(fhirMedication);
      } else {
        // Neues MedicationStatement - erstellen mit POST
        sent = await fhirClient.sendMedicationStatement(fhirMedication);
        // FHIR-ID in DB speichern (falls sync_token Spalte existiert)
        if (sent.id) {
          await connection.execute(
            'UPDATE medication_statements SET fhir_id = ? WHERE id = ?',
            [sent.id, medication.id]
          ).catch(() => {
            // Ignoriere Fehler falls Spalte nicht existiert
          });
        }
      }
      sentMedications.push(sent);
    }

    // Procedures abrufen und senden
    const [procedureRows] = await connection.execute(
      'SELECT * FROM procedures WHERE patient_id = ?',
      [patientId]
    );
    const procedures = procedureRows as any[];

    const sentProcedures = [];
    for (const procedure of procedures) {
      const fhirProcedure = procedureToFHIR(procedure, fhirPatientId);
      
      // Procedure senden oder aktualisieren
      let sent: any;
      if (procedure.fhir_id) {
        // Procedure existiert bereits - aktualisieren mit PUT
        fhirProcedure.id = procedure.fhir_id;
        sent = await fhirClient.updateResource(fhirProcedure);
      } else {
        // Neue Procedure - erstellen mit POST
        sent = await fhirClient.sendProcedure(fhirProcedure);
        // FHIR-ID in DB speichern (falls sync_token Spalte existiert)
        if (sent.id) {
          await connection.execute(
            'UPDATE procedures SET fhir_id = ? WHERE id = ?',
            [sent.id, procedure.id]
          ).catch(() => {
            // Ignoriere Fehler falls Spalte nicht existiert
          });
        }
      }
      sentProcedures.push(sent);
    }

    // Sync-Token in DB speichern
    await connection.execute(
      'UPDATE patients SET sync_token = ? WHERE id = ?',
      [fhirPatientId, patientId]
    );

    await connection.end();

    return NextResponse.json({
      success: true,
      message: 'Data sent to FHIR server successfully',
      patient: sentPatient,
      conditions: sentConditions,
      observations: sentObservations,
      medications: sentMedications,
      procedures: sentProcedures,
    });
  } catch (error: any) {
    console.error('Error sending to FHIR server:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send data to FHIR server' },
      { status: 500 }
    );
  }
}
