'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/useToast';
import { Card, CardContent } from '@/components/ui/card';
import { Copy, Eye } from 'lucide-react';

const DEFAULT_FHIR_BASE = 'https://hapi.fhir.org/baseR4';

interface PatientFhirModalProps {
  initialFhirId?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function PatientFhirModal({ initialFhirId = '', open: controlledOpen, onOpenChange }: PatientFhirModalProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;
  
  const [fhirId, setFhirId] = useState(initialFhirId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patientJson, setPatientJson] = useState<any | null>(null);
  const [bundleJson, setBundleJson] = useState<any | null>(null);
  const { showError, showSuccess } = useToast();

  const baseUrl = process.env.NEXT_PUBLIC_FHIR_BASE_URL || DEFAULT_FHIR_BASE;

  // Aktualisiere fhirId wenn initialFhirId sich ändert
  useEffect(() => {
    if (initialFhirId) {
      setFhirId(initialFhirId);
      if (open) {
        fetchPatientWithId(initialFhirId);
      }
    }
  }, [initialFhirId, open]);

  async function fetchPatientWithId(id: string) {
    if (!id) return;
    setLoading(true);
    setError(null);
    setPatientJson(null);
    setBundleJson(null);
    try {
      // Strategie 1: Search mit _id und _revinclude für eine einzige Anfrage
      try {
        const revIncludes = [
          'Condition:subject',
          'MedicationStatement:subject',
          'Observation:subject',
          'Procedure:subject'
        ];
        const searchUrl = `${baseUrl}/Patient?_id=${encodeURIComponent(id)}&${revIncludes.map(inc => `_revinclude=${encodeURIComponent(inc)}`).join('&')}`;
        const searchRes = await fetch(searchUrl);
        
        if (searchRes.ok) {
          const bundle = await searchRes.json();
          
          if (bundle?.resourceType === 'Bundle' && bundle.entry) {
            const patient = bundle.entry.find((e: any) => e.resource?.resourceType === 'Patient')?.resource;
            if (patient) {
              setPatientJson(patient);
              setBundleJson(bundle);
              const relatedCount = bundle.entry.length - 1; // -1 für Patient selbst
              showSuccess(`FHIR-Patient geladen mit ${relatedCount} verwandten Ressourcen`);
              return;
            }
          }
        }
      } catch (e) {
        // Fehlschlag bei Search, versuche Fallback
      }

      // Strategie 2: Suche nach identifier (KV-Nummer oder UUID) mit _revinclude
      try {
        const revIncludes = [
          'Condition:subject',
          'MedicationStatement:subject',
          'Observation:subject',
          'Procedure:subject'
        ];
        const searchUrl = `${baseUrl}/Patient?identifier=${encodeURIComponent(id)}&${revIncludes.map(inc => `_revinclude=${encodeURIComponent(inc)}`).join('&')}`;
        const searchRes = await fetch(searchUrl);

        if (searchRes.ok) {
          const bundle = await searchRes.json();

          if (bundle?.resourceType === 'Bundle' && bundle.entry && bundle.entry.length > 0) {
            const patient = bundle.entry.find((e: any) => e.resource?.resourceType === 'Patient')?.resource;
            if (patient) {
              setPatientJson(patient);
              setBundleJson(bundle);
              const relatedCount = bundle.entry.length - 1;
              showSuccess(`FHIR-Patient geladen mit ${relatedCount} verwandten Ressourcen`);
              return;
            }
          }
        }
      } catch (e) {
        // Fehlschlag
      }

      throw new Error('Kein Patient mit dieser ID oder diesem Identifier gefunden');
    } catch (err: any) {
      const msg = err?.message || 'Unbekannter Fehler';
      setError(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPatient() {
    await fetchPatientWithId(fhirId);
    }

  async function copyJsonToClipboard() {
    const dataToCopy = bundleJson || patientJson;
    if (!dataToCopy) {
      showError('Keine JSON-Daten zum Kopieren');
      return;
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(dataToCopy, null, 2));
      showSuccess('JSON in Zwischenablage kopiert');
    } catch (error) {
      showError('Kopieren fehlgeschlagen');
    }
  }

  function renderTextSummary(resource: any, bundle: any) {
    if (!resource) return 'Keine Daten geladen';
    const name = resource.name?.[0];
    const patientName = [name?.given?.[0], name?.family].filter(Boolean).join(' ');
    const gender = resource.gender || 'unbekannt';
    const birth = resource.birthDate || 'unbekannt';
    const addr = resource.address?.[0];
    const address = addr
      ? [addr.line?.[0], addr.postalCode, addr.city].filter(Boolean).join(' ')
      : 'keine Angabe';
    const identifier = resource.identifier?.[0]?.value || 'keine';

    // Zähle verwandte Ressourcen aus Bundle
    const conditions = bundle?.entry?.filter((e: any) => e.resource?.resourceType === 'Condition') || [];
    const medications = bundle?.entry?.filter((e: any) => e.resource?.resourceType === 'MedicationStatement') || [];
    const observations = bundle?.entry?.filter((e: any) => e.resource?.resourceType === 'Observation') || [];
    const procedures = bundle?.entry?.filter((e: any) => e.resource?.resourceType === 'Procedure') || [];

    return (
      <div className="space-y-3 text-sm">
        <div className="space-y-1">
          <div><strong>Name:</strong> {patientName || 'unbekannt'}</div>
          <div><strong>Geburtsdatum:</strong> {birth}</div>
          <div><strong>Geschlecht:</strong> {gender}</div>
          <div><strong>Adresse:</strong> {address}</div>
          <div><strong>KV/Identifier:</strong> {identifier}</div>
          <div><strong>FHIR ID:</strong> {resource.id}</div>
        </div>
        
        {(conditions.length > 0 || medications.length > 0 || observations.length > 0 || procedures.length > 0) && (
          <div className="border-t pt-3 space-y-2">
            <div className="font-semibold">Verwandte Ressourcen:</div>
            {conditions.length > 0 && (
              <div>
                <strong>Conditions (Diagnosen):</strong> {conditions.length}
                <ul className="ml-4 mt-1 space-y-1">
                  {conditions.slice(0, 5).map((e: any, idx: number) => {
                    const cond = e.resource;
                    const code = cond.code?.coding?.[0];
                    return (
                      <li key={idx} className="text-xs">
                        • {code?.display || code?.code || 'Unbekannt'} ({cond.clinicalStatus?.coding?.[0]?.code || 'unknown'})
                      </li>
                    );
                  })}
                  {conditions.length > 5 && <li className="text-xs text-muted-foreground">... und {conditions.length - 5} weitere</li>}
                </ul>
              </div>
            )}
            {medications.length > 0 && (
              <div>
                <strong>Medications:</strong> {medications.length}
                <ul className="ml-4 mt-1 space-y-1">
                  {medications.slice(0, 5).map((e: any, idx: number) => {
                    const med = e.resource;
                    const medCode = med.medicationCodeableConcept?.coding?.[0];
                    return (
                      <li key={idx} className="text-xs">
                        • {medCode?.display || medCode?.code || 'Unbekannt'} ({med.status || 'unknown'})
                      </li>
                    );
                  })}
                  {medications.length > 5 && <li className="text-xs text-muted-foreground">... und {medications.length - 5} weitere</li>}
                </ul>
              </div>
            )}
            {observations.length > 0 && (
              <div>
                <strong>Observations:</strong> {observations.length}
              </div>
            )}
            {procedures.length > 0 && (
              <div>
                <strong>Procedures:</strong> {procedures.length}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200">
                  <Eye className="h-4 w-4 mr-2" />
                  FHIR anzeigen
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>FHIR Patient abrufen</DialogTitle>
                    <DialogDescription>
                        FHIR Patient ID eingeben, um die Ressource vom HAPI-Server zu laden.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 overflow-y-auto flex-1">
                    <div className="flex gap-2">
                        <Input
                            placeholder="FHIR Patient ID"
                            value={fhirId}
                            onChange={(e) => setFhirId(e.target.value)}
                        />
                        <Button onClick={fetchPatient} disabled={loading}>
                            {loading ? 'Lade...' : 'Laden'}
                        </Button>
                    </div>
                    {error && <div className="text-sm text-red-600">{error}</div>}

                    <Card>
                        <CardContent className="pt-4">
                            <Tabs defaultValue="text">
                                <TabsList>
                                    <TabsTrigger value="text">Text</TabsTrigger>
                                    <TabsTrigger value="json">JSON</TabsTrigger>
                                </TabsList>
                                <TabsContent value="text">
                                    {renderTextSummary(patientJson, bundleJson)}
                                </TabsContent>
                                <TabsContent value="json" className="space-y-2">
                                    <div className="flex justify-end gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={copyJsonToClipboard}
                                            disabled={!patientJson}
                                        >
                                            <Copy className="h-4 w-4 mr-2" />
                                            {bundleJson ? 'Bundle kopieren' : 'JSON kopieren'}
                                        </Button>
                                    </div>
                                    <pre className="bg-muted text-xs p-3 rounded-md overflow-auto max-h-96 whitespace-pre-wrap break-words">
                                        {bundleJson ? JSON.stringify(bundleJson, null, 2) : (patientJson ? JSON.stringify(patientJson, null, 2) : 'Noch keine Daten geladen')}
                                    </pre>
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Schliessen</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default PatientFhirModal;
