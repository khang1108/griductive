import React from "react";

export interface WebGLErrorBoundaryProps {
  children: React.ReactNode;
  onError?: (error: Error) => void;
  fallback?: React.ReactNode;
  resetKey?: string | number;
}

interface WebGLErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Checks whether the current browser environment can initialize a WebGL context
 * without throwing when hardware acceleration or WebGL is unavailable.
 */
export function isWebGLAvailable(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl");
    return Boolean(gl);
  } catch {
    return false;
  }
}

export interface WebGLContextHandlers {
  onContextLost: () => void;
  onContextRestored?: () => void;
}

/**
 * Attaches webglcontextlost and webglcontextrestored listeners to a WebGL canvas
 * and returns a cleanup callback.
 */
export function attachWebGLContextListeners(
  canvas: HTMLCanvasElement,
  handlers: WebGLContextHandlers
): () => void {
  const handleContextLost = (event: Event) => {
    event.preventDefault();
    handlers.onContextLost();
  };

  const handleContextRestored = () => {
    handlers.onContextRestored?.();
  };

  canvas.addEventListener("webglcontextlost", handleContextLost, false);
  canvas.addEventListener("webglcontextrestored", handleContextRestored, false);

  return () => {
    canvas.removeEventListener("webglcontextlost", handleContextLost, false);
    canvas.removeEventListener(
      "webglcontextrestored",
      handleContextRestored,
      false
    );
  };
}

/**
 * React ErrorBoundary isolating Three.js / Canvas runtime failures so
 * InvestigationScene can fall back cleanly to Flat DOM mode without losing state.
 */
export class WebGLErrorBoundary extends React.Component<
  WebGLErrorBoundaryProps,
  WebGLErrorBoundaryState
> {
  constructor(props: WebGLErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): WebGLErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.warn("WebGL scene error caught by WebGLErrorBoundary:", error, info);
    this.props.onError?.(error);
  }

  override componentDidUpdate(prevProps: WebGLErrorBoundaryProps): void {
    if (
      this.state.hasError &&
      this.props.resetKey !== undefined &&
      this.props.resetKey !== prevProps.resetKey
    ) {
      this.setState({ hasError: false, error: null });
    }
  }

  override render(): React.ReactNode {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
