import React from 'react';
import { X } from 'lucide-react';

interface ToastProps {
    id: string;
    type: 'success' | 'error' | 'info';
    message: string;
    onClose: () => void;
}

export function Toast({ id, type, message, onClose }: ToastProps) {
    React.useEffect(() => {
        const timer = setTimeout(onClose, 4000);
        return () => clearTimeout(timer);
    }, [onClose]);

    const bgColor = {
        success: 'bg-green-50 border-green-200',
        error: 'bg-red-50 border-red-200',
        info: 'bg-blue-50 border-blue-200',
    }[type];

    const textColor = {
        success: 'text-green-800',
        error: 'text-red-800',
        info: 'text-blue-800',
    }[type];

    const borderColor = {
        success: 'border-l-4 border-l-green-500',
        error: 'border-l-4 border-l-red-500',
        info: 'border-l-4 border-l-blue-500',
    }[type];

    const icon = {
        success: '✅',
        error: '❌',
        info: 'ℹ️',
    }[type];

    return (
        <div
            className={`${bgColor} ${borderColor} p-4 rounded-lg shadow-md flex items-center justify-between gap-4 animate-in slide-in-from-right duration-300`}
            role="alert"
        >
            <div className="flex items-center gap-3 flex-1">
                <span className="text-xl">{icon}</span>
                <p className={`${textColor} font-medium text-sm`}>{message}</p>
            </div>
            <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Benachrichtigung schließen"
            >
                <X size={18} />
            </button>
        </div>
    );
}

export function ToastContainer({
    toasts,
    onClose,
}: {
    toasts: Array<{ id: string; type: 'success' | 'error' | 'info'; message: string }>;
    onClose: (id: string) => void;
}) {
    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md pointer-events-none">
            {toasts.map((toast) => (
                <div key={toast.id} className="pointer-events-auto">
                    <Toast
                        id={toast.id}
                        type={toast.type}
                        message={toast.message}
                        onClose={() => onClose(toast.id)}
                    />
                </div>
            ))}
        </div>
    );
}
