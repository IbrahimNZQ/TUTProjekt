# HL7 FHIR Telematik System

## 📋 Projekt-Todo-Liste (Realisierungsumfang)

### Komponenten
- [x] **Datenbank** (Realisierung einer institutionellen Patientenakte als Baumstruktur oder Akte)
- [x] **Interoperabilitätsmodul** (Senden und Empfangen von FHIR-Nachrichten)
- [x] **Kontroll-Modul** (z.B. CLI zur Steuerung des Interoperabilitätsmoduls)
- [x] **FHIR-Server** (es kann ein externer verwendet werden)

### Abnahmeszenarien

#### 1. Anzeige der Datenbank (SQL-Views)
- [x] a. Patientenliste (min. 3 Patienten) - Stammdaten des Patienten (z.B. Inhalt der eGK)
- [x] b. Behandlungsdaten (nach Szenario)

#### 2. Synchronisation mit einem FHIR-Server (FHIR-Client)
- [x] a. Nachweis, dass die Patienten und Behandlungsdaten über das Interoperabilitätsmodul auf einen FHIR-Server übertragen werden
- [x] b. Löschen der Datenbankinhalte und Wiederherstellen der Daten vom FHIR-Server
- [x] c. Anlage eines neuen Patienten mit Behandlungsdaten über eine SQL-Transaktion (bitte vorbereiten)
- [x] d. Senden der neu angelegten Daten über das Interoperabilitätsmodul an den FHIR-Server (Befehl über eine CLI des Interoperabilitätsmoduls)

#### 3. FHIR-Export/Import (CLI des Interoperabilitätsmoduls)
- [x] a. File Export: -> Export eines Patienten in ein File-System (Dokument mit FHIR Inhalt)
- [ ] b. File Export: -> Export von Behandlungsdaten in ein File-System (Dokument mit FHIR Inhalt)
- [x] c. File Import: -> Import eines Patienten aus dem File-System (Dokument mit FHIR Inhalt)
- [x] d. File Import: -> Import von Behandlungsdaten aus dem File-System (Dokument mit FHIR Inhalt) - **via Bundle-Import**

#### 4. Planung fremder Sender
- [x] Planen Sie, wie Sie Daten von "fremden Sendern" in Ihr System aufnehmen und kennzeichnen
  - **Implementiert:** 
    - Patienten aus Bundle-Import (manuell oder von HAPI) werden mit `is_external = true` markiert
    - Patienten vom FHIR-Server empfangen werden mit `is_external = true` markiert
    - Visuelle Kennzeichnung in der UI: Orange Hintergrundfarbe und "Fremd"-Badge
    - Eigene Patienten (lokal angelegt) haben `is_external = false`

## FHIR Server

**Endpoint:** `https://hapi.fhir.org/baseR4`

Test-Patient abrufen:
```bash
curl https://hapi.fhir.org/baseR4/Patient/example
```

## Datenbank Setup

### Docker Container starten
```bash
docker-compose up -d
```

### Docker Container stoppen
```bash
docker-compose down
```

### Datenbank-Zugangsdaten
- **Host:** localhost
- **Port:** 3306
- **Datenbank:** hl7_db
- **User:** hl7_user
- **Password:** hl7_password

### Datenbank neu initialisieren
```bash
# Container stoppen und Volume löschen
docker-compose down -v

# Container neu starten (Main.sql wird automatisch geladen)
docker-compose up -d
```

### Logs anzeigen
```bash
docker-compose logs -f db
```

## Entwicklung

### Dependencies installieren
```bash
npm install
```

### Development Server starten
```bash
npm run dev
```

Öffne [http://localhost:3000](http://localhost:3000) im Browser.

## Interoperabilitätsmodul (FHIR Senden & Empfangen)

### Setup
1. `.env` Datei erstellen:
```bash
cp .env.example .env
```

2. Dependencies installieren:
```bash
npm install
```

### API Endpoints

#### Daten an FHIR-Server senden
```bash
# API Endpoint
POST /api/fhir/send
Body: { "patientId": 1 }

# Oder über CLI
npm run fhir:send 1
```

#### Daten vom FHIR-Server empfangen
```bash
# API Endpoint
POST /api/fhir/receive
Body: { "fhirPatientId": "12345" }

# Oder über CLI
npm run fhir:receive 12345
```

### CLI Kommandos (Kontroll-Modul)

```bash
# Hilfe anzeigen
npm run fhir:help

# Patient an FHIR-Server senden
npm run fhir:send 1

# Patient vom FHIR-Server empfangen
npm run fhir:receive 12345

# Direkt mit Node.js
node scripts/fhir-cli.js send 1
node scripts/fhir-cli.js receive 12345
```

## Synchronisation mit einem FHIR-Server (FHIR-Client)

### a. Nachweis der Datenübertragung
Nachweis, dass die Patienten und Behandlungsdaten über das Interoperabilitätsmodul auf einen FHIR-Server übertragen werden:

```bash
# Patient ID 1 an FHIR-Server senden
npm run fhir:send 1

# Ausgabe zeigt erfolgreiche Übertragung:
# ✅ Erfolgreich gesendet!
#    Patient: <fhir-id>
#    Conditions: 2
#    Observations: 3
```

### b. Daten löschen und wiederherstellen
Löschen der Datenbankinhalte und Wiederherstellen der Daten vom FHIR-Server:

```bash
# 1. Datenbank leeren
docker-compose exec db mysql -u hl7_user -phl7_password hl7_db -e "DELETE FROM observations; DELETE FROM conditions; DELETE FROM patients;"

# 2. Daten vom FHIR-Server wiederherstellen
npm run fhir:receive <fhir-patient-id>
```

### c. Neuen Patienten über SQL-Transaktion anlegen
SQL-Transaktion zum Anlegen eines neuen Patienten mit Behandlungsdaten:

```sql
START TRANSACTION;

-- Neuen Patienten anlegen
INSERT INTO patients (kv_nummer, firstname, lastname, birthdate, gender, street, zip, city, provider_name, is_external) 
VALUES ('X123456789', 'Max', 'Mustermann', '1990-01-15', 'M', 'Musterstraße 123', '12345', 'Musterstadt', 'AOK', false);

-- ID des neu angelegten Patienten abrufen
SET @patient_id = LAST_INSERT_ID();

-- Diagnose anlegen
INSERT INTO conditions (patient_id, icd_10_code, display_name, clinical_status, verification_status, recorded_date)
VALUES (@patient_id, 'E11.9', 'Diabetes mellitus Typ 2', 'active', 'confirmed', NOW());

-- Vitalparameter anlegen
INSERT INTO observations (patient_id, loinc_code, display_name, value_number, unit, interpretation, effective_datetime)
VALUES (@patient_id, '85354-9', 'Blutdruck systolisch', 120, 'mmHg', 'Normal', NOW());

COMMIT;
```

Ausführen über Docker:
```bash
docker-compose exec db mysql -u hl7_user -phl7_password hl7_db < neue_patient.sql
```

### d. Daten an FHIR-Server senden
Senden der neu angelegten Daten über das Interoperabilitätsmodul an den FHIR-Server (CLI-Befehl):

```bash
# Patient-ID aus der Datenbank verwenden (z.B. 4)
npm run fhir:send 4

# Oder mit direktem Node.js Aufruf
node scripts/fhir-cli.js send 4
```
