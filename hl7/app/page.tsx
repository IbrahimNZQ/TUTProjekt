'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ToastContainer } from '@/components/ui/toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import { Copy, Download, Settings2, Trash2, UserPlus, Eye, RefreshCw, Upload, Send, FileUp, Menu, X, FileText, Heart, Activity, User, Calendar, MapPin, Building2, Phone, Mail, Stethoscope, Pill, ClipboardList, Info, Tag } from 'lucide-react';
import PatientFhirModal from '@/components/PatientFhirModal';
import PatientReceiveModal from '@/components/PatientReceiveModal';
import { BundleUploadModal } from '@/components/BundleUploadModal';
import { BundleImportExportModal } from '@/components/BundleImportExportModal';
import { AddConditionModal } from '@/components/AddConditionModal';
import { AddMedicationModal } from '@/components/AddMedicationModal';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { fhirClient } from '@/lib/fhir-client';

interface PatientView {
  id: string;
  kv_nummer: string;
  name: string;
  birthdate: string;
  gender: string;
  address: string;
  provider: string;
  condition_count: number;
  observation_count: number;
  sync_token: string | null;
  is_external: boolean;
}


interface PatientDetails {
  patient: any;
  conditions?: Array<{
    id: string;
    code_value: string;
    code_display: string;
    clinical_status_code: string;
    recorded_date: string;
  }>;
  observations?: Array<{
    id: string;
    code_value: string;
    code_display: string;
    value_quantity_value: number;
    value_quantity_unit: string;
    effective_datetime: string;
  }>;
  medications?: Array<{
    id: string;
    medication_code: string;
    medication_display: string;
    status: string;
    effective_period_start: string;
    effective_period_end: string;
    dosage_text: string;
    note_text: string;
  }>;
  fhirBundle?: any;
  fhirPatient?: any;
}

export default function Home() {
  const [patients, setPatients] = useState<PatientView[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncPatientId, setSyncPatientId] = useState('');
  const [creatingPatient, setCreatingPatient] = useState(false);
  const [syncAllLoading, setSyncAllLoading] = useState(false);
  const [fhirModalOpen, setFhirModalOpen] = useState(false);
  const [fhirModalId, setFhirModalId] = useState('');
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [patientToDelete, setPatientToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [refreshingPatients, setRefreshingPatients] = useState<Set<string>>(new Set());
  
  // Spalten-Konfiguration
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    // Lade gespeicherte Einstellungen aus localStorage oder verwende Standardwerte
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('patientTableColumns');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          // Fallback zu Standardwerten
        }
      }
    }
    // Standard: alle Spalten sichtbar
    return {
      'nr': true,
      'kv_nummer': true,
      'name': true,
      'birthdate': true,
      'gender': true,
      'address': true,
      'provider': true,
      'sync_token': true,
      'condition_count': true,
      'observation_count': true,
      'actions': true,
    };
  });

  const columnDefinitions = [
    { key: 'nr', label: 'Nr.' },
    { key: 'kv_nummer', label: 'KV-Nummer' },
    { key: 'name', label: 'Name' },
    { key: 'birthdate', label: 'Geburtsdatum' },
    { key: 'gender', label: 'Geschlecht' },
    { key: 'address', label: 'Adresse' },
    { key: 'provider', label: 'Krankenkasse' },
    { key: 'sync_token', label: 'FHIR-ID' },
    { key: 'condition_count', label: 'Diagnosen' },
    { key: 'observation_count', label: 'Vital' },
    { key: 'actions', label: 'Aktionen' },
  ];

  // Speichere Spalteneinstellungen im localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('patientTableColumns', JSON.stringify(visibleColumns));
    }
  }, [visibleColumns]);
  const [newPatient, setNewPatient] = useState({
    kv_nummer: '',
    firstname: '',
    lastname: '',
    birthdate: '',
    gender: '',
    street: '',
    zip: '',
    city: '',
    phone: '',
    email: '',
    provider_name: '',
    provider_id: '',
  });
  const { toasts, removeToast, showSuccess, showError } = useToast();

  useEffect(() => {
    loadPatients();
  }, []);

  async function loadPatients() {
    try {
      // Nutze optimierte View
      const response = await fetch('/api/views/patients');
      const data = await response.json();
      setPatients(data.patients || []);
    } catch (error) {
      console.error('Error loading patients:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadPatientDetails(patientId: string) {
    try {
      const response = await fetch(`/api/patients/${patientId}`);
      const data = await response.json();
      // Stelle sicher, dass conditions, observations und medications immer Arrays sind
      setSelectedPatient({
        ...data,
        conditions: data.conditions || [],
        observations: data.observations || [],
        medications: data.medications || [],
      });
    } catch (error) {
      console.error('Error loading patient details:', error);
    }
  }

  async function copyPatientId(patientId: string) {
    try {
      await navigator.clipboard.writeText(patientId);
      showSuccess('FHIR/UUID kopiert');
    } catch (error: any) {
      showError('Kopieren nicht möglich');
    }
  }

  async function exportPatientAsJson(patientId: string, patientName: string, syncToken: string | null) {
    try {
      let exportData: any;
      let filename: string;

      if (syncToken) {
        // Patient ist synchronisiert - hole Bundle mit allen Ressourcen vom HAPI Server
        // Verwendet eine einzige Search-Anfrage mit _revinclude
        exportData = await fhirClient.receivePatient(syncToken, true);
        filename = `patient_bundle_${patientName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
        showSuccess('FHIR Patient Bundle als JSON exportiert');
      } else {
        // Patient nicht synchronisiert - hole lokale Daten
        const response = await fetch(`/api/patients/${patientId}`);
        if (!response.ok) {
          throw new Error('Patient konnte nicht geladen werden');
        }
        exportData = await response.json();
        filename = `patient_local_${patientName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
        showSuccess('Lokaler Patient als JSON exportiert');
      }
      
      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      showError('Export fehlgeschlagen: ' + (error?.message || 'Unbekannter Fehler'));
    }
  }

  async function sendToFHIR(patientId: string) {
    setSyncing(true);
    try {
      const response = await fetch('/api/fhir/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId }),
      });
      const data = await response.json();
      if (response.ok) {
        showSuccess(`Patient erfolgreich gesendet! FHIR ID: ${data.patient.id}`);
        setSyncPatientId('');
        setSendDialogOpen(false);
        loadPatients();
      } else {
        showError(`Fehler: ${data.error}`);
      }
    } catch (error: any) {
      showError(`Fehler: ${error.message}`);
    } finally {
      setSyncing(false);
    }
  }

  async function createPatient() {
    if (!newPatient.kv_nummer || !newPatient.firstname || !newPatient.lastname) {
      showError('KV-Nummer, Vorname und Nachname sind erforderlich');
      return;
    }

    setCreatingPatient(true);
    try {
      const response = await fetch('/api/patients/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPatient),
      });
      const data = await response.json();
      if (response.ok || response.status === 201) {
        showSuccess(`Patient angelegt und an FHIR gesendet! Lokal: ${data.patientId}${data.fhirId ? `, FHIR: ${data.fhirId}` : ''}`);
        setNewPatient({
          kv_nummer: '',
          firstname: '',
          lastname: '',
          birthdate: '',
          gender: '',
          street: '',
          zip: '',
          city: '',
          phone: '',
          email: '',
          provider_name: '',
          provider_id: '',
        });
        loadPatients();
      } else {
        showError(`Fehler: ${data.error}`);
      }
    } catch (error: any) {
      showError(`Fehler: ${error.message}`);
    } finally {
      setCreatingPatient(false);
    }
  }

  async function syncAllToFHIR() {
    setSyncAllLoading(true);
    try {
      const res = await fetch('/api/fhir/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        showError(data.error || 'Sync fehlgeschlagen');
        return;
      }
      const successCount = (data.results || []).filter((r: any) => !r.error).length;
      showSuccess(`Sync abgeschlossen: ${successCount} Patient(en) gesendet`);
      await loadPatients();
    } catch (err: any) {
      showError(err?.message || 'Sync fehlgeschlagen');
    } finally {
      setSyncAllLoading(false);
    }
  }

  async function refreshFromHAPI(patientId: string, fhirPatientId: string) {
    if (!fhirPatientId) {
      showError('Patient ist nicht mit HAPI synchronisiert');
      return;
    }

    setRefreshingPatients(prev => new Set(prev).add(patientId));
    try {
      const response = await fetch('/api/fhir/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fhirPatientId }),
      });

      const data = await response.json();
      if (response.ok) {
        showSuccess(`Patient erfolgreich vom HAPI-Server aktualisiert!`);
        await loadPatients(); // Aktualisiere die Patientenliste
        if (selectedPatient && selectedPatient.patient.id === patientId) {
          await loadPatientDetails(patientId); // Aktualisiere Details falls geöffnet
        }
      } else {
        showError(`Fehler beim Aktualisieren: ${data.error || response.statusText}`);
      }
    } catch (error: any) {
      showError(`Fehler: ${error.message || 'Unbekannter Fehler'}`);
    } finally {
      setRefreshingPatients(prev => {
        const next = new Set(prev);
        next.delete(patientId);
        return next;
      });
    }
  }

  function openDeleteModal(patientId: string, patientName: string) {
    setPatientToDelete({ id: patientId, name: patientName });
    setDeleteModalOpen(true);
  }

  async function confirmDelete() {
    if (!patientToDelete) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/patients/${patientToDelete.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        showError(data.error || 'Fehler beim Löschen des Patienten');
        return;
      }

      showSuccess(`Patient "${patientToDelete.name}" erfolgreich gelöscht`);
      setDeleteModalOpen(false);
      setPatientToDelete(null);
      await loadPatients();
    } catch (error: any) {
      showError(`Fehler beim Löschen: ${error.message || 'Unbekannter Fehler'}`);
    } finally {
      setDeleting(false);
    }
  }


  return (
    <TooltipProvider>
      <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100">
        <ToastContainer toasts={toasts} onClose={removeToast} />
        
        {/* Toolbar oben mit Controls */}
        <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
          <div className="container mx-auto px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-600 mr-2 hidden sm:block">
                📡 Controls:
              </h2>
            <Tooltip>
              <TooltipTrigger asChild>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200">
                      <UserPlus className="h-4 w-4 mr-2" />
                      Neuer Patient
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Neuen Patienten anlegen</DialogTitle>
                      <DialogDescription>
                        Der Patient wird lokal gespeichert und automatisch an den FHIR-Server gesendet.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-1">KV-Nummer *</label>
                          <Input
                            placeholder="z.B. 123456789012"
                            value={newPatient.kv_nummer}
                            onChange={(e) => setNewPatient({...newPatient, kv_nummer: e.target.value})}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Geschlecht</label>
                          <Select value={newPatient.gender} onValueChange={(value: string) => setNewPatient({...newPatient, gender: value})}>
                            <SelectTrigger>
                              <SelectValue placeholder="Wählen..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="M">Männlich</SelectItem>
                              <SelectItem value="F">Weiblich</SelectItem>
                              <SelectItem value="O">Sonstig</SelectItem>
                              <SelectItem value="U">Unbekannt</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-1">Vorname *</label>
                          <Input
                            placeholder="z.B. Max"
                            value={newPatient.firstname}
                            onChange={(e) => setNewPatient({...newPatient, firstname: e.target.value})}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Nachname *</label>
                          <Input
                            placeholder="z.B. Mustermann"
                            value={newPatient.lastname}
                            onChange={(e) => setNewPatient({...newPatient, lastname: e.target.value})}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-1">Geburtsdatum</label>
                          <Input
                            type="date"
                            value={newPatient.birthdate}
                            onChange={(e) => setNewPatient({...newPatient, birthdate: e.target.value})}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Krankenkasse</label>
                          <Select value={newPatient.provider_name} onValueChange={(value: string) => setNewPatient({...newPatient, provider_name: value})}>
                            <SelectTrigger>
                              <SelectValue placeholder="Wählen..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="AOK">AOK</SelectItem>
                              <SelectItem value="TK">Techniker Krankenkasse</SelectItem>
                              <SelectItem value="DAK">DAK-Gesundheit</SelectItem>
                              <SelectItem value="Barmer">BARMER</SelectItem>
                              <SelectItem value="BKK">BKK</SelectItem>
                              <SelectItem value="IKK">IKK</SelectItem>
                              <SelectItem value="Knappschaft">Knappschaft</SelectItem>
                              <SelectItem value="Andere">Andere</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-1">Straße</label>
                          <Input
                            placeholder="z.B. Musterstr. 1"
                            value={newPatient.street}
                            onChange={(e) => setNewPatient({...newPatient, street: e.target.value})}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">PLZ</label>
                          <Input
                            placeholder="z.B. 12345"
                            value={newPatient.zip}
                            onChange={(e) => setNewPatient({...newPatient, zip: e.target.value})}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Stadt</label>
                          <Input
                            placeholder="z.B. Musterstadt"
                            value={newPatient.city}
                            onChange={(e) => setNewPatient({...newPatient, city: e.target.value})}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-1">Telefon</label>
                          <Input
                            placeholder="z.B. 03012345678"
                            value={newPatient.phone}
                            onChange={(e) => setNewPatient({...newPatient, phone: e.target.value})}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">E-Mail</label>
                          <Input
                            type="email"
                            placeholder="z.B. max@example.com"
                            value={newPatient.email}
                            onChange={(e) => setNewPatient({...newPatient, email: e.target.value})}
                          />
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={createPatient} disabled={creatingPatient}>
                        {creatingPatient ? 'Speichert...' : 'Patient anlegen'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </TooltipTrigger>
              <TooltipContent>Neuen Patienten erstellen</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <PatientFhirModal 
                    initialFhirId={fhirModalId}
                    open={fhirModalOpen}
                    onOpenChange={setFhirModalOpen}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>FHIR Patient vom Server anzeigen</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={syncAllToFHIR}
                  disabled={syncAllLoading}
                  className="bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${syncAllLoading ? 'animate-spin' : ''}`} />
                  {syncAllLoading ? 'Sync...' : 'Alle senden'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Alle Patienten an FHIR senden</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <PatientReceiveModal />
                </div>
              </TooltipTrigger>
              <TooltipContent>Patient von FHIR Server empfangen</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <BundleUploadModal onSuccess={loadPatients} />
                </div>
              </TooltipTrigger>
              <TooltipContent>FHIR Bundle hochladen</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <BundleImportExportModal onSuccess={loadPatients} />
                </div>
              </TooltipTrigger>
              <TooltipContent>Bundle vom Server importieren/exportieren</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="icon" className="bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-200">
                      <Send className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Patient an FHIR-Server senden</DialogTitle>
                      <DialogDescription>
                        Geben Sie die lokale Patient ID ein, um den Patienten zu senden.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <Input
                        placeholder="Patient ID (UUID)"
                        value={syncPatientId}
                        onChange={(e) => setSyncPatientId(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && syncPatientId && !syncing) {
                            sendToFHIR(syncPatientId);
                          }
                        }}
                      />
                    </div>
                    <DialogFooter>
                      <Button 
                        variant="outline"
                        onClick={() => {
                          setSendDialogOpen(false);
                          setSyncPatientId('');
                        }}
                        disabled={syncing}
                      >
                        Abbrechen
                      </Button>
                      <Button 
                        onClick={() => {
                          if (syncPatientId) {
                            sendToFHIR(syncPatientId);
                          }
                        }} 
                        disabled={syncing || !syncPatientId}
                      >
                        {syncing ? 'Sende...' : 'Senden'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </TooltipTrigger>
              <TooltipContent>Einzelnen Patient an FHIR senden</TooltipContent>
            </Tooltip>
            </div>
          </div>
        </div>

        {/* Hauptinhalt */}
        <main className="container mx-auto p-4 md:p-8">
          <div className="mb-4 md:mb-6">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1">
              🏥 HL7 FHIR System
            </h1>
            <p className="text-sm md:text-base text-gray-600">
              Patientenverwaltung mit FHIR-Synchronisation
            </p>
          </div>

          {/* Patientenübersicht */}
          <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                  <div>
                    <CardTitle>Patientenübersicht</CardTitle>
                    <CardDescription>
                      {patients.length} Patient(en) mit aggregierten Daten
                    </CardDescription>
                  </div>
                  <Dialog open={columnSettingsOpen} onOpenChange={setColumnSettingsOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Settings2 className="h-4 w-4 mr-2" />
                        Spalten
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Spalten auswählen</DialogTitle>
                        <DialogDescription>
                          Wählen Sie die Spalten aus, die in der Tabelle angezeigt werden sollen.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        {columnDefinitions.map((col) => (
                          <div key={col.key} className="flex items-center space-x-2">
                            <Checkbox
                              id={col.key}
                              checked={visibleColumns[col.key] || false}
                              onCheckedChange={(checked) => {
                                setVisibleColumns({
                                  ...visibleColumns,
                                  [col.key]: checked as boolean,
                                });
                                localStorage.setItem(
                                  'patientTableColumns',
                                  JSON.stringify({
                                    ...visibleColumns,
                                    [col.key]: checked,
                                  })
                                );
                              }}
                            />
                            <label
                              htmlFor={col.key}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              {col.label}
                            </label>
                          </div>
                        ))}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-12">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                    <p className="mt-2 text-sm text-gray-500">Lade Patienten...</p>
                  </div>
                ) : patients.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">Keine Patienten gefunden</p>
                    <p className="text-sm text-gray-400 mt-1">Erstellen Sie einen neuen Patienten oder importieren Sie einen von FHIR</p>
                  </div>
                ) : (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {visibleColumns.nr && <TableHead>Nr.</TableHead>}
                          {visibleColumns.kv_nummer && <TableHead>KV-Nummer</TableHead>}
                          {visibleColumns.name && <TableHead>Name</TableHead>}
                          {visibleColumns.birthdate && <TableHead>Geburtsdatum</TableHead>}
                          {visibleColumns.gender && <TableHead>Geschlecht</TableHead>}
                          {visibleColumns.address && <TableHead>Adresse</TableHead>}
                          {visibleColumns.provider && <TableHead>Krankenkasse</TableHead>}
                          {visibleColumns.sync_token && <TableHead>FHIR-ID</TableHead>}
                          {visibleColumns.condition_count && <TableHead className="text-center">Diagnosen</TableHead>}
                          {visibleColumns.observation_count && <TableHead className="text-center">Vital</TableHead>}
                          {visibleColumns.actions && <TableHead>Aktionen</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {patients.map((patient, idx) => (
                          <TableRow 
                            key={patient.id}
                            className={`
                              transition-colors cursor-pointer
                              ${patient.is_external ? 'bg-orange-50 hover:bg-orange-100 border-l-4 border-l-orange-400' : 'hover:bg-gray-50'}
                            `}
                          >
                            {visibleColumns.nr && (
                              <TableCell className="font-medium">
                                {idx + 1}
                                {patient.is_external && (
                                  <Badge variant="outline" className="ml-2 text-xs bg-orange-100 text-orange-700 border-orange-300">
                                    Fremd
                                  </Badge>
                                )}
                              </TableCell>
                            )}
                            {visibleColumns.kv_nummer && (
                              <TableCell className="font-mono text-sm">
                                {patient.kv_nummer}
                              </TableCell>
                            )}
                            {visibleColumns.name && (
                              <TableCell className="font-semibold">{patient.name}</TableCell>
                            )}
                            {visibleColumns.birthdate && (
                              <TableCell>{patient.birthdate}</TableCell>
                            )}
                            {visibleColumns.gender && (
                              <TableCell>{patient.gender}</TableCell>
                            )}
                            {visibleColumns.address && (
                              <TableCell className="text-sm">{patient.address}</TableCell>
                            )}
                            {visibleColumns.provider && (
                              <TableCell className="text-sm">{patient.provider}</TableCell>
                            )}
                            {visibleColumns.sync_token && (
                              <TableCell className="font-mono text-xs">
                                {patient.sync_token ? (
                                  <Button
                                    variant="link"
                                    size="sm"
                                    className="h-auto p-0 text-xs"
                                    onClick={() => {
                                      setFhirModalId(patient.sync_token!);
                                      setFhirModalOpen(true);
                                    }}
                                  >
                                    {patient.sync_token}
                                  </Button>
                                ) : (
                                  <span className="text-gray-400">nicht synced</span>
                                )}
                              </TableCell>
                            )}
                            {visibleColumns.condition_count && (
                              <TableCell className="text-center">
                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                  {patient.condition_count}
                                </Badge>
                              </TableCell>
                            )}
                            {visibleColumns.observation_count && (
                              <TableCell className="text-center">
                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                  {patient.observation_count}
                                </Badge>
                              </TableCell>
                            )}
                            {visibleColumns.actions && (
                              <TableCell>
                                <div className="flex gap-1">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0"
                                        onClick={() => copyPatientId(patient.id)}
                                      >
                                        <Copy className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>UUID kopieren</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0"
                                        onClick={() => exportPatientAsJson(patient.id, patient.name, patient.sync_token)}
                                      >
                                        <Download className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Als JSON exportieren</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                        onClick={() => openDeleteModal(patient.id, patient.name)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Patient löschen</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                        onClick={() => {
                                          setSyncPatientId(patient.id);
                                          setSendDialogOpen(true);
                                        }}
                                      >
                                        <Send className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Patient an FHIR senden</TooltipContent>
                                  </Tooltip>
                                  {patient.sync_token && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                          onClick={() => refreshFromHAPI(patient.id, patient.sync_token!)}
                                          disabled={refreshingPatients.has(patient.id)}
                                        >
                                          <RefreshCw className={`h-4 w-4 ${refreshingPatients.has(patient.id) ? 'animate-spin' : ''}`} />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Von HAPI aktualisieren</TooltipContent>
                                    </Tooltip>
                                  )}
                                  <Dialog>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <DialogTrigger asChild>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8"
                                            onClick={() => loadPatientDetails(patient.id)}
                                          >
                                            Details
                                          </Button>
                                        </DialogTrigger>
                                      </TooltipTrigger>
                                      <TooltipContent>Patientendetails anzeigen</TooltipContent>
                                    </Tooltip>
                                    <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
                                    <DialogHeader>
                                      <DialogTitle className="text-xl md:text-2xl flex items-center gap-2">
                                        <User className="h-5 w-5 md:h-6 md:w-6" />
                                        {patient.name}
                                      </DialogTitle>
                                      <DialogDescription className="text-sm md:text-base">
                                        KV-Nummer: <span className="font-mono font-semibold">{patient.kv_nummer}</span>
                                      </DialogDescription>
                                    </DialogHeader>
                                    {selectedPatient && (
                                      <div className="space-y-4 md:space-y-5 py-4">
                                        {/* Stammdaten Card */}
                                        <Card>
                                          <CardHeader className="pb-2 md:pb-3">
                                            <CardTitle className="text-base md:text-lg flex items-center gap-2">
                                              <ClipboardList className="h-4 w-4" />
                                              Stammdaten
                                            </CardTitle>
                                          </CardHeader>
                                          <CardContent>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 text-sm">
                                              <div className="flex flex-col">
                                                <span className="text-gray-500 font-medium flex items-center gap-1">
                                                  <Calendar className="h-3 w-3" />
                                                  Geburtsdatum
                                                </span>
                                                <span className="mt-1">{patient.birthdate || '-'}</span>
                                              </div>
                                              <div className="flex flex-col">
                                                <span className="text-gray-500 font-medium flex items-center gap-1">
                                                  <User className="h-3 w-3" />
                                                  Geschlecht
                                                </span>
                                                <span className="mt-1">{patient.gender || '-'}</span>
                                              </div>
                                              <div className="flex flex-col col-span-1 md:col-span-2">
                                                <span className="text-gray-500 font-medium flex items-center gap-1">
                                                  <MapPin className="h-3 w-3" />
                                                  Adresse
                                                </span>
                                                <span className="mt-1">{patient.address || '-'}</span>
                                              </div>
                                              <div className="flex flex-col">
                                                <span className="text-gray-500 font-medium flex items-center gap-1">
                                                  <Phone className="h-3 w-3" />
                                                  Telefon
                                                </span>
                                                <span className="mt-1">{selectedPatient.patient?.phone || '-'}</span>
                                              </div>
                                              <div className="flex flex-col">
                                                <span className="text-gray-500 font-medium flex items-center gap-1">
                                                  <Mail className="h-3 w-3" />
                                                  E-Mail
                                                </span>
                                                <span className="mt-1">{selectedPatient.patient?.email || '-'}</span>
                                              </div>
                                              <div className="flex flex-col col-span-1 md:col-span-2">
                                                <span className="text-gray-500 font-medium flex items-center gap-1">
                                                  <Building2 className="h-3 w-3" />
                                                  Krankenkasse
                                                </span>
                                                <span className="mt-1">{patient.provider || '-'}</span>
                                              </div>
                                            </div>
                                          </CardContent>
                                        </Card>

                                        {/* Diagnosen Card */}
                                        <Card>
                                          <CardHeader className="pb-2 md:pb-3">
                                            <div className="flex justify-between items-center">
                                              <CardTitle className="text-base md:text-lg flex items-center gap-2">
                                                <Stethoscope className="h-4 w-4" />
                                                Diagnosen
                                                <Badge variant="secondary" className="ml-2 bg-blue-100 text-blue-700">
                                                  {selectedPatient.conditions?.length || 0}
                                                </Badge>
                                              </CardTitle>
                                              <AddConditionModal 
                                                patientId={selectedPatient.patient?.id || patient.id} 
                                                onSuccess={async () => {
                                                  // Kurze Verzögerung, damit die Datenbank die Änderungen verarbeitet hat
                                                  await new Promise(resolve => setTimeout(resolve, 500));
                                                  const patientIdToReload = selectedPatient.patient?.id || patient.id;
                                                  await loadPatientDetails(patientIdToReload);
                                                  await loadPatients(); // Aktualisiere auch die Patientenliste für die Zähler
                                                }}
                                              />
                                            </div>
                                          </CardHeader>
                                          <CardContent>
                                            {selectedPatient.conditions && selectedPatient.conditions.length > 0 ? (
                                              <div className="space-y-3">
                                                {selectedPatient.conditions.map((condition) => (
                                                  <div key={condition.id} className="border-l-4 border-l-blue-500 bg-blue-50 rounded-r-lg p-4 hover:bg-blue-100 transition-colors">
                                                    <div className="font-semibold text-base mb-1">{condition.code_display}</div>
                                                    <div className="flex flex-wrap gap-3 text-sm text-gray-600 mb-2">
                                                      <span>
                                                        <span className="font-medium">ICD-10:</span>{' '}
                                                        <Badge variant="outline" className="ml-1">{condition.code_value}</Badge>
                                                      </span>
                                                      <span>
                                                        <span className="font-medium">Status:</span>{' '}
                                                        <Badge variant={condition.clinical_status_code === 'active' ? 'default' : 'secondary'}>
                                                          {condition.clinical_status_code}
                                                        </Badge>
                                                      </span>
                                                    </div>
                                                    <div className="text-xs text-gray-500">
                                                      Aufgezeichnet: {new Date(condition.recorded_date).toLocaleDateString('de-DE', { 
                                                        year: 'numeric', 
                                                        month: 'long', 
                                                        day: 'numeric',
                                                        hour: '2-digit',
                                                        minute: '2-digit'
                                                      })}
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            ) : (
                                              <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                                                Keine Diagnosen vorhanden
                                              </div>
                                            )}
                                          </CardContent>
                                        </Card>

                                        {/* Vitalparameter Card */}
                                        <Card>
                                          <CardHeader className="pb-2 md:pb-3">
                                            <CardTitle className="text-base md:text-lg flex items-center gap-2">
                                              <Activity className="h-4 w-4" />
                                              Vitalparameter
                                              <Badge variant="secondary" className="ml-2 bg-green-100 text-green-700">
                                                {selectedPatient.observations?.length || 0}
                                              </Badge>
                                            </CardTitle>
                                          </CardHeader>
                                          <CardContent>
                                            {selectedPatient.observations && selectedPatient.observations.length > 0 ? (
                                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {selectedPatient.observations.map((obs) => (
                                                  <div key={obs.id} className="border-l-4 border-l-green-500 bg-green-50 rounded-r-lg p-3 md:p-4 hover:bg-green-100 transition-colors">
                                                    <div className="font-medium text-sm text-gray-600 mb-1">{obs.code_display}</div>
                                                    <div className="text-2xl font-bold text-green-700 mb-1">
                                                      {obs.value_quantity_value} <span className="text-lg">{obs.value_quantity_unit}</span>
                                                    </div>
                                                    <div className="text-xs text-gray-500">
                                                      {new Date(obs.effective_datetime).toLocaleDateString('de-DE', { 
                                                        year: 'numeric', 
                                                        month: 'short', 
                                                        day: 'numeric',
                                                        hour: '2-digit',
                                                        minute: '2-digit'
                                                      })}
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            ) : (
                                              <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                                                Keine Vitalparameter vorhanden
                                              </div>
                                            )}
                                          </CardContent>
                                        </Card>

                                        {/* Medikationen Card */}
                                        <Card>
                                          <CardHeader className="pb-2 md:pb-3">
                                            <div className="flex justify-between items-center">
                                              <CardTitle className="text-base md:text-lg flex items-center gap-2">
                                                <Pill className="h-4 w-4" />
                                                Medikationen
                                                <Badge variant="secondary" className="ml-2 bg-purple-100 text-purple-700">
                                                  {selectedPatient.medications?.length || 0}
                                                </Badge>
                                              </CardTitle>
                                              <AddMedicationModal 
                                                patientId={patient.id} 
                                                onSuccess={async () => {
                                                  // Kurze Verzögerung, damit die Datenbank die Änderungen verarbeitet hat
                                                  await new Promise(resolve => setTimeout(resolve, 300));
                                                  await loadPatientDetails(patient.id);
                                                }}
                                              />
                                            </div>
                                          </CardHeader>
                                          <CardContent>
                                            {selectedPatient.medications && selectedPatient.medications.length > 0 ? (
                                              <div className="space-y-3">
                                                {selectedPatient.medications.map((med) => (
                                                  <div key={med.id} className="border-l-4 border-l-purple-500 bg-purple-50 rounded-r-lg p-4 hover:bg-purple-100 transition-colors">
                                                    <div className="font-semibold text-base mb-1">{med.medication_display}</div>
                                                    <div className="flex flex-wrap gap-3 text-sm text-gray-600 mb-2">
                                                      <span>
                                                        <span className="font-medium">Status:</span>{' '}
                                                        <Badge variant={med.status === 'active' ? 'default' : 'secondary'}>
                                                          {med.status}
                                                        </Badge>
                                                      </span>
                                                      {med.dosage_text && (
                                                        <span>
                                                          <span className="font-medium">Dosierung:</span> {med.dosage_text}
                                                        </span>
                                                      )}
                                                    </div>
                                                    <div className="text-xs text-gray-500">
                                                      {med.effective_period_start && (
                                                        <>Von: {new Date(med.effective_period_start).toLocaleDateString('de-DE')}</>
                                                      )}
                                                      {med.effective_period_end && (
                                                        <> bis {new Date(med.effective_period_end).toLocaleDateString('de-DE')}</>
                                                      )}
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            ) : (
                                              <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                                                Keine Medikationen vorhanden
                                              </div>
                                            )}
                                          </CardContent>
                                        </Card>

                                        {/* FHIR-Metadaten Card - nur anzeigen wenn synchronisiert */}
                                        {selectedPatient.fhirPatient && selectedPatient.fhirBundle && (
                                          <Card>
                                            <CardHeader className="pb-2 md:pb-3">
                                              <CardTitle className="text-base md:text-lg flex items-center gap-2">
                                                <Info className="h-4 w-4" />
                                                FHIR-Metadaten
                                              </CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                              <div className="space-y-4">
                                                {/* Bundle-Informationen */}
                                                {selectedPatient.fhirBundle && (
                                                  <div className="space-y-2">
                                                    <div className="text-sm font-semibold text-gray-700">Bundle-Informationen</div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                                      {selectedPatient.fhirBundle.id && (
                                                        <div>
                                                          <span className="text-gray-500">Bundle ID:</span>
                                                          <span className="ml-2 font-mono text-xs">{selectedPatient.fhirBundle.id}</span>
                                                        </div>
                                                      )}
                                                      {selectedPatient.fhirBundle.type && (
                                                        <div>
                                                          <span className="text-gray-500">Typ:</span>
                                                          <Badge variant="outline" className="ml-2">{selectedPatient.fhirBundle.type}</Badge>
                                                        </div>
                                                      )}
                                                      {selectedPatient.fhirBundle.total !== undefined && (
                                                        <div>
                                                          <span className="text-gray-500">Anzahl Ressourcen:</span>
                                                          <span className="ml-2 font-semibold">{selectedPatient.fhirBundle.total}</span>
                                                        </div>
                                                      )}
                                                      {selectedPatient.fhirBundle.meta?.lastUpdated && (
                                                        <div>
                                                          <span className="text-gray-500">Letzte Aktualisierung:</span>
                                                          <span className="ml-2 text-xs">
                                                            {new Date(selectedPatient.fhirBundle.meta.lastUpdated).toLocaleString('de-DE')}
                                                          </span>
                                                        </div>
                                                      )}
                                                    </div>
                                                  </div>
                                                )}

                                                {/* Patient-Metadaten */}
                                                {selectedPatient.fhirPatient.meta && (
                                                  <div className="space-y-2 pt-2 border-t">
                                                    <div className="text-sm font-semibold text-gray-700">Patient-Metadaten</div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                                      {selectedPatient.fhirPatient.meta.versionId && (
                                                        <div>
                                                          <span className="text-gray-500">Version:</span>
                                                          <span className="ml-2 font-mono text-xs">{selectedPatient.fhirPatient.meta.versionId}</span>
                                                        </div>
                                                      )}
                                                      {selectedPatient.fhirPatient.meta.lastUpdated && (
                                                        <div>
                                                          <span className="text-gray-500">Aktualisiert:</span>
                                                          <span className="ml-2 text-xs">
                                                            {new Date(selectedPatient.fhirPatient.meta.lastUpdated).toLocaleString('de-DE')}
                                                          </span>
                                                        </div>
                                                      )}
                                                      {selectedPatient.fhirPatient.meta.source && (
                                                        <div className="col-span-1 md:col-span-2">
                                                          <span className="text-gray-500">Quelle:</span>
                                                          <span className="ml-2 font-mono text-xs">{selectedPatient.fhirPatient.meta.source}</span>
                                                        </div>
                                                      )}
                                                    </div>
                                                  </div>
                                                )}

                                                {/* Identifier */}
                                                {selectedPatient.fhirPatient.identifier && selectedPatient.fhirPatient.identifier.length > 0 && (
                                                  <div className="space-y-2 pt-2 border-t">
                                                    <div className="text-sm font-semibold text-gray-700">Identifier</div>
                                                    <div className="space-y-1">
                                                      {selectedPatient.fhirPatient.identifier.map((ident: any, idx: number) => (
                                                        <div key={idx} className="flex items-center gap-2 text-sm">
                                                          <Badge variant="outline" className="text-xs">
                                                            {ident.system || 'Unbekanntes System'}
                                                          </Badge>
                                                          <span className="font-mono">{ident.value}</span>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  </div>
                                                )}

                                                {/* Tags */}
                                                {selectedPatient.fhirPatient.meta?.tag && selectedPatient.fhirPatient.meta.tag.length > 0 && (
                                                  <div className="space-y-2 pt-2 border-t">
                                                    <div className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                                                      <Tag className="h-3 w-3" />
                                                      Tags
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                      {selectedPatient.fhirPatient.meta.tag.map((tag: any, idx: number) => (
                                                        <Badge key={idx} variant="secondary" className="text-xs">
                                                          {tag.system && (
                                                            <span className="font-mono text-[10px] mr-1">{tag.system}</span>
                                                          )}
                                                          {tag.code}
                                                          {tag.display && (
                                                            <span className="ml-1">({tag.display})</span>
                                                          )}
                                                        </Badge>
                                                      ))}
                                                    </div>
                                                  </div>
                                                )}

                                                {/* Bundle Entry Details */}
                                                {selectedPatient.fhirBundle?.entry && selectedPatient.fhirBundle.entry.length > 0 && (
                                                  <div className="space-y-2 pt-2 border-t">
                                                    <div className="text-sm font-semibold text-gray-700">Ressourcen im Bundle</div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                                                      {['Patient', 'Condition', 'Observation', 'MedicationStatement', 'Procedure'].map((resourceType) => {
                                                        const count = selectedPatient.fhirBundle.entry.filter((e: any) => 
                                                          e.resource?.resourceType === resourceType
                                                        ).length;
                                                        if (count === 0) return null;
                                                        return (
                                                          <div key={resourceType} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                                            <span className="font-medium">{resourceType}</span>
                                                            <Badge variant="secondary">{count}</Badge>
                                                          </div>
                                                        );
                                                      })}
                                                    </div>
                                                  </div>
                                                )}
                                              </div>
                                            </CardContent>
                                          </Card>
                                        )}
                                      </div>
                                    )}
                                  </DialogContent>
                                </Dialog>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </main>
      </div>

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Patient löschen</DialogTitle>
            <DialogDescription>
              Möchten Sie den Patient "{patientToDelete?.name}" wirklich löschen?
              Diese Aktion kann nicht rückgängig gemacht werden. Der Patient wird nur aus der lokalen Datenbank gelöscht, nicht vom FHIR-Server.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteModalOpen(false);
                setPatientToDelete(null);
              }}
              disabled={deleting}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? 'Lösche...' : 'Löschen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
