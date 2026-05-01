#!/usr/bin/env node

/**
 * CLI - Kontroll-Modul für das Interoperabilitätsmodul
 * Steuerung der FHIR-Synchronisation über Kommandozeile
 */

const API_BASE = process.env.API_BASE || 'http://localhost:3000';

async function sendToFHIR(patientId) {
  console.log(`📤 Sende Patient ${patientId} an FHIR-Server...`);

  try {
    const response = await fetch(`${API_BASE}/api/fhir/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ patientId: parseInt(patientId) }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Fehler:', data.error);
      process.exit(1);
    }

    console.log('✅ Erfolgreich gesendet!');
    console.log(`   Patient: ${data.patient.id}`);
    console.log(`   Conditions: ${data.conditions.length}`);
    console.log(`   Observations: ${data.observations.length}`);
  } catch (error) {
    console.error('❌ Verbindungsfehler:', error.message);
    process.exit(1);
  }
}

async function receiveFromFHIR(fhirPatientId) {
  console.log(`📥 Empfange Patient ${fhirPatientId} vom FHIR-Server...`);

  try {
    const response = await fetch(`${API_BASE}/api/fhir/receive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fhirPatientId }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Fehler:', data.error);
      process.exit(1);
    }

    console.log('✅ Erfolgreich empfangen!');
    console.log(`   Patient ID (DB): ${data.patientId}`);
    console.log(`   Conditions: ${data.conditionsCount}`);
    console.log(`   Observations: ${data.observationsCount}`);
  } catch (error) {
    console.error('❌ Verbindungsfehler:', error.message);
    process.exit(1);
  }
}

function showHelp() {
  console.log(`
🏥 FHIR CLI - Interoperabilitätsmodul Kontroll-Tool

Verwendung:
  node scripts/fhir-cli.js send <patient-id>         Sendet Patient an FHIR-Server
  node scripts/fhir-cli.js receive <fhir-patient-id> Empfängt Patient vom FHIR-Server
  node scripts/fhir-cli.js help                      Zeigt diese Hilfe

Beispiele:
  node scripts/fhir-cli.js send 1
  node scripts/fhir-cli.js receive 12345
  
Umgebungsvariablen:
  API_BASE    Basis-URL der API (Standard: http://localhost:3000)
`);
}

// Hauptlogik
const [, , command, ...args] = process.argv;

switch (command) {
  case 'send':
    if (!args[0]) {
      console.error('❌ Fehler: Patient ID erforderlich');
      showHelp();
      process.exit(1);
    }
    sendToFHIR(args[0]);
    break;

  case 'receive':
    if (!args[0]) {
      console.error('❌ Fehler: FHIR Patient ID erforderlich');
      showHelp();
      process.exit(1);
    }
    receiveFromFHIR(args[0]);
    break;

  case 'help':
  default:
    showHelp();
    break;
}
