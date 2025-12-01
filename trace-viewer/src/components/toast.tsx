"use client";

import { useEffect } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
}

export default function Toast({ message, type, onClose, duration = 1500 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const icons = {
    success: <CheckCircle size={20} />,
    error: <AlertCircle size={20} />,
    info: <Info size={20} />,
  };

  const styles = {
    success: 'bg-green-500 text-white',
    error: 'bg-red-500 text-white',
    info: 'bg-blue-500 text-white',
  };

  return (
    <div className="fixed top-4 right-4 z-[100] animate-slideInRight">
      <div className={`${styles[type]} px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 min-w-[300px] max-w-md`}>
        {icons[type]}
        <span className="flex-1 font-medium">{message}</span>
        <button onClick={onClose} className="hover:opacity-80 transition-opacity">
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
