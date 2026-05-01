import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';
import { fhirClient } from '@/lib/fhir-client';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const connection = await getDbConnection();
    const { id: patientId } = await params;

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

    // Conditions abrufen (inkl. Notizen)
    const [conditions] = await connection.execute(
      `SELECT c.*, 
       GROUP_CONCAT(cn.text SEPARATOR '|||') as notes
       FROM conditions c
       LEFT JOIN condition_notes cn ON c.id = cn.condition_id
       WHERE c.patient_id = ?
       GROUP BY c.id
       ORDER BY c.recorded_date DESC`,
      [patientId]
    );

    // Clean up notes field - convert string to array if present
    const conditionsWithNotes = (conditions as any[]).map(condition => {
      if (condition.notes) {
        // Split notes by separator and filter empty strings
        const notesArray = condition.notes.split('|||').filter((n: string) => n);
        return { ...condition, notes: notesArray };
      }
      return condition;
    });

    // Observations abrufen
    const [observations] = await connection.execute(
      'SELECT * FROM observations WHERE patient_id = ? ORDER BY effective_datetime DESC',
      [patientId]
    );

    // MedicationStatements abrufen
    const [medications] = await connection.execute(
      'SELECT * FROM medication_statements WHERE patient_id = ? ORDER BY recorded_date DESC',
      [patientId]
    );

    // Wenn Patient synchronisiert ist, hole FHIR-Metadaten vom Server
    let fhirBundle = null;
    let fhirPatient = null;
    if (patient.sync_token) {
      try {
        fhirBundle = await fhirClient.receivePatient(patient.sync_token, true);
        // Finde Patient im Bundle
        fhirPatient = fhirBundle?.entry?.find((e: any) => e.resource?.resourceType === 'Patient')?.resource;
      } catch (error: any) {
        console.warn('Could not fetch FHIR metadata:', error.message);
        // Ignoriere Fehler - Patientendaten werden trotzdem angezeigt
      }
    }

    await connection.end();

    return NextResponse.json({
      patient,
      conditions: conditionsWithNotes,
      observations,
      medications,
      fhirBundle,
      fhirPatient,
    });
  } catch (error: any) {
    console.error('Error fetching patient details:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch patient details' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const connection = await getDbConnection();
    const { id: patientId } = await params;

    // Patient abrufen um sync_token zu erhalten
    const [patientRows] = await connection.execute(
      'SELECT sync_token FROM patients WHERE id = ?',
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

    // WICHTIG: Wir löschen NUR in der lokalen Datenbank, NICHT auf dem HAPI FHIR Server!
    // Der Patient bleibt auf dem FHIR Server bestehen.

    // Wenn Patient einen sync_token hat, markiere ihn als gelöscht
    // Dies verhindert, dass der Patient automatisch wiederhergestellt wird
    if (patient.sync_token) {
      try {
        await connection.execute(
          'INSERT INTO deleted_sync_tokens (sync_token) VALUES (?) ON DUPLICATE KEY UPDATE sync_token = sync_token',
          [patient.sync_token]
        );
      } catch (error: any) {
        // Ignoriere Fehler wenn sync_token bereits existiert oder Tabelle nicht existiert
        console.warn('Could not mark sync_token as deleted:', error.message);
      }
    }

    // Patient löschen (CASCADE löscht automatisch alle verwandten Daten)
    // Nur in der lokalen Datenbank, nicht auf dem FHIR Server!
    await connection.execute(
      'DELETE FROM patients WHERE id = ?',
      [patientId]
    );

    await connection.end();

    return NextResponse.json({
      success: true,
      message: 'Patient erfolgreich aus der lokalen Datenbank gelöscht',
    });
  } catch (error: any) {
    console.error('Error deleting patient:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete patient' },
      { status: 500 }
    );
  }
}
