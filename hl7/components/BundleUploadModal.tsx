'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ToastContainer } from '@/components/ui/toast';
import { useToast } from '@/hooks/useToast';
import { Upload, Download } from 'lucide-react';

interface BundleUploadModalProps {
  onSuccess?: () => void;
}

export function BundleUploadModal({ onSuccess }: BundleUploadModalProps) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [bundleId, setBundleId] = useState('');
  const { toasts, removeToast, showSuccess, showError } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      showError('Please select a file');
      return;
    }

    setUploading(true);
    try {
      const text = await file.text();
      let bundle;
      
      try {
        bundle = JSON.parse(text);
      } catch (parseError) {
        showError('Invalid JSON format');
        setUploading(false);
        return;
      }

      if (!bundle.resourceType || bundle.resourceType !== 'Bundle') {
        showError('File must be a FHIR Bundle (resourceType: "Bundle")');
        setUploading(false);
        return;
      }

      // Convert to transaction bundle if needed
      if (bundle.type !== 'transaction' && bundle.type !== 'batch') {
        bundle = {
          resourceType: 'Bundle',
          type: 'transaction',
          entry: (bundle.entry || []).map((entry: any) => {
            const resource = entry.resource;
            if (!resource) return null;
            const method = resource.id ? 'PUT' : 'POST';
            const resourceType = resource.resourceType;
            const url = resource.id ? `${resourceType}/${resource.id}` : resourceType;
            return {
              resource: resource,
              request: { method, url }
            };
          }).filter((entry: any) => entry !== null)
        };
      }

      const response = await fetch('/api/fhir/bundle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bundle),
      });

      const data = await response.json().catch(() => ({ error: 'Unknown error' }));

      if (!response.ok) {
        showError(`Error: ${data?.error || response.statusText}`);
        setUploading(false);
        return;
      }

      const results = data.results || {};
      const summary = [
        `${results.patientsProcessed || 0} Patients`,
        `${results.conditionsProcessed || 0} Conditions`,
        `${results.observationsProcessed || 0} Observations`,
        `${results.medicationStatementsProcessed || 0} Medications`,
        `${results.proceduresProcessed || 0} Procedures`
      ].join(', ');

      showSuccess(`Bundle imported successfully! ${summary}`);
      setFile(null);
      setOpen(false);
      
      if (onSuccess) onSuccess();
      window.location.reload();
    } catch (error: any) {
      showError(`Error: ${error.message || 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleImportFromServer = async () => {
    if (!bundleId) {
      showError('Please enter a Bundle ID');
      return;
    }

    setUploading(true);
    try {
      const response = await fetch(`/api/fhir/bundle/fetch?bundleId=${encodeURIComponent(bundleId)}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        showError(`Error fetching bundle: ${errorData.error || response.statusText}`);
        setUploading(false);
        return;
      }

      const bundle = await response.json();

      if (!bundle.resourceType || bundle.resourceType !== 'Bundle') {
        showError('Response must be a FHIR Bundle');
        setUploading(false);
        return;
      }

      // Convert to transaction bundle if needed
      let transactionBundle = bundle;
      if (bundle.type !== 'transaction' && bundle.type !== 'batch') {
        transactionBundle = {
          resourceType: 'Bundle',
          type: 'transaction',
          entry: (bundle.entry || []).map((entry: any) => {
            const resource = entry.resource;
            if (!resource) return null;
            const method = resource.id ? 'PUT' : 'POST';
            const resourceType = resource.resourceType;
            const url = resource.id ? `${resourceType}/${resource.id}` : resourceType;
            return {
              resource: resource,
              request: { method, url }
            };
          }).filter((entry: any) => entry !== null)
        };
      }

      const importResponse = await fetch('/api/fhir/bundle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transactionBundle),
      });

      const data = await importResponse.json().catch(() => ({ error: 'Unknown error' }));

      if (!importResponse.ok) {
        showError(`Error: ${data?.error || importResponse.statusText}`);
        setUploading(false);
        return;
      }

      const results = data.results || {};
      const summary = [
        `${results.patientsProcessed || 0} Patients`,
        `${results.conditionsProcessed || 0} Conditions`,
        `${results.observationsProcessed || 0} Observations`,
        `${results.medicationStatementsProcessed || 0} Medications`,
        `${results.proceduresProcessed || 0} Procedures`
      ].join(', ');

      showSuccess(`Bundle imported successfully! ${summary}`);
      setBundleId('');
      setOpen(false);
      
      if (onSuccess) onSuccess();
      window.location.reload();
    } catch (error: any) {
      showError(`Error: ${error.message || 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <ToastContainer toasts={toasts} onClose={removeToast} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="bg-teal-50 hover:bg-teal-100 text-teal-700 border-teal-200">
            <Upload className="h-4 w-4 mr-2" />
            Import Bundle
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import FHIR Bundle</DialogTitle>
            <DialogDescription>
              Upload a JSON file or import from server. All resources will be saved to the database.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* File Upload */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Upload JSON File</label>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleFileChange}
                className="w-full p-2 border rounded"
                disabled={uploading}
              />
              {file && (
                <p className="text-sm text-gray-500">
                  Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
                </p>
              )}
              <Button 
                onClick={handleUpload} 
                disabled={uploading || !file} 
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                {uploading ? 'Importing...' : 'Import File'}
              </Button>
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or</span>
              </div>
            </div>

            {/* Server Import */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Import from Server</label>
              <Input
                placeholder="Bundle ID or URL (e.g., 12345)"
                value={bundleId}
                onChange={(e) => setBundleId(e.target.value)}
                disabled={uploading}
              />
              <Button 
                onClick={handleImportFromServer} 
                disabled={uploading || !bundleId} 
                className="w-full"
                variant="outline"
              >
                <Download className="h-4 w-4 mr-2" />
                {uploading ? 'Importing...' : 'Import from Server'}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setOpen(false);
                setFile(null);
                setBundleId('');
              }} 
              disabled={uploading}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
