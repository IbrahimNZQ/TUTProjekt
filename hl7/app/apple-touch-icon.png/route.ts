import { NextResponse } from 'next/server';

/**
 * Route Handler für automatische Browser-Icon-Anfragen
 * Verhindert 404-Fehler für fehlende Icon-Dateien
 */
export async function GET() {
  return new NextResponse(null, { status: 204 });
}
