import React, {
  Suspense,
  useCallback,
  useEffect,
  useInsertionEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useFrame, type RootState } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import {
  getBoardWorldBounds,
  type BoardLayoutMetrics,
} from "../../layout/boardLayout";
import type { CameraMode, QualityMode } from "../../types";
import { CAMERA_FOV_DEG, CameraRig } from "./CameraRig";
import {
  BOARD_ANCHOR_Y,
  DeskBackdrop,
  DeskProps,
  getScenePropLayout,
  preloadDeskModels,
  TABLE_TOP_Y,
} from "./DeskProps";
import { LightingAndAtmosphere } from "./LightingAndAtmosphere";
import {
  attachWebGLContextListeners,
  isWebGLAvailable,
  WebGLErrorBoundary,
} from "./WebGLErrorBoundary";

export interface InvestigationSceneProps {
  boardLayout: BoardLayoutMetrics;
  quality: QualityMode;
  cameraMode: CameraMode;
  horizontalBiasNormalized?: number;
  inspectWorldOffset?: [number, number] | null;
  isPaused: boolean;
  reducedMotion: boolean;
  children: React.ReactNode;
}

const CANVAS_CAMERA_CONFIG = {
  fov: CAMERA_FOV_DEG,
  near: 0.1,
  far: 20,
} as const;
const CANVAS_RESIZE_CONFIG = {
  scroll: false,
  debounce: { scroll: 0, resize: 0 },
} as const;
const CANVAS_GL_CONFIG = {
  antialias: true,
  powerPreference: "high-performance" as const,
  alpha: false,
};
const CANVAS_DPR_HIGH: [number, number] = [1, 2];
const CANVAS_DPR_STD: [number, number] = [1, 1.5];

/**
 * Keeps Drei <Html transform>'s outer 3D wrapper width/height synchronously matched
 * to `el` inside the same R3F frame, preventing Chromium perspective-origin vs
 * transform-origin mismatch before React 19's async secondary root commits.
 */
function HtmlTransformSync({
  portalRef,
}: {
  portalRef: React.RefObject<HTMLDivElement | null>;
}) {
  useFrame(({ size }) => {
    const el = portalRef.current?.firstElementChild as HTMLElement | null;
    const outer = el?.firstElementChild as HTMLElement | null;
    if (outer) {
      const w = `${size.width}px`;
      const h = `${size.height}px`;
      if (outer.style.width !== w) outer.style.width = w;
      if (outer.style.height !== h) outer.style.height = h;
    }
  });
  return null;
}

/**
 * Full-bleed 3D Midnight Archive scene orchestrator.
 * Commits 100% to the live Three.js detective study with zero 2D mode toggles,
 * retaining WebGLErrorBoundary strictly as a silent crash-safety net.
 */
export function InvestigationScene({
  boardLayout,
  quality,
  cameraMode,
  horizontalBiasNormalized = 0,
  inspectWorldOffset = null,
  isPaused,
  reducedMotion,
  children,
}: InvestigationSceneProps) {
  const [webglRetryCount, setWebglRetryCount] = useState(0);
  const [webglRuntimeFailed, setWebglRuntimeFailed] = useState(false);
  const contextCleanupRef = useRef<(() => void) | null>(null);
  const htmlPortalRef = useRef<HTMLDivElement>(null);
  const active3DRef = useRef(false);

  const webglSupported = useMemo(
    () => isWebGLAvailable(),
    [webglRetryCount]
  );
  const webglUnavailable = !webglSupported || webglRuntimeFailed;

  useInsertionEffect(() => {
    active3DRef.current = !webglUnavailable;
    return () => {
      active3DRef.current = false;
      contextCleanupRef.current?.();
      contextCleanupRef.current = null;
    };
  }, [webglUnavailable]);

  const boardBounds = useMemo(
    () => getBoardWorldBounds(boardLayout),
    [boardLayout]
  );

  const propLayout = useMemo(
    () => getScenePropLayout(boardBounds),
    [boardBounds]
  );

  const htmlScale = boardBounds.worldPerPx * 40;

  useEffect(() => {
    if (!webglUnavailable) {
      preloadDeskModels();
    }
  }, [webglUnavailable]);

  useEffect(() => {
    return () => {
      contextCleanupRef.current?.();
      contextCleanupRef.current = null;
    };
  }, []);

  const handleCanvasCreated = useCallback((state: RootState) => {
    contextCleanupRef.current?.();
    state.gl.setClearColor("#120f0d", 1);
    const canvas = state.gl.domElement;
    contextCleanupRef.current = attachWebGLContextListeners(canvas, {
      onContextLost: () => {
        if (!active3DRef.current || !canvas.isConnected) return;
        setWebglRuntimeFailed(true);
      },
      onContextRestored: () => {
        if (!active3DRef.current || !canvas.isConnected) return;
        setWebglRuntimeFailed(false);
        setWebglRetryCount((count) => count + 1);
      },
    });
  }, []);

  const handleWebGLError = useCallback(() => {
    setWebglRuntimeFailed(true);
  }, []);

  // Silent emergency safety fallback only if WebGL hardware/software context crashes
  if (webglUnavailable) {
    return (
      <div className="relative w-full h-full isolate z-0 overflow-auto flex p-4 bg-[#14110e]">
        <div className="m-auto relative rounded-xl p-2 bg-[#1c1613] ring-1 ring-[#3d2d23] shadow-2xl">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full isolate z-0 overflow-hidden bg-[#120f0d]">
      <WebGLErrorBoundary
        resetKey={webglRetryCount}
        onError={handleWebGLError}
      >
        <Canvas
          shadows="percentage"
          camera={CANVAS_CAMERA_CONFIG}
          dpr={quality === "high" ? CANVAS_DPR_HIGH : CANVAS_DPR_STD}
          resize={CANVAS_RESIZE_CONFIG}
          frameloop={reducedMotion || isPaused ? "demand" : "always"}
          gl={CANVAS_GL_CONFIG}
          style={{ width: "100%", height: "100%" }}
          onCreated={handleCanvasCreated}
        >
          <CameraRig
            boardBounds={boardBounds}
            boardLayoutKey={`${boardLayout.totalWidth}x${boardLayout.totalHeight}`}
            cameraMode={cameraMode}
            horizontalBiasNormalized={horizontalBiasNormalized}
            inspectWorldOffset={inspectWorldOffset}
            reducedMotion={reducedMotion}
            isPaused={isPaused}
          />

          <LightingAndAtmosphere
            quality={quality}
            reducedMotion={reducedMotion}
            isPaused={isPaused}
            lampHeadPosition={propLayout.lampHeadPos}
            lampTarget={[0.02, TABLE_TOP_Y, 0.02]}
          />

          <DeskBackdrop
            boardBounds={boardBounds}
            reducedMotion={reducedMotion}
            isPaused={isPaused}
          />

          <Suspense fallback={null}>
            <DeskProps boardBounds={boardBounds} />
          </Suspense>

          <Html
            transform
            portal={htmlPortalRef as React.RefObject<HTMLElement>}
            position={[0, BOARD_ANCHOR_Y, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={htmlScale}
            zIndexRange={[10, 0]}
            occlude={false}
            pointerEvents="auto"
          >
            <div
              style={{
                width: `${boardLayout.totalWidth}px`,
                height: `${boardLayout.totalHeight}px`,
              }}
              className="select-none"
            >
              {children}
            </div>
          </Html>
          <HtmlTransformSync portalRef={htmlPortalRef} />
        </Canvas>
      </WebGLErrorBoundary>

      {/* Stable pre-mounted portal container above Canvas and below HUD overlays */}
      <div
        ref={htmlPortalRef}
        className="pointer-events-none absolute inset-0 overflow-hidden"
      />
    </div>
  );
}
