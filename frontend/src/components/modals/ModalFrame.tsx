import React, { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const nodes = Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  );
  return nodes.filter((el) => {
    if (el.hasAttribute("disabled") || el.getAttribute("aria-hidden") === "true") {
      return false;
    }
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  });
}

export interface ModalFrameProps {
  isOpen: boolean;
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  variant?: "center" | "sheet" | "drawer";
  closeOnBackdropClick?: boolean;
  restoreFocusOnClose?: boolean;
  containerClassName?: string;
  backdropClassName?: string;
  children: React.ReactNode;
}

export const ModalFrame: React.FC<ModalFrameProps> = ({
  isOpen,
  onClose,
  labelledBy,
  describedBy,
  variant = "center",
  closeOnBackdropClick = true,
  restoreFocusOnClose = true,
  containerClassName = "",
  backdropClassName = "",
  children,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen || typeof document === "undefined") return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const container = containerRef.current;
    if (!container) return;

    const focusTimer = window.requestAnimationFrame(() => {
      if (!containerRef.current) return;
      const focusables = getFocusableElements(containerRef.current);
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        containerRef.current.focus();
      }
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      const activeContainer = containerRef.current;
      if (!activeContainer) return;

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key === "Tab") {
        const focusables = getFocusableElements(activeContainer);
        if (focusables.length === 0) {
          event.preventDefault();
          activeContainer.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;

        if (event.shiftKey) {
          if (
            active === first ||
            !(active instanceof Node) ||
            !activeContainer.contains(active)
          ) {
            event.preventDefault();
            last.focus();
          }
        } else if (
          active === last ||
          !(active instanceof Node) ||
          !activeContainer.contains(active)
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.cancelAnimationFrame(focusTimer);
      document.removeEventListener("keydown", handleKeyDown, true);

      if (restoreFocusOnClose) {
        const prev = previousFocusRef.current;
        const active = document.activeElement;
        const focusStillInsideOrBody =
          active === null ||
          active === document.body ||
          (containerRef.current &&
            active instanceof Node &&
            containerRef.current.contains(active));
        if (focusStillInsideOrBody && prev && prev.isConnected) {
          prev.focus();
        }
      }
    };
  }, [isOpen, restoreFocusOnClose]);

  if (!isOpen) return null;

  const layoutClass =
    variant === "sheet"
      ? "items-end sm:items-center justify-center p-0 sm:p-4"
      : variant === "drawer"
        ? "items-end md:items-stretch justify-center md:justify-end p-0"
        : "items-center justify-center p-4";

  return (
    <div
      className={`fixed inset-0 z-50 flex bg-black/75 backdrop-blur-[2px] ${layoutClass} ${backdropClassName}`}
      onMouseDown={(e) => {
        if (closeOnBackdropClick && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={`outline-none ${containerClassName}`}
      >
        {children}
      </div>
    </div>
  );
};
