'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';

interface AddMedicationModalProps {
  patientId: string;
  onSuccess?: () => void;
}

export function AddMedicationModal({ patientId, onSuccess }: AddMedicationModalProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [medication, setMedication] = useState({
    medication_code: '',
    medication_display: '',
    medication_system: 'http://www.whocc.no/atc',
    status: 'active',
    effective_period_start: '',
    effective_period_end: '',
    dosage_text: '',
    dosage_route_code: '',
    dosage_route_display: '',
    note_text: '',
  });
  const { showSuccess, showError } = useToast();

  const handleSubmit = async () => {
    if (!medication.medication_code || !medication.medication_display) {
      showError('Medikations-Code und Display sind erforderlich');
      return;
    }

    setCreating(true);
    try {
      const response = await fetch(`/api/patients/${patientId}/medications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...medication,
          effective_period_start: medication.effective_period_start || null,
          effective_period_end: medication.effective_period_end || null,
          dosage_text: medication.dosage_text || null,
          dosage_route_code: medication.dosage_route_code || null,
          dosage_route_display: medication.dosage_route_display || null,
          note_text: medication.note_text || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        showError(`Fehler: ${data.error || 'Unbekannter Fehler'}`);
        setCreating(false);
        return;
      }

      showSuccess('Medikation erfolgreich hinzugefügt');
      setMedication({
        medication_code: '',
        medication_display: '',
        medication_system: 'http://www.whocc.no/atc',
        status: 'active',
        effective_period_start: '',
        effective_period_end: '',
        dosage_text: '',
        dosage_route_code: '',
        dosage_route_display: '',
        note_text: '',
      });
      setOpen(false);

      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      showError(`Fehler: ${error.message || 'Unbekannter Fehler'}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Medikation hinzufügen
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Neue Medikation hinzufügen</DialogTitle>
          <DialogDescription>
            Fügen Sie eine neue Medikation (MedicationStatement) für diesen Patienten hinzu.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">ATC-Code *</label>
              <Input
                placeholder="z.B. M01AE01"
                value={medication.medication_code}
                onChange={(e) => setMedication({ ...medication, medication_code: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Code-System</label>
              <Input
                value={medication.medication_system}
                onChange={(e) => setMedication({ ...medication, medication_system: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Medikament (Display) *</label>
            <Input
              placeholder="z.B. Ibuprofen"
              value={medication.medication_display}
              onChange={(e) => setMedication({ ...medication, medication_display: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <Select
              value={medication.status}
              onValueChange={(value) => setMedication({ ...medication, status: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Aktiv</SelectItem>
                <SelectItem value="completed">Abgeschlossen</SelectItem>
                <SelectItem value="stopped">Gestoppt</SelectItem>
                <SelectItem value="on-hold">Pausiert</SelectItem>
                <SelectItem value="cancelled">Abgebrochen</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Startdatum</label>
              <Input
                type="datetime-local"
                value={medication.effective_period_start}
                onChange={(e) => setMedication({ ...medication, effective_period_start: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Enddatum</label>
              <Input
                type="datetime-local"
                value={medication.effective_period_end}
                onChange={(e) => setMedication({ ...medication, effective_period_end: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Dosierung</label>
            <Input
              placeholder="z.B. 2x pro Tag"
              value={medication.dosage_text}
              onChange={(e) => setMedication({ ...medication, dosage_text: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Verabreichungsweg Code</label>
              <Input
                placeholder="z.B. oral"
                value={medication.dosage_route_code}
                onChange={(e) => setMedication({ ...medication, dosage_route_code: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Verabreichungsweg Display</label>
              <Input
                placeholder="z.B. Oral"
                value={medication.dosage_route_display}
                onChange={(e) => setMedication({ ...medication, dosage_route_display: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Notiz</label>
            <textarea
              className="w-full p-2 border rounded"
              rows={3}
              placeholder="Zusätzliche Notizen zur Medikation"
              value={medication.note_text}
              onChange={(e) => setMedication({ ...medication, note_text: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={creating}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={creating}>
            {creating ? 'Erstellt...' : 'Erstellen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
