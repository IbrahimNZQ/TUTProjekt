import { NextResponse } from 'next/server';
import { getDbConnection } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/views/treatments
 * Nutzt die optimierte treatment_overview View
 */
export async function GET() {
  try {
    const connection = await getDbConnection();

    const [rows] = await connection.execute(`
      SELECT 
        patient_id,
        patient_name,
        icd_code,
        diagnose,
        status,
        aufgezeichnet_am as recorded_at
      FROM treatment_overview
      ORDER BY patient_id, aufgezeichnet_am DESC
    `);

    await connection.end();

    return NextResponse.json({ treatments: rows });
  } catch (error: any) {
    console.error('Error fetching treatment overview:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch treatment overview' },
      { status: 500 }
    );
  }
}
