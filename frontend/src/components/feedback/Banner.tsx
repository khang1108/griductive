import React from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

interface BannerProps {
  message: string | null;
  type: "success" | "error" | "info" | null;
  onClose: () => void;
}

export const Banner: React.FC<BannerProps> = ({ message, type, onClose }) => {
  if (!message) return null;

  const getStyle = () => {
    switch (type) {
      case "success":
        return "bg-emerald-950/60 border-emerald-500/40 text-emerald-300";
      case "error":
        return "bg-red-950/60 border-red-500/40 text-red-300";
      default:
        return "bg-amber-950/40 border-amber-500/30 text-amber-200";
    }
  };

  const getIcon = () => {
    switch (type) {
      case "success":
        return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
      case "error":
        return <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />;
      default:
        return <Info className="w-4 h-4 text-amber-400 shrink-0" />;
    }
  };

  return (
    <div
      className={`border-b px-5 py-2 text-xs font-semibold flex items-center justify-between gap-3 transition-all duration-300 animate-in fade-in slide-in-from-top-1 ${getStyle()}`}
    >
      <div className="flex items-center gap-2.5">
        {getIcon()}
        <span>{message}</span>
      </div>
      <button
        onClick={onClose}
        className="opacity-60 hover:opacity-100 transition-opacity p-0.5"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

