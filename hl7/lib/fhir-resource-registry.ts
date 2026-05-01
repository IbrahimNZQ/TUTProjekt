/**
 * Resource Registry System für flexiblen FHIR Import
 * Erlaubt dynamische Verarbeitung beliebiger FHIR-Ressourcen
 */

import type { MySQLConnection } from './db';
import { generateUUID } from './db';

export interface ResourceHandlerResult {
  id: string;
  patientId?: string;
  resourceType: string;
  success: boolean;
  error?: string;
}

export interface ResourceHandler {
  /**
   * Verarbeitet eine FHIR-Ressource und speichert sie in der Datenbank
   * @param resource Die FHIR-Ressource
   * @param patientId Die lokale Patient-ID (kann null sein wenn nicht gefunden)
   * @param connection Datenbankverbindung
   * @param patientMap Map von FHIR Patient IDs zu lokalen DB IDs
   * @returns Ergebnis der Verarbeitung
   */
  process(
    resource: any,
    patientId: string | null,
    connection: MySQLConnection,
    patientMap: Map<string, { fhirId: string; dbId: string }>
  ): Promise<ResourceHandlerResult>;
}

/**
 * Hilfsfunktion zum Extrahieren der Patient-ID aus einer Referenz
 */
export function extractPatientId(
  reference: string | undefined,
  patientMap: Map<string, { fhirId: string; dbId: string }>
): string | null {
  if (!reference) return null;
  const refParts = reference.split('/');
  const refId = refParts[refParts.length - 1];
  return patientMap.get(refId)?.dbId || null;
}

/**
 * Resource Registry - Zentrale Registrierung für alle FHIR-Ressourcen-Handler
 */
export class ResourceRegistry {
  private handlers = new Map<string, ResourceHandler>();
  private unknownResources: Array<{ resourceType: string; id?: string }> = [];

  /**
   * Registriert einen Handler für einen Ressourcentyp
   */
  register(resourceType: string, handler: ResourceHandler): void {
    this.handlers.set(resourceType, handler);
  }

  /**
   * Verarbeitet eine FHIR-Ressource mit dem entsprechenden Handler
   */
  async process(
    resource: any,
    connection: MySQLConnection,
    patientMap: Map<string, { fhirId: string; dbId: string }>
  ): Promise<ResourceHandlerResult> {
    const resourceType = resource.resourceType;

    if (!resourceType) {
      return {
        id: generateUUID(),
        resourceType: 'Unknown',
        success: false,
        error: 'Resource has no resourceType',
      };
    }

    const handler = this.handlers.get(resourceType);

    if (!handler) {
      // Unbekannte Ressource - loggen aber nicht abbrechen
      this.unknownResources.push({
        resourceType,
        id: resource.id,
      });
      console.warn(`Unknown resource type: ${resourceType} (ID: ${resource.id})`);
      return {
        id: resource.id || generateUUID(),
        resourceType,
        success: false,
        error: `No handler registered for resource type: ${resourceType}`,
      };
    }

    // Patient-ID extrahieren falls vorhanden
    let patientId: string | null = null;
    if (resource.subject?.reference) {
      patientId = extractPatientId(resource.subject.reference, patientMap);
    }

    try {
      return await handler.process(resource, patientId, connection, patientMap);
    } catch (error: any) {
      return {
        id: resource.id || generateUUID(),
        resourceType,
        success: false,
        error: error.message || 'Unknown error processing resource',
      };
    }
  }

  /**
   * Gibt alle unbekannten Ressourcen zurück
   */
  getUnknownResources(): Array<{ resourceType: string; id?: string }> {
    return [...this.unknownResources];
  }

  /**
   * Löscht die Liste der unbekannten Ressourcen
   */
  clearUnknownResources(): void {
    this.unknownResources = [];
  }

  /**
   * Prüft ob ein Handler für einen Ressourcentyp registriert ist
   */
  hasHandler(resourceType: string): boolean {
    return this.handlers.has(resourceType);
  }

  /**
   * Gibt alle registrierten Ressourcentypen zurück
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
}

// Singleton-Instanz
export const resourceRegistry = new ResourceRegistry();
