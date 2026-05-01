'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToastContainer } from '@/components/ui/toast';
import { useToast } from '@/hooks/useToast';
import { Download, Upload, ExternalLink, FileDown } from 'lucide-react';

interface BundleImportExportModalProps {
  onSuccess?: () => void;
}

export function BundleImportExportModal({ onSuccess }: BundleImportExportModalProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bundleUrl, setBundleUrl] = useState('');
  const [bundleId, setBundleId] = useState('');
  const [exportBundleId, setExportBundleId] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const { toasts, removeToast, showSuccess, showError } = useToast();

  const parseBundleUrl = (url: string): string | null => {
    try {
      // Unterstütze verschiedene URL-Formate:
      // - https://hapi.fhir.org/baseR4/Bundle/bundleid
      // - https://hapi.fhir.org/baseR4/Bundle/bundleid/_history/version
      // - Bundle/bundleid
      // - bundleid (nur ID)
      
      const urlPattern = /(?:https?:\/\/[^\/]+)?\/?baseR4\/Bundle\/([^\/\?]+)/;
      const match = url.match(urlPattern);
      
      if (match) {
        return match[1];
      }
      
      // Falls keine URL-Struktur, versuche es als direkte ID
      if (url.trim().length > 0 && !url.includes('/') && !url.includes('http')) {
        return url.trim();
      }
      
      return null;
    } catch (error) {
      return null;
    }
  };

  const handleImportByUrl = async () => {
    if (!bundleUrl) {
      showError('Bitte Bundle URL oder ID eingeben');
      return;
    }

    setLoading(true);
    try {
      // Parse Bundle ID aus URL
      const parsedId = parseBundleUrl(bundleUrl);
      
      if (!parsedId) {
        showError('Ungültige Bundle URL oder ID. Format: https://hapi.fhir.org/baseR4/Bundle/bundleid oder nur bundleid');
        setLoading(false);
        return;
      }

      // Bundle vom Server abrufen
      const response = await fetch(`/api/fhir/bundle/fetch?bundleId=${encodeURIComponent(parsedId)}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unbekannter Fehler' }));
        showError(`Fehler beim Abrufen des Bundles: ${errorData.error || response.statusText}`);
        setLoading(false);
        return;
      }

      const bundle = await response.json();

      // Validierung
      if (!bundle.resourceType || bundle.resourceType !== 'Bundle') {
        showError('Die Antwort muss ein FHIR Bundle sein');
        setLoading(false);
        return;
      }

      // Konvertiere Bundle zu Transaction Bundle Format falls nötig
      let transactionBundle = bundle;
      if (bundle.type !== 'transaction' && bundle.type !== 'batch') {
        // Konvertiere searchset/collection Bundle zu transaction Bundle
        transactionBundle = {
          resourceType: 'Bundle',
          type: 'transaction',
          entry: (bundle.entry || []).map((entry: any) => {
            const resource = entry.resource;
            if (!resource) return null;
            
            // Bestimme die Methode basierend auf ob die Ressource bereits eine ID hat
            const method = resource.id ? 'PUT' : 'POST';
            const resourceType = resource.resourceType;
            const url = resource.id 
              ? `${resourceType}/${resource.id}` 
              : resourceType;
            
            return {
              resource: resource,
              request: {
                method: method,
                url: url
              }
            };
          }).filter((entry: any) => entry !== null)
        };
      }

      // Bundle an API senden (wird an HAPI gesendet und lokal gespeichert)
      const processResponse = await fetch('/api/fhir/bundle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(transactionBundle),
      });

      let data: any;
      try {
        data = await processResponse.json();
      } catch (parseError) {
        const errorText = await processResponse.text().catch(() => 'Unbekannter Fehler');
        showError(`Fehler beim Parsen der Antwort: ${errorText}`);
        setLoading(false);
        return;
      }

      if (!processResponse.ok) {
        const errorMessage = data?.error || `HTTP ${processResponse.status}: ${processResponse.statusText}`;
        showError(`Fehler beim Verarbeiten: ${errorMessage}`);
        setLoading(false);
        return;
      }

      // Erfolg
      const results = data.results || {};
      const successMessage = 
        `Bundle erfolgreich vom Server importiert und verarbeitet! ` +
        `${results.patientsProcessed || 0} Patienten, ` +
        `${results.conditionsProcessed || 0} Diagnosen, ` +
        `${results.observationsProcessed || 0} Vitalparameter, ` +
        `${results.medicationStatementsProcessed || 0} Medikationen, ` +
        `${results.proceduresProcessed || 0} Prozeduren`;
      
      if (results.errors && results.errors.length > 0) {
        showError(`Bundle verarbeitet mit ${results.errors.length} Fehler(n): ${results.errors.map((e: any) => e.error || e).join(', ')}`);
      } else {
        showSuccess(successMessage);
      }

      setBundleUrl('');
      setBundleId('');
      setOpen(false);
      
      if (onSuccess) {
        onSuccess();
      }
      
      // Seite neu laden um neue Daten anzuzeigen
      window.location.reload();
    } catch (error: any) {
      console.error('Bundle import error:', error);
      showError(`Fehler beim Importieren: ${error.message || 'Unbekannter Fehler'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleImportById = async () => {
    if (!bundleId) {
      showError('Bitte Bundle ID eingeben');
      return;
    }

    // Verwende die URL-Funktion mit der ID
    setBundleUrl(bundleId);
    await handleImportByUrl();
  };

  const handleExport = async () => {
    if (!exportBundleId) {
      showError('Bitte Bundle ID eingeben');
      return;
    }

    setExportLoading(true);
    try {
      // Bundle vom Server abrufen
      const response = await fetch(`/api/fhir/bundle/fetch?bundleId=${encodeURIComponent(exportBundleId)}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unbekannter Fehler' }));
        showError(`Fehler beim Abrufen des Bundles: ${errorData.error || response.statusText}`);
        setExportLoading(false);
        return;
      }

      const bundle = await response.json();

      // Bundle als JSON-Datei herunterladen
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bundle-${exportBundleId}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showSuccess(`Bundle erfolgreich exportiert: bundle-${exportBundleId}.json`);
      setExportBundleId('');
    } catch (error: any) {
      console.error('Bundle export error:', error);
      showError(`Fehler beim Exportieren: ${error.message || 'Unbekannter Fehler'}`);
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <>
      <ToastContainer toasts={toasts} onClose={removeToast} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200">
            <ExternalLink className="h-4 w-4 mr-2" />
            Bundle Import/Export
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Bundle Import/Export</DialogTitle>
            <DialogDescription>
              Importieren Sie Bundles direkt vom HAPI FHIR Server per URL oder ID, oder exportieren Sie Bundles als JSON-Datei.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="import" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="import">Import</TabsTrigger>
              <TabsTrigger value="export">Export</TabsTrigger>
            </TabsList>

            <TabsContent value="import" className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Bundle URL (vollständig)</label>
                  <Input
                    placeholder="https://hapi.fhir.org/baseR4/Bundle/bundleid"
                    value={bundleUrl}
                    onChange={(e) => setBundleUrl(e.target.value)}
                    disabled={loading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Unterstützt vollständige URLs oder nur die Bundle ID
                  </p>
                  <Button 
                    onClick={handleImportByUrl} 
                    disabled={loading || !bundleUrl} 
                    className="w-full"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {loading ? 'Importiert...' : 'Bundle von URL importieren'}
                  </Button>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">oder</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Bundle ID</label>
                  <Input
                    placeholder="z.B. 12345"
                    value={bundleId}
                    onChange={(e) => setBundleId(e.target.value)}
                    disabled={loading}
                  />
                  <Button 
                    onClick={handleImportById} 
                    disabled={loading || !bundleId} 
                    className="w-full"
                    variant="outline"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {loading ? 'Importiert...' : 'Bundle von ID importieren'}
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="export" className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Bundle ID</label>
                <Input
                  placeholder="z.B. 12345"
                  value={exportBundleId}
                  onChange={(e) => setExportBundleId(e.target.value)}
                  disabled={exportLoading}
                />
                <p className="text-xs text-muted-foreground">
                  Geben Sie die Bundle ID ein, um das Bundle vom Server herunterzuladen
                </p>
                <Button 
                  onClick={handleExport} 
                  disabled={exportLoading || !exportBundleId} 
                  className="w-full"
                >
                  <FileDown className="h-4 w-4 mr-2" />
                  {exportLoading ? 'Exportiert...' : 'Bundle als JSON exportieren'}
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading || exportLoading}>
              Abbrechen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

