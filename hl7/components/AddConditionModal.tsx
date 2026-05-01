'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';

interface AddConditionModalProps {
  patientId: string;
  onSuccess?: () => void;
}

export function AddConditionModal({ patientId, onSuccess }: AddConditionModalProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [condition, setCondition] = useState({
    code_value: '',
    code_display: '',
    code_system: 'http://fhir.de/CodeSystem/bfarm/icd-10-gm',
    clinical_status_code: 'active',
    verification_status_code: 'confirmed',
    severity_code: '',
    severity_display: '',
    body_site_code: '',
    body_site_display: '',
    category_code: '',
    category_display: '',
    onset_datetime: '',
    abatement_datetime: '',
    note_text: '',
  });
  const { showSuccess, showError } = useToast();

  const handleSubmit = async () => {
    if (!condition.code_value || !condition.code_display) {
      showError('Code-Wert und Code-Display sind erforderlich');
      return;
    }

    setCreating(true);
    try {
      const response = await fetch(`/api/patients/${patientId}/conditions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...condition,
          onset_datetime: condition.onset_datetime || null,
          abatement_datetime: condition.abatement_datetime || null,
          severity_code: condition.severity_code || null,
          severity_display: condition.severity_display || null,
          body_site_code: condition.body_site_code || null,
          body_site_display: condition.body_site_display || null,
          category_code: condition.category_code || null,
          category_display: condition.category_display || null,
          note_text: condition.note_text || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        showError(`Fehler: ${data.error || 'Unbekannter Fehler'}`);
        setCreating(false);
        return;
      }

      showSuccess('Diagnose erfolgreich hinzugefügt');
      setCondition({
        code_value: '',
        code_display: '',
        code_system: 'http://fhir.de/CodeSystem/bfarm/icd-10-gm',
        clinical_status_code: 'active',
        verification_status_code: 'confirmed',
        severity_code: '',
        severity_display: '',
        body_site_code: '',
        body_site_display: '',
        category_code: '',
        category_display: '',
        onset_datetime: '',
        abatement_datetime: '',
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
          Diagnose hinzufügen
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Neue Diagnose hinzufügen</DialogTitle>
          <DialogDescription>
            Fügen Sie eine neue Diagnose (Condition) für diesen Patienten hinzu.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">ICD-10 Code *</label>
              <Input
                placeholder="z.B. E11.9"
                value={condition.code_value}
                onChange={(e) => setCondition({ ...condition, code_value: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Code-System</label>
              <Input
                value={condition.code_system}
                onChange={(e) => setCondition({ ...condition, code_system: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Diagnose (Display) *</label>
            <Input
              placeholder="z.B. Diabetes mellitus Typ 2"
              value={condition.code_display}
              onChange={(e) => setCondition({ ...condition, code_display: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Klinischer Status</label>
              <Select
                value={condition.clinical_status_code}
                onValueChange={(value) => setCondition({ ...condition, clinical_status_code: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Aktiv</SelectItem>
                  <SelectItem value="resolved">Behoben</SelectItem>
                  <SelectItem value="inactive">Inaktiv</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Verifizierungsstatus</label>
              <Select
                value={condition.verification_status_code}
                onValueChange={(value) => setCondition({ ...condition, verification_status_code: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmed">Bestätigt</SelectItem>
                  <SelectItem value="provisional">Vorläufig</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Schweregrad Code</label>
              <Input
                placeholder="z.B. moderate"
                value={condition.severity_code}
                onChange={(e) => setCondition({ ...condition, severity_code: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Schweregrad Display</label>
              <Input
                placeholder="z.B. Moderate"
                value={condition.severity_display}
                onChange={(e) => setCondition({ ...condition, severity_display: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Beginn (Onset)</label>
              <Input
                type="datetime-local"
                value={condition.onset_datetime}
                onChange={(e) => setCondition({ ...condition, onset_datetime: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Ende (Abatement)</label>
              <Input
                type="datetime-local"
                value={condition.abatement_datetime}
                onChange={(e) => setCondition({ ...condition, abatement_datetime: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Notiz</label>
            <textarea
              className="w-full p-2 border rounded"
              rows={3}
              placeholder="Zusätzliche Notizen zur Diagnose"
              value={condition.note_text}
              onChange={(e) => setCondition({ ...condition, note_text: e.target.value })}
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
