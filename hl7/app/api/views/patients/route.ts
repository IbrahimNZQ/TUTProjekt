import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/views/patients
 * Nutzt die optimierte patient_overview View
 */
export async function GET() {
  try {
    const connection = await getDbConnection();

    const [rows] = await connection.execute(`
      SELECT 
        id,
        \`KV-Nummer\` as kv_nummer,
        Name as name,
        Geburtsdatum as birthdate,
        Geschlecht as gender,
        Adresse as address,
        Krankenkasse as provider,
        \`Anzahl Diagnosen\` as condition_count,
        \`Anzahl Vitalparameter\` as observation_count,
        sync_token,
        is_external
      FROM patient_overview
      ORDER BY id DESC
    `);

    await connection.end();

    // Konvertiere Encoding-Probleme (falls vorhanden)
    const patients = (rows as any[]).map((patient: any) => ({
      ...patient,
      gender: patient.gender
        ?.replace(/MÃ¤nnlich/g, 'Männlich')
        ?.replace(/M\?\?nnlich/g, 'Männlich')
        || patient.gender,
    }));

    return NextResponse.json({ patients });
  } catch (error: any) {
    console.error('Error fetching patient overview:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch patient overview' },
      { status: 500 }
    );
  }
}
