-- HL7 FHIR Telematik System - MySQL Initialisierung
DROP DATABASE IF EXISTS hl7_db;

CREATE DATABASE IF NOT EXISTS hl7_db;
-- Datenbank verwenden
USE hl7_db;

-- 1. Kern: Patienten-Stammdaten (eGK Fokus)
CREATE TABLE IF NOT EXISTS patients (
  id CHAR(36) PRIMARY KEY COMMENT 'UUID',
  kv_nummer VARCHAR(50) UNIQUE COMMENT 'Offizielle Versichertennummer (optional)',
  firstname VARCHAR(100) NOT NULL,
  lastname VARCHAR(100) NOT NULL,
  birthdate DATE,
  gender VARCHAR(1),
  
  -- Adressblock
  street VARCHAR(150),
  zip VARCHAR(10),
  city VARCHAR(100),
  
  -- Kontakt
  phone VARCHAR(50) COMMENT 'Telefonnummer',
  email VARCHAR(255) COMMENT 'E-Mail-Adresse',
  
  -- Versicherungsstatus
  provider_name VARCHAR(100),
  provider_id VARCHAR(20) COMMENT 'IK-Nummer der Krankenkasse',
  
  -- System-Metadaten
  is_external BOOLEAN DEFAULT FALSE,
  sync_token VARCHAR(255) COMMENT 'Für inkrementelle FHIR-Updates',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_kv_nummer (kv_nummer),
  INDEX idx_firstname (firstname),
  INDEX idx_lastname (lastname),
  INDEX idx_is_external (is_external)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Klinische Daten: Diagnosen (FHIR Condition)
CREATE TABLE IF NOT EXISTS conditions (
  id CHAR(36) PRIMARY KEY COMMENT 'UUID',
  patient_id CHAR(36) NOT NULL,
  -- Code-System (ICD-10, SNOMED, ORPHANET, etc.)
  code_system VARCHAR(100) NOT NULL COMMENT 'z.B. http://fhir.de/CodeSystem/bfarm/icd-10-gm',
  code_value VARCHAR(20) NOT NULL COMMENT 'z.B. E11.9',
  code_display VARCHAR(255) NOT NULL,
  -- Clinical Status
  clinical_status_code VARCHAR(20) NOT NULL COMMENT 'active, resolved, inactive',
  clinical_status_system VARCHAR(100),
  -- Verification Status
  verification_status_code VARCHAR(20) NOT NULL COMMENT 'confirmed, provisional',
  verification_status_system VARCHAR(100),
  -- Category
  category_code VARCHAR(50),
  category_display VARCHAR(255),
  -- Severity
  severity_code VARCHAR(50),
  severity_display VARCHAR(255),
  -- Body Site
  body_site_code VARCHAR(50),
  body_site_display VARCHAR(255),
  -- Onset/Abatement
  onset_datetime DATETIME COMMENT 'Beginn der Erkrankung',
  abatement_datetime DATETIME COMMENT 'Ende der Erkrankung',
  -- Record Date
  recorded_date DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  INDEX idx_patient_id (patient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Klinische Daten: Vitalparameter (FHIR Observation)
CREATE TABLE IF NOT EXISTS observations (
  id CHAR(36) PRIMARY KEY COMMENT 'UUID',
  patient_id CHAR(36) NOT NULL,
  -- Status
  status VARCHAR(20) NOT NULL COMMENT 'registered, preliminary, final, amended, corrected, cancelled, entered-in-error, unknown',
  -- Code (LOINC)
  code_system VARCHAR(100) NOT NULL COMMENT 'z.B. http://loinc.org',
  code_value VARCHAR(20) NOT NULL COMMENT 'z.B. 85354-9',
  code_display VARCHAR(255) NOT NULL,
  -- Category
  category_code VARCHAR(50),
  category_display VARCHAR(255),
  -- Value Types
  value_quantity_value DECIMAL(10,3),
  value_quantity_unit VARCHAR(50),
  value_quantity_system VARCHAR(100),
  value_quantity_code VARCHAR(50),
  value_string TEXT,
  value_codeable_concept_code VARCHAR(50),
  value_codeable_concept_display VARCHAR(255),
  -- Range
  value_range_low DECIMAL(10,3),
  value_range_high DECIMAL(10,3),
  -- Interpretation
  interpretation_code VARCHAR(50),
  interpretation_display VARCHAR(255),
  -- Timing
  effective_datetime DATETIME,
  effective_period_start DATETIME,
  effective_period_end DATETIME,
  issued DATETIME,
  -- Metadata
  performer_reference VARCHAR(255),
  note_text TEXT COMMENT 'Notiz zur Observation',
  recorded_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  INDEX idx_patient_id (patient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Klinische Daten: Prozeduren (FHIR Procedure)
CREATE TABLE IF NOT EXISTS procedures (
  id CHAR(36) PRIMARY KEY COMMENT 'UUID',
  patient_id CHAR(36) NOT NULL,
  -- Status
  status VARCHAR(20) NOT NULL COMMENT 'preparation, in-progress, not-done, on-hold, stopped, completed, entered-in-error, unknown',
  status_reason_code VARCHAR(50),
  status_reason_display VARCHAR(255),
  -- Category
  category_code VARCHAR(50),
  category_display VARCHAR(255),
  -- Code (OPS - Operationen und Prozeduren)
  code_system VARCHAR(100) NOT NULL COMMENT 'z.B. http://fhir.de/CodeSystem/bfarm/ops',
  code_value VARCHAR(20) NOT NULL COMMENT 'z.B. 5-83.70',
  code_display VARCHAR(255) NOT NULL,
  -- Body Site
  body_site_code VARCHAR(50),
  body_site_display VARCHAR(255),
  -- Timing
  performed_datetime DATETIME,
  performed_period_start DATETIME,
  performed_period_end DATETIME,
  -- Outcome
  outcome_code VARCHAR(50),
  outcome_display VARCHAR(255),
  -- Performer
  performer_actor_reference VARCHAR(255),
  performer_function_code VARCHAR(50),
  performer_function_display VARCHAR(255),
  -- Location
  location_reference VARCHAR(255),
  -- Metadata
  recorded_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  INDEX idx_patient_id (patient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4b. Procedure-Komplikationen
CREATE TABLE IF NOT EXISTS procedure_complications (
  id CHAR(36) PRIMARY KEY COMMENT 'UUID',
  procedure_id CHAR(36) NOT NULL,
  complication_code VARCHAR(50) NOT NULL,
  complication_display VARCHAR(255),
  created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (procedure_id) REFERENCES procedures(id) ON DELETE CASCADE,
  INDEX idx_procedure_id (procedure_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4c. Medikationen
CREATE TABLE IF NOT EXISTS medications (
  id CHAR(36) PRIMARY KEY COMMENT 'UUID',
  patient_id CHAR(36) NOT NULL,
  pzn VARCHAR(20),
  product_name VARCHAR(255),
  dosage_instruction TEXT,
  status VARCHAR(20),
  created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  INDEX idx_patient_id (patient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4d. Notizen für Diagnosen
CREATE TABLE IF NOT EXISTS condition_notes (
  id CHAR(36) PRIMARY KEY COMMENT 'UUID',
  condition_id CHAR(36) NOT NULL,
  text TEXT,
  author_id VARCHAR(100),
  created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (condition_id) REFERENCES conditions(id) ON DELETE CASCADE,
  INDEX idx_condition_id (condition_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4e. Medikationen (FHIR MedicationStatement)
CREATE TABLE IF NOT EXISTS medication_statements (
  id CHAR(36) PRIMARY KEY COMMENT 'UUID',
  patient_id CHAR(36) NOT NULL,
  -- Status
  status VARCHAR(20) NOT NULL COMMENT 'active, completed, entered-in-error, intended, stopped, on-hold, cancelled, unknown',
  -- Medication Code (ATC)
  medication_system VARCHAR(100) COMMENT 'z.B. http://www.whocc.no/atc',
  medication_code VARCHAR(50) COMMENT 'z.B. M01AE01',
  medication_display VARCHAR(255) COMMENT 'z.B. Ibuprofen',
  -- Effective Period
  effective_period_start DATETIME COMMENT 'Start der Medikation',
  effective_period_end DATETIME COMMENT 'Ende der Medikation',
  -- Dosage
  dosage_text TEXT COMMENT 'Dosierungsanweisung als Text',
  dosage_route_code VARCHAR(50) COMMENT 'Verabreichungsweg Code',
  dosage_route_display VARCHAR(255) COMMENT 'Verabreichungsweg Display',
  -- Note
  note_text TEXT COMMENT 'Notiz zur Medikation',
  -- Metadata
  recorded_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  INDEX idx_patient_id (patient_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Audit-Trail (Für den Sicherheitsbericht)
CREATE TABLE IF NOT EXISTS access_logs (
  id CHAR(36) PRIMARY KEY COMMENT 'UUID',
  patient_id CHAR(36),
  action VARCHAR(50) NOT NULL COMMENT 'READ, WRITE, FHIR_EXPORT',
  user_id VARCHAR(50),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL,
  INDEX idx_patient_id (patient_id),
  INDEX idx_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Gelöschte Sync-Tokens (verhindert automatische Wiederherstellung gelöschter Patienten)
CREATE TABLE IF NOT EXISTS deleted_sync_tokens (
  sync_token VARCHAR(255) PRIMARY KEY COMMENT 'FHIR sync_token des gelöschten Patienten',
  deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Zeitpunkt der Löschung',
  INDEX idx_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Trigger: Automatisch sync_token in deleted_sync_tokens eintragen beim Löschen eines Patienten
DROP TRIGGER IF EXISTS before_patient_delete;
DELIMITER //
CREATE TRIGGER before_patient_delete
BEFORE DELETE ON patients
FOR EACH ROW
BEGIN
  IF OLD.sync_token IS NOT NULL AND OLD.sync_token != '' THEN
    INSERT INTO deleted_sync_tokens (sync_token) 
    VALUES (OLD.sync_token)
    ON DUPLICATE KEY UPDATE sync_token = sync_token;
  END IF;
END//
DELIMITER ;

-- Seed-Daten (3 Patienten mit UUIDs)
SET @p1 = UUID();
SET @p2 = UUID();
SET @p3 = UUID();

INSERT INTO patients (id, kv_nummer, firstname, lastname, birthdate, gender, street, zip, city, phone, email, provider_name, provider_id, is_external)
VALUES
(@p1, 'A123456789', 'Anna', 'Mueller', '1985-03-15', 'W', 'Hauptstrasse 42', '10115', 'Berlin', NULL, NULL, 'AOK Berlin', 'IK123456', FALSE),
(@p2, 'B987654321', 'Thomas', 'Schmidt', '1972-07-22', 'M', 'Bergstrasse 17', '80331', 'Muenchen', NULL, NULL, 'Techniker Krankenkasse', 'IK654321', FALSE),
(@p3, 'C456789123', 'Sarah', 'Weber', '1990-11-08', 'W', 'Seestrasse 99', '20095', 'Hamburg', NULL, NULL, 'Barmer', 'IK789456', FALSE);

SET @c1 = UUID();
SET @c2 = UUID();
SET @c3 = UUID();

INSERT INTO conditions (id, patient_id, code_system, code_value, code_display, clinical_status_code, clinical_status_system, verification_status_code, verification_status_system, category_code, category_display, severity_code, severity_display, onset_datetime, abatement_datetime, recorded_date)
VALUES
(@c1, @p1, 'http://fhir.de/CodeSystem/bfarm/icd-10-gm', 'E11.9', 'Diabetes mellitus Typ 2 ohne Komplikation', 'active', 'http://terminology.hl7.org/CodeSystem/condition-clinical', 'confirmed', 'http://terminology.hl7.org/CodeSystem/condition-ver-status', 'encounter-diagnosis', 'Encounter Diagnosis', 'moderate', 'Moderate', NULL, NULL, '2025-01-10 10:30:00'),
(@c2, @p1, 'http://fhir.de/CodeSystem/bfarm/icd-10-gm', 'I10', 'Essentielle (primaere) Hypertonie', 'active', 'http://terminology.hl7.org/CodeSystem/condition-clinical', 'confirmed', 'http://terminology.hl7.org/CodeSystem/condition-ver-status', 'encounter-diagnosis', 'Encounter Diagnosis', 'moderate', 'Moderate', NULL, NULL, '2025-01-10 10:30:00'),
(@c3, @p2, 'http://fhir.de/CodeSystem/bfarm/icd-10-gm', 'J44.0', 'Chronische obstruktive Lungenkrankheit mit akuter Exazerbation', 'active', 'http://terminology.hl7.org/CodeSystem/condition-clinical', 'confirmed', 'http://terminology.hl7.org/CodeSystem/condition-ver-status', 'problem-list-item', 'Problem List Item', 'severe', 'Severe', NULL, NULL, '2024-12-15 14:20:00');

SET @o1 = UUID();
SET @o2 = UUID();

INSERT INTO observations (id, patient_id, status, code_system, code_value, code_display, category_code, category_display, value_quantity_value, value_quantity_unit, value_quantity_system, value_quantity_code, interpretation_code, interpretation_display, effective_datetime, note_text)
VALUES
(@o1, @p1, 'final', 'http://loinc.org', '8480-6', 'Systolic blood pressure', 'vital-signs', 'Vital Signs', 145, 'mmHg', 'http://unitsofmeasure.org', 'mm[Hg]', 'H', 'High', '2025-01-10 10:30:00', NULL),
(@o2, @p2, 'final', 'http://loinc.org', '8462-4', 'Diastolic blood pressure', 'vital-signs', 'Vital Signs', 85, 'mmHg', 'http://unitsofmeasure.org', 'mm[Hg]', 'N', 'Normal', '2024-12-15 14:20:00', NULL);

-- Views für SQL-Abnahme
CREATE OR REPLACE VIEW patient_overview AS
SELECT 
  p.id,
  p.kv_nummer AS 'KV-Nummer',
  CONCAT(p.firstname, ' ', p.lastname) AS 'Name',
  DATE_FORMAT(p.birthdate, '%d.%m.%Y') AS 'Geburtsdatum',
  CASE 
    WHEN p.gender = 'M' THEN 'Männlich'
    WHEN p.gender = 'W' THEN 'Weiblich'
    ELSE 'Unbekannt'
  END AS 'Geschlecht',
  CONCAT(COALESCE(p.street, ''), 
         CASE WHEN p.street IS NOT NULL AND p.zip IS NOT NULL THEN ', ' ELSE '' END,
         COALESCE(p.zip, ''),
         CASE WHEN p.zip IS NOT NULL AND p.city IS NOT NULL THEN ' ' ELSE '' END,
         COALESCE(p.city, '')) AS 'Adresse',
  p.phone,
  p.email,
  p.provider_name AS 'Krankenkasse',
  p.sync_token,
  p.is_external,
  COUNT(DISTINCT c.id) AS 'Anzahl Diagnosen',
  COUNT(DISTINCT o.id) AS 'Anzahl Vitalparameter'
FROM patients p
LEFT JOIN conditions c ON p.id = c.patient_id
LEFT JOIN observations o ON p.id = o.patient_id
GROUP BY p.id, p.kv_nummer, p.firstname, p.lastname, p.birthdate, p.gender, p.street, p.zip, p.city, p.phone, p.email, p.provider_name, p.sync_token, p.is_external;

CREATE OR REPLACE VIEW treatment_overview AS
SELECT 
  p.id AS patient_id,
  CONCAT(p.firstname, ' ', p.lastname) AS patient_name,
  c.code_value AS icd_code,
  c.code_display AS diagnose,
  c.clinical_status_code AS status,
  DATE_FORMAT(c.recorded_date, '%d.%m.%Y %H:%i') AS aufgezeichnet_am
FROM patients p
INNER JOIN conditions c ON p.id = c.patient_id;

-- Authentifizierungsprotokolle für node.js mysql2 Kompatibilität
CREATE USER IF NOT EXISTS 'hl7_user'@'%' IDENTIFIED BY 'hl7_password';
CREATE USER IF NOT EXISTS 'hl7_user'@'localhost' IDENTIFIED BY 'hl7_password';
CREATE USER IF NOT EXISTS 'hl7_user'@'127.0.0.1' IDENTIFIED BY 'hl7_password';

-- Gewähre Berechtigungen
GRANT ALL PRIVILEGES ON hl7_db.* TO 'hl7_user'@'%';
GRANT ALL PRIVILEGES ON hl7_db.* TO 'hl7_user'@'localhost';
GRANT ALL PRIVILEGES ON hl7_db.* TO 'hl7_user'@'127.0.0.1';

FLUSH PRIVILEGES;