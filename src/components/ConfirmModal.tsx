import React from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Konfirmasi',
  cancelText = 'Batal',
  variant = 'primary',
  loading = false
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center",
              variant === 'danger' ? "bg-red-100 text-red-600" : "bg-indigo-100 text-indigo-600"
            )}>
              <AlertTriangle size={20} />
            </div>
            <h2 className="text-xl font-bold text-slate-800">{title}</h2>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6">
          <p className="text-slate-600 leading-relaxed">{message}</p>
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
            }}
            disabled={loading}
            className={cn(
              "px-4 py-2 text-sm font-bold text-white rounded-xl transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed",
              variant === 'danger' 
                ? "bg-red-600 hover:bg-red-700 shadow-red-200" 
                : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200"
            )}
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
