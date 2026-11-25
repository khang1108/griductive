import React, { useEffect } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Info,
  RotateCw,
  X,
} from "lucide-react";
import type { BannerType, VerdictAssessmentType } from "../../types";

export interface BannerProps {
  message: string | null;
  type: BannerType;
  assessment?: VerdictAssessmentType | null;
  onClose: () => void;
  onRetry?: () => void;
  retryLabel?: string;
  isRetrying?: boolean;
}

const TOAST_STYLES: Record<
  Exclude<BannerType, null>,
  {
    border: string;
    icon: string;
    retryBtn: string;
  }
> = {
  success: {
    border: "border-[#548D80]/55 text-[#D8F5EC]",
    icon: "text-[#8CE0CE]",
    retryBtn: "bg-[#1E5D50] hover:bg-[#246E5F] border-[#548D80] text-[#F4ECDD]",
  },
  warning: {
    border: "border-[#E5BC74]/55 text-[#F6E2B8]",
    icon: "text-[#E5BC74]",
    retryBtn: "bg-[#4A381B] hover:bg-[#5E4823] border-[#E5BC74]/70 text-[#F4ECDD]",
  },
  error: {
    border: "border-[#AD5147]/70 text-[#F7C8C3]",
    icon: "text-[#E88B81]",
    retryBtn: "bg-[#8F2B22] hover:bg-[#A6352B] border-[#E88B81]/70 text-[#F4ECDD]",
  },
  info: {
    border: "border-[#D1A45D]/35 text-[#F4ECDD]",
    icon: "text-[#E5BC74]",
    retryBtn: "bg-[#2C241C] hover:bg-[#3A3026] border-[#D1A45D]/50 text-[#F4ECDD]",
  },
};

function renderIcon(type: Exclude<BannerType, null>, className: string) {
  switch (type) {
    case "success":
      return <CheckCircle2 className={`w-4 h-4 shrink-0 ${className}`} aria-hidden="true" />;
    case "warning":
      return <AlertTriangle className={`w-4 h-4 shrink-0 ${className}`} aria-hidden="true" />;
    case "error":
      return <AlertOctagon className={`w-4 h-4 shrink-0 ${className}`} aria-hidden="true" />;
    case "info":
    default:
      return <Info className={`w-4 h-4 shrink-0 ${className}`} aria-hidden="true" />;
  }
}

export const Banner: React.FC<BannerProps> = ({
  message,
  type,
  onClose,
  onRetry,
  retryLabel = "Retry",
  isRetrying = false,
}) => {
  // Auto-dismiss transient info/success notifications so HUD stays quiet and uncluttered
  useEffect(() => {
    if (!message || onRetry) return;
    if (type !== "info" && type !== "success") return;
    const timer = window.setTimeout(() => {
      onClose();
    }, 3400);
    return () => window.clearTimeout(timer);
  }, [message, type, onRetry, onClose]);

  if (!message) return null;

  const resolvedType: Exclude<BannerType, null> = type ?? "info";
  const styles = TOAST_STYLES[resolvedType];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`animate-toast-in fixed top-16 left-1/2 -translate-x-1/2 z-40 max-w-[min(92vw,480px)] hud-glass rounded-full border pl-3.5 pr-2 py-1.5 text-xs font-medium flex items-center gap-2.5 select-none ${styles.border}`}
    >
      {renderIcon(resolvedType, styles.icon)}
      <span className="leading-snug truncate max-w-[72vw] sm:max-w-[360px]" title={message}>
        {message}
      </span>

      <div className="flex items-center gap-1 shrink-0">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={isRetrying}
            className={`btn-tactile inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-semibold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${styles.retryBtn}`}
          >
            <RotateCw
              className={`w-3 h-3 ${isRetrying ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            <span>{isRetrying ? "Retrying…" : retryLabel}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss notification"
          className="btn-tactile inline-flex items-center justify-center w-6 h-6 rounded-full text-[#C8B9A1] hover:text-[#F4ECDD] hover:bg-white/10 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
