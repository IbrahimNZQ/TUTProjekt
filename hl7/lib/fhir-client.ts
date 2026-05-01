/**
 * FHIR Client - Interoperabilitätsmodul
 * Senden und Empfangen von FHIR-Ressourcen
 * KBV NFD Patient: https://simplifier.net/PKA/KBV_PR_MIO_NFD_Patient_NFD/~json
 */

const FHIR_BASE_URL = 'https://hapi.fhir.org/baseR4';

// Core types for KBV NFD Patient
export interface Identifier {
  system: string;
  value: string;
}

export interface HumanName {
  family: string;
  given?: string[];
  prefix?: string[];
}

export interface ContactPoint {
  system: 'phone' | 'fax' | 'email' | 'pager' | 'url' | 'sms' | 'other';
  value: string;
  use?: 'home' | 'work' | 'temp' | 'old' | 'mobile';
}

export interface Address {
  line?: string[];
  city?: string;
  postalCode?: string;
  country?: string;
  state?: string;
  use?: 'home' | 'work' | 'temp' | 'old' | 'billing';
}

export interface ContactPerson {
  name?: HumanName;
  telecom?: ContactPoint[];
  address?: Address;
  gender?: 'male' | 'female' | 'other' | 'unknown';
  relationship?: Array<{
    coding?: Array<{
      system: string;
      code: string;
      display?: string;
    }>;
  }>;
}

export interface FHIRPatient {
  resourceType: 'Patient';
  id?: string;
  identifier?: Identifier[];
  name?: HumanName[];
  gender?: 'male' | 'female' | 'other' | 'unknown';
  birthDate?: string;
  address?: Address[];
  telecom?: ContactPoint[];
  contact?: ContactPerson[];
}

export interface Coding {
  system: string;
  code: string;
  display?: string;
  userSelected?: boolean;
}

export interface CodeableConcept {
  coding: Coding[];
  text?: string;
}

export interface FHIRCondition {
  resourceType: 'Condition';
  id?: string;
  clinicalStatus?: CodeableConcept;
  verificationStatus?: CodeableConcept;
  category?: CodeableConcept[];
  severity?: CodeableConcept;
  code: CodeableConcept;
  bodySite?: CodeableConcept[];
  subject: {
    reference: string;
  };
  onsetDateTime?: string;
  abatementDateTime?: string;
  recordedDate?: string;
  note?: Array<{
    text: string;
  }>;
}

export interface Quantity {
  value: number;
  unit: string;
  system?: string;
  code?: string;
}

export interface FHIRObservation {
  resourceType: 'Observation';
  id?: string;
  status: 'registered' | 'preliminary' | 'final' | 'amended' | 'corrected' | 'cancelled' | 'entered-in-error' | 'unknown';
  category?: CodeableConcept[];
  code: CodeableConcept;
  subject: {
    reference: string;
  };
  valueQuantity?: Quantity;
  valueString?: string;
  valueCodeableConcept?: CodeableConcept;
  valueRange?: {
    low?: Quantity;
    high?: Quantity;
  };
  interpretation?: CodeableConcept[];
  note?: Array<{
    text: string;
  }>;
  effectiveDateTime?: string;
  effectivePeriod?: {
    start?: string;
    end?: string;
  };
  issued?: string;
  performer?: Array<{
    reference: string;
  }>;
}

export interface FHIRProcedure {
  resourceType: 'Procedure';
  id?: string;
  status: 'preparation' | 'in-progress' | 'not-done' | 'on-hold' | 'stopped' | 'completed' | 'entered-in-error' | 'unknown';
  statusReason?: CodeableConcept;
  category?: CodeableConcept;
  code: CodeableConcept;
  subject: {
    reference: string;
  };
  encounter?: {
    reference: string;
  };
  performedDateTime?: string;
  performedPeriod?: {
    start?: string;
    end?: string;
  };
  performer?: Array<{
    function?: CodeableConcept;
    actor: {
      reference: string;
    };
  }>;
  reasonCode?: CodeableConcept[];
  reasonReference?: Array<{
    reference: string;
  }>;
  bodySite?: CodeableConcept[];
  outcome?: CodeableConcept;
  complication?: CodeableConcept[];
  note?: Array<{
    text: string;
  }>;
  usedCode?: CodeableConcept[];
  location?: {
    reference: string;
  };
}

export interface FHIRMedicationStatement {
  resourceType: 'MedicationStatement';
  id?: string;
  status: 'active' | 'completed' | 'entered-in-error' | 'intended' | 'stopped' | 'on-hold' | 'cancelled' | 'unknown';
  medicationCodeableConcept?: CodeableConcept;
  medicationReference?: {
    reference: string;
  };
  subject: {
    reference: string;
  };
  effectivePeriod?: {
    start?: string;
    end?: string;
  };
  note?: Array<{
    text: string;
  }>;
  dosage?: Array<{
    text?: string;
    route?: CodeableConcept;
    timing?: {
      code?: CodeableConcept;
    };
    doseQuantity?: Quantity;
  }>;
}

export interface FHIRBundle {
  resourceType: 'Bundle';
  type: 'transaction' | 'batch' | 'history' | 'searchset' | 'collection' | 'document' | 'message';
  entry?: Array<{
    resource?: any;
    request?: {
      method: 'GET' | 'POST' | 'PUT' | 'DELETE';
      url: string;
    };
    response?: {
      status: string;
      location?: string;
    };
  }>;
}

export class FHIRClient {
  private baseUrl: string;

  constructor(baseUrl: string = FHIR_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Senden: Patient an FHIR-Server übertragen
   * Verwendet POST gemäß HAPI FHIR API
   */
  async sendPatient(patient: FHIRPatient): Promise<FHIRPatient> {
    const response = await fetch(`${this.baseUrl}/Patient`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/fhir+json',
        'Accept': 'application/fhir+json',
      },
      body: JSON.stringify(patient),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `FHIR Server Error: ${response.status} ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.issue && errorJson.issue.length > 0) {
          errorMessage += ` - ${errorJson.issue.map((i: any) => i.diagnostics || i.details?.text).join(', ')}`;
        }
      } catch {
        errorMessage += ` - ${errorText}`;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  /**
   * Empfangen: Patient vom FHIR-Server abrufen
   * Gibt immer ein Bundle zurück mit Patient und allen verwandten Ressourcen
   * Verwendet eine einzige Search-Operation mit _revinclude für optimale Performance
   * @param patientId - Die FHIR Patient ID
   * @param includeRelated - Wenn true (Standard), werden verwandte Ressourcen mit _revinclude abgerufen
   * @returns Bundle mit Patient und verwandten Ressourcen
   */
  async receivePatient(patientId: string, includeRelated: boolean = true): Promise<FHIRBundle> {
    let url: string;
    
    if (includeRelated) {
      // Verwende Search-Operation mit _id und _revinclude für eine einzige Anfrage
      // Das gibt direkt ein Bundle zurück mit Patient + verwandten Ressourcen
      const revIncludes = [
        'Condition:subject',
        'MedicationStatement:subject',
        'Observation:subject',
        'Procedure:subject'
      ];
      url = `${this.baseUrl}/Patient?_id=${encodeURIComponent(patientId)}&${revIncludes.map(inc => `_revinclude=${encodeURIComponent(inc)}`).join('&')}`;
    } else {
      // Nur Patient ohne verwandte Ressourcen - verwende Read-Operation
      url = `${this.baseUrl}/Patient/${patientId}`;
    }

    try {
      const response = await fetch(url);

      if (!response.ok) {
        // Wenn Search fehlschlägt und includeRelated=true, versuche Fallback
        if (includeRelated && response.status === 404) {
          console.warn('Search with _revinclude returned 404, falling back to Read operation');
          try {
            const fallbackResponse = await fetch(`${this.baseUrl}/Patient/${patientId}`);
            if (fallbackResponse.ok) {
              const patient = await fallbackResponse.json();
              return {
                resourceType: 'Bundle',
                type: 'searchset',
                entry: [{ resource: patient }]
              } as FHIRBundle;
            }
          } catch (fallbackError) {
            // Wenn auch Fallback fehlschlägt, werfe ursprünglichen Fehler
          }
        }
        throw new Error(`FHIR Server Error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      // Wenn includeRelated=true, ist result bereits ein Bundle
      if (includeRelated && result.resourceType === 'Bundle') {
        // Stelle sicher, dass entry ein Array ist (auch wenn leer)
        if (!result.entry) {
          result.entry = [];
        }
        return result as FHIRBundle;
      }
      
      // Wenn includeRelated=false, erstelle Bundle nur mit Patient
      if (result.resourceType === 'Patient') {
        return {
          resourceType: 'Bundle',
          type: 'searchset',
          entry: [{ resource: result }]
        } as FHIRBundle;
      }
      
      // Fallback: Falls unerwartetes Format, versuche als Bundle zu behandeln
      if (!result.entry) {
        result.entry = [];
      }
      return result as FHIRBundle;
    } catch (error: any) {
      // Fallback: Wenn Search fehlschlägt, versuche Read-Operation ohne verwandte Ressourcen
      if (includeRelated) {
        console.warn('Search with _revinclude failed, falling back to Read operation:', error.message);
        try {
          const fallbackResponse = await fetch(`${this.baseUrl}/Patient/${patientId}`);
          if (fallbackResponse.ok) {
            const patient = await fallbackResponse.json();
            return {
              resourceType: 'Bundle',
              type: 'searchset',
              entry: [{ resource: patient }]
            } as FHIRBundle;
          }
          // Wenn Patient nicht gefunden wird, gebe leeres Bundle zurück
          return {
            resourceType: 'Bundle',
            type: 'searchset',
            entry: []
          } as FHIRBundle;
        } catch (fallbackError) {
          // Wenn auch Fallback fehlschlägt, werfe ursprünglichen Fehler
          throw error;
        }
      }
      throw error;
    }
  }

  /**
   * Empfangen: Alle Patienten abrufen
   */
  async receiveAllPatients(): Promise<FHIRPatient[]> {
    const response = await fetch(`${this.baseUrl}/Patient`);

    if (!response.ok) {
      throw new Error(`FHIR Server Error: ${response.status} ${response.statusText}`);
    }

    const bundle = await response.json();
    return bundle.entry?.map((e: any) => e.resource) || [];
  }

  /**
   * Senden: Condition (Diagnose) an FHIR-Server übertragen
   * Verwendet POST gemäß HAPI FHIR API: https://hapi.fhir.org/baseR4/swagger-ui/?page=Condition
   */
  async sendCondition(condition: FHIRCondition): Promise<FHIRCondition> {
    const response = await fetch(`${this.baseUrl}/Condition`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/fhir+json',
        'Accept': 'application/fhir+json',
      },
      body: JSON.stringify(condition),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `FHIR Server Error: ${response.status} ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.issue && errorJson.issue.length > 0) {
          errorMessage += ` - ${errorJson.issue.map((i: any) => i.diagnostics || i.details?.text).join(', ')}`;
        }
      } catch {
        errorMessage += ` - ${errorText}`;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  /**
   * Empfangen: Conditions für einen Patienten abrufen
   */
  async receiveConditions(patientId: string): Promise<FHIRCondition[]> {
    const response = await fetch(
      `${this.baseUrl}/Condition?subject=Patient/${patientId}`
    );

    if (!response.ok) {
      throw new Error(`FHIR Server Error: ${response.status} ${response.statusText}`);
    }

    const bundle = await response.json();
    return bundle.entry?.map((e: any) => e.resource) || [];
  }

  /**
   * Senden: Observation (Vitalparameter) an FHIR-Server übertragen
   * Verwendet POST gemäß HAPI FHIR API
   */
  async sendObservation(observation: FHIRObservation): Promise<FHIRObservation> {
    const response = await fetch(`${this.baseUrl}/Observation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/fhir+json',
        'Accept': 'application/fhir+json',
      },
      body: JSON.stringify(observation),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `FHIR Server Error: ${response.status} ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.issue && errorJson.issue.length > 0) {
          errorMessage += ` - ${errorJson.issue.map((i: any) => i.diagnostics || i.details?.text).join(', ')}`;
        }
      } catch {
        errorMessage += ` - ${errorText}`;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  /**
   * Empfangen: Observations für einen Patienten abrufen
   */
  async receiveObservations(patientId: string): Promise<FHIRObservation[]> {
    const response = await fetch(
      `${this.baseUrl}/Observation?subject=Patient/${patientId}`
    );

    if (!response.ok) {
      throw new Error(`FHIR Server Error: ${response.status} ${response.statusText}`);
    }

    const bundle = await response.json();
    return bundle.entry?.map((e: any) => e.resource) || [];
  }

  /**
   * Senden: Procedure an FHIR-Server übertragen
   * Verwendet POST gemäß HAPI FHIR API
   */
  async sendProcedure(procedure: FHIRProcedure): Promise<FHIRProcedure> {
    const response = await fetch(`${this.baseUrl}/Procedure`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/fhir+json',
        'Accept': 'application/fhir+json',
      },
      body: JSON.stringify(procedure),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `FHIR Server Error: ${response.status} ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.issue && errorJson.issue.length > 0) {
          errorMessage += ` - ${errorJson.issue.map((i: any) => i.diagnostics || i.details?.text).join(', ')}`;
        }
      } catch {
        errorMessage += ` - ${errorText}`;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  /**
   * Empfangen: Procedures für einen Patienten abrufen
   */
  async receiveProcedures(patientId: string): Promise<FHIRProcedure[]> {
    const response = await fetch(
      `${this.baseUrl}/Procedure?subject=Patient/${patientId}`
    );

    if (!response.ok) {
      throw new Error(`FHIR Server Error: ${response.status} ${response.statusText}`);
    }

    const bundle = await response.json();
    return bundle.entry?.map((e: any) => e.resource) || [];
  }

  /**
   * Löschen: Ressource vom FHIR-Server entfernen
   */
  async deleteResource(resourceType: string, resourceId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/${resourceType}/${resourceId}`, {
      method: 'DELETE',
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`FHIR Server Error: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Aktualisieren: Ressource am FHIR-Server updaten
   * Verwendet PUT gemäß HAPI FHIR API
   */
  async updateResource(resource: any): Promise<any> {
    const { resourceType, id } = resource;
    
    if (!id) {
      throw new Error('Resource ID is required for update');
    }

    const response = await fetch(`${this.baseUrl}/${resourceType}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/fhir+json',
        'Accept': 'application/fhir+json',
      },
      body: JSON.stringify(resource),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `FHIR Server Error: ${response.status} ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.issue && errorJson.issue.length > 0) {
          errorMessage += ` - ${errorJson.issue.map((i: any) => i.diagnostics || i.details?.text).join(', ')}`;
        }
      } catch {
        errorMessage += ` - ${errorText}`;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  /**
   * Senden: MedicationStatement an FHIR-Server übertragen
   * Verwendet POST gemäß HAPI FHIR API
   */
  async sendMedicationStatement(medicationStatement: FHIRMedicationStatement): Promise<FHIRMedicationStatement> {
    const response = await fetch(`${this.baseUrl}/MedicationStatement`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/fhir+json',
        'Accept': 'application/fhir+json',
      },
      body: JSON.stringify(medicationStatement),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `FHIR Server Error: ${response.status} ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.issue && errorJson.issue.length > 0) {
          errorMessage += ` - ${errorJson.issue.map((i: any) => i.diagnostics || i.details?.text).join(', ')}`;
        }
      } catch {
        errorMessage += ` - ${errorText}`;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  /**
   * Empfangen: MedicationStatements für einen Patienten abrufen
   */
  async receiveMedicationStatements(patientId: string): Promise<FHIRMedicationStatement[]> {
    const response = await fetch(
      `${this.baseUrl}/MedicationStatement?subject=Patient/${patientId}`
    );

    if (!response.ok) {
      throw new Error(`FHIR Server Error: ${response.status} ${response.statusText}`);
    }

    const bundle = await response.json();
    return bundle.entry?.map((e: any) => e.resource) || [];
  }

  /**
   * Verarbeiten: FHIR Transaction Bundle verarbeiten
   */
  async processBundle(bundle: FHIRBundle): Promise<FHIRBundle> {
    const response = await fetch(`${this.baseUrl}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/fhir+json',
      },
      body: JSON.stringify(bundle),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`FHIR Server Error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Empfangen: Bundle vom FHIR-Server abrufen
   * Unterstützt vollständige URLs (https://hapi.fhir.org/baseR4/Bundle/bundleid) oder nur Bundle ID
   */
  async receiveBundle(bundleIdOrUrl: string): Promise<FHIRBundle> {
    let url: string;
    
    // Prüfe ob es eine vollständige URL ist
    if (bundleIdOrUrl.startsWith('http://') || bundleIdOrUrl.startsWith('https://')) {
      // Vollständige URL - verwende direkt
      url = bundleIdOrUrl;
    } else {
      // Nur Bundle ID - konstruiere URL
      url = `${this.baseUrl}/Bundle/${bundleIdOrUrl}`;
    }

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `FHIR Server Error: ${response.status} ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.issue && errorJson.issue.length > 0) {
          errorMessage += ` - ${errorJson.issue.map((i: any) => i.diagnostics || i.details?.text).join(', ')}`;
        }
      } catch {
        errorMessage += ` - ${errorText}`;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  /**
   * Empfangen: Patient nach Identifier suchen und Bundle mit verwandten Ressourcen zurückgeben
   */
  async receivePatientByIdentifier(identifier: string): Promise<FHIRBundle> {
    // Versuche zuerst mit identifier Parameter
    const revIncludes = [
      'Condition:subject',
      'MedicationStatement:subject',
      'Observation:subject',
      'Procedure:subject'
    ];
    const url = `${this.baseUrl}/Patient?identifier=${encodeURIComponent(identifier)}&${revIncludes.map(inc => `_revinclude=${encodeURIComponent(inc)}`).join('&')}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`FHIR Server Error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      // Wenn result bereits ein Bundle ist
      if (result.resourceType === 'Bundle') {
        if (!result.entry) {
          result.entry = [];
        }
        return result as FHIRBundle;
      }
      
      // Fallback: Falls unerwartetes Format, versuche als Bundle zu behandeln
      if (!result.entry) {
        result.entry = [];
      }
      return result as FHIRBundle;
    } catch (error: any) {
      throw error;
    }
  }
}

// Singleton-Instanz
export const fhirClient = new FHIRClient();
