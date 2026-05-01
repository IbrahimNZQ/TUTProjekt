import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';

export async function GET() {
  try {
    const connection = await getDbConnection();

    const [patients] = await connection.execute(
      `SELECT 
        id, kv_nummer, firstname, lastname, birthdate, gender,
        street, zip, city, provider_name, is_external, sync_token
       FROM patients
       ORDER BY id DESC`
    );

    await connection.end();

    return NextResponse.json({ patients });
  } catch (error: any) {
    console.error('Error fetching patients:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch patients' },
      { status: 500 }
    );
  }
}
