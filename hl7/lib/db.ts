import mysql from 'mysql';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';


const pool = mysql.createPool({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'Alsakab.1999',
  database: 'hl7_db',
  connectionLimit: 10,
  connectTimeout: 10000,
  charset: 'utf8mb4',
  // mysql_native_password Kompatibilität
  insecureAuth: true,
  // Explizit TCP-Verbindung erzwingen (kein Unix Socket)
  // socketPath muss explizit auf undefined gesetzt werden, um TCP zu erzwingen
  socketPath: undefined,
  // UTF-8 Encoding sicherstellen
  flags: ['-FOUND_ROWS'],
  typeCast: function (field: any, next: any) {
    if (field.type === 'BIT' && field.length === 1) {
      const bytes = field.buffer();
      return bytes ? bytes[0] === 1 : null;
    }
    return next();
  },
});

// Wrapper für mysqljs um mysql2-kompatible API zu bieten
export class MySQLConnection {
  private connection: mysql.PoolConnection | null = null;

  async execute(sql: string, params?: any[]): Promise<[any[], any]> {
    if (!this.connection) {
      const getConnection = promisify(pool.getConnection).bind(pool);
      this.connection = await getConnection();
      
      // Setze UTF-8 für diese Verbindung SOFORT
      await new Promise<void>((resolve, reject) => {
        this.connection!.query('SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      await new Promise<void>((resolve, reject) => {
        this.connection!.query('SET CHARACTER SET utf8mb4', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      // Stelle sicher, dass Autocommit aktiviert ist (Standard, aber explizit setzen für Sicherheit)
      await new Promise<void>((resolve, reject) => {
        this.connection!.query('SET autocommit = 1', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    // mysqljs query unterstützt SQL und params
    return new Promise((resolve, reject) => {
      this.connection!.query(sql, params || [], (error, results: any, fields) => {
        if (error) {
          reject(error);
          return;
        }
        // mysqljs gibt [rows, fields] zurück, wir brauchen nur rows
        const rows = Array.isArray(results) ? results : [results];
        resolve([rows, { affectedRows: results.affectedRows || 0 }]);
      });
    });
  }

  async end(): Promise<void> {
    if (this.connection) {
      this.connection.release();
      this.connection = null;
    }
  }
}

export async function getDbConnection(): Promise<MySQLConnection> {
  return new MySQLConnection();
}

export function generateUUID(): string {
  return uuidv4();
}

export interface Patient {
  id: string;
  kv_nummer: string;
  firstname: string;
  lastname: string;
  birthdate: string | null;
  gender: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  provider_name?: string | null;
  provider_id?: string | null;
  is_external: boolean;
  sync_token?: string;
}

export interface Condition {
  id: string;
  patient_id: string;
  code_system: string;
  code_value: string;
  code_display: string;
  clinical_status_code: string;
  clinical_status_system?: string;
  verification_status_code: string;
  verification_status_system?: string;
  category_code?: string;
  category_display?: string;
  severity_code?: string;
  severity_display?: string;
  body_site_code?: string;
  body_site_display?: string;
  onset_datetime?: string | null;
  abatement_datetime?: string | null;
  recorded_date: string;
}

export interface Observation {
  id: string;
  patient_id: string;
  status: string;
  code_system: string;
  code_value: string;
  code_display: string;
  category_code?: string;
  category_display?: string;
  value_quantity_value?: number;
  value_quantity_unit?: string;
  value_quantity_system?: string;
  value_quantity_code?: string;
  value_string?: string;
  value_codeable_concept_code?: string;
  value_codeable_concept_display?: string;
  value_range_low?: number;
  value_range_high?: number;
  interpretation_code?: string;
  interpretation_display?: string;
  effective_datetime?: string;
  effective_period_start?: string;
  effective_period_end?: string;
  issued?: string;
  performer_reference?: string;
  note_text?: string | null;
  recorded_date?: string;
}

export interface MedicationStatement {
  id: string;
  patient_id: string;
  status: string;
  medication_system?: string;
  medication_code?: string;
  medication_display?: string;
  effective_period_start?: string | null;
  effective_period_end?: string | null;
  dosage_text?: string | null;
  dosage_route_code?: string | null;
  dosage_route_display?: string | null;
  note_text?: string | null;
  recorded_date?: string;
}

export interface Procedure {
  id: string;
  patient_id: string;
  status: string;
  status_reason_code?: string | null;
  status_reason_display?: string | null;
  category_code?: string | null;
  category_display?: string | null;
  code_system: string;
  code_value: string;
  code_display: string;
  body_site_code?: string | null;
  body_site_display?: string | null;
  performed_datetime?: string | null;
  performed_period_start?: string | null;
  performed_period_end?: string | null;
  outcome_code?: string | null;
  outcome_display?: string | null;
  performer_actor_reference?: string | null;
  performer_function_code?: string | null;
  performer_function_display?: string | null;
  location_reference?: string | null;
  recorded_date?: string;
}

export interface ProcedureComplication {
  id: string;
  procedure_id: string;
  complication_code: string;
  complication_display?: string | null;
  created_date?: string;
}

export interface Medication {
  id: string;
  patient_id: string;
  pzn?: string | null;
  product_name?: string | null;
  dosage_instruction?: string | null;
  status?: string | null;
  created_date?: string;
}
