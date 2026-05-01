'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToastContainer } from '@/components/ui/toast';
import { useToast } from '@/hooks/useToast';
import { Upload, Download } from 'lucide-react';

export function PatientReceiveModal() {
  const [open, setOpen] = useState(false);
  const [fhirPatientId, setFhirPatientId] = useState('');
  const [jsonContent, setJsonContent] = useState('');
  const [loading, setLoading] = useState(false);
  const { toasts, removeToast, showError, showSuccess } = useToast();

  async function receiveByFhirId() {
    if (!fhirPatientId) {
      showError('Bitte FHIR Patient ID eingeben');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/fhir/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fhirPatientId }),
      });

      let data: any;
      try {
        data = await response.json();
      } catch (parseError) {
        const errorText = await response.text().catch(() => 'Unbekannter Fehler');
        showError(`Fehler beim Parsen der Antwort: ${errorText}`);
        setLoading(false);
        return;
      }

      if (response.ok) {
        showSuccess(`Patient erfolgreich empfangen! DB ID: ${data.patientId}`);
        setFhirPatientId('');
        setOpen(false);
        // Reload page to show new patient
        setTimeout(() => window.location.reload(), 1000);
      } else {
        const errorMessage = data?.error || `HTTP ${response.status}: ${response.statusText}`;
        showError(`Fehler beim Empfangen: ${errorMessage}`);
      }
    } catch (error: any) {
      console.error('Receive error:', error);
      showError('Fehler beim Empfangen: ' + (error.message || 'Unbekannter Fehler'));
    } finally {
      setLoading(false);
    }
  }

  async function receiveByJson() {
    if (!jsonContent) {
      showError('Bitte JSON-Inhalt eingeben oder hochladen');
      return;
    }

    setLoading(true);
    try {
      // Parse und validiere JSON
      const fhirPatient = JSON.parse(jsonContent);

      if (fhirPatient.resourceType !== 'Patient') {
        throw new Error('JSON muss eine FHIR Patient-Resource sein');
      }

      // Erstelle temporären Patient auf HAPI Server (falls noch nicht vorhanden)
      let patientId = fhirPatient.id;

      if (!patientId) {
        // Patient hat keine ID - sende zum HAPI Server
        const fhirResponse = await fetch('https://hapi.fhir.org/baseR4/Patient', {
          method: 'POST',
          headers: { 'Content-Type': 'application/fhir+json' },
          body: JSON.stringify(fhirPatient),
        });

        if (!fhirResponse.ok) {
          throw new Error('Fehler beim Senden an HAPI Server');
        }

        const sentPatient = await fhirResponse.json();
        patientId = sentPatient.id;
      }

      // Jetzt empfange mit der ID
      const response = await fetch('/api/fhir/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fhirPatientId: patientId }),
      });

      let data: any;
      try {
        data = await response.json();
      } catch (parseError) {
        const errorText = await response.text().catch(() => 'Unbekannter Fehler');
        showError(`Fehler beim Parsen der Antwort: ${errorText}`);
        setLoading(false);
        return;
      }

      if (response.ok) {
        showSuccess(`Patient aus JSON erfolgreich importiert! DB ID: ${data.patientId}`);
        setJsonContent('');
        setOpen(false);
        setTimeout(() => window.location.reload(), 1000);
      } else {
        const errorMessage = data?.error || `HTTP ${response.status}: ${response.statusText}`;
        showError(`Fehler beim Importieren: ${errorMessage}`);
      }
    } catch (error: any) {
      console.error('JSON import error:', error);
      showError('JSON-Fehler: ' + (error.message || 'Unbekannter Fehler'));
    } finally {
      setLoading(false);
    }
  }

  function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setJsonContent(content);
    };
    reader.readAsText(file);
  }

  return (
    <>
      <ToastContainer toasts={toasts} onClose={removeToast} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200">
            <Download className="h-4 w-4 mr-2" />
            Von FHIR empfangen
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Patient vom FHIR-Server empfangen</DialogTitle>
            <DialogDescription>
              Patient per ID vom HAPI-Server abrufen oder FHIR JSON importieren
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="id" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="id">FHIR ID</TabsTrigger>
              <TabsTrigger value="json">JSON Import</TabsTrigger>
            </TabsList>

            <TabsContent value="id" className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">FHIR Patient ID</label>
                <Input
                  placeholder="z.B. 53830753"
                  value={fhirPatientId}
                  onChange={(e) => setFhirPatientId(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && receiveByFhirId()}
                />
              </div>
              <Button onClick={receiveByFhirId} disabled={loading} className="w-full">
                {loading ? 'Empfange...' : 'Patient empfangen'}
              </Button>
            </TabsContent>

            <TabsContent value="json" className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">JSON-Datei hochladen</label>
                <div className="flex gap-2">
                  <Input
                    type="file"
                    accept=".json"
                    onChange={handleFileUpload}
                    className="flex-1"
                  />
                  <Button variant="outline" size="icon" onClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()}>
                    <Upload className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Oder JSON direkt eingeben</label>
                <textarea
                  className="w-full h-64 p-3 text-xs font-mono border rounded-md bg-muted"
                  placeholder='{"resourceType": "Patient", "name": [{"family": "Mustermann", "given": ["Max"]}], ...}'
                  value={jsonContent}
                  onChange={(e) => setJsonContent(e.target.value)}
                />
              </div>

              <Button onClick={receiveByJson} disabled={loading} className="w-full">
                {loading ? 'Importiere...' : 'JSON importieren'}
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default PatientReceiveModal;
