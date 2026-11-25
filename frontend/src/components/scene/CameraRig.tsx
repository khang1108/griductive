import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { BoardWorldBounds } from "../../layout/boardLayout";
import type { CameraMode } from "../../types";
import { BOARD_ANCHOR_Y } from "./DeskProps";

export const CAMERA_FOV_DEG = 40;
const CONVERGE_EPS_SQ = 1e-8;

interface CameraPose {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
}

interface PosePreset {
  tiltDeg: number;
  padV: number;
  padH: number;
  lateralX: number;
  targetYOffset: number;
  targetZOffset: number;
}

const POSE_PRESETS: Record<
  "introStart" | "overview" | "focus" | "caseClosed",
  PosePreset
> = {
  introStart: {
    tiltDeg: 49,
    padV: 1.64,
    padH: 1.72,
    lateralX: -0.2,
    targetYOffset: 0.03,
    targetZOffset: 0.01,
  },
  overview: {
    tiltDeg: 41,
    padV: 1.48,
    padH: 1.5,
    lateralX: -0.015,
    targetYOffset: 0.01,
    targetZOffset: 0.045,
  },
  focus: {
    tiltDeg: 41,
    padV: 1.48,
    padH: 1.5,
    lateralX: -0.015,
    targetYOffset: 0.01,
    targetZOffset: 0.045,
  },
  caseClosed: {
    tiltDeg: 45,
    padV: 1.58,
    padH: 1.64,
    lateralX: 0.06,
    targetYOffset: 0.02,
    targetZOffset: 0.025,
  },
};

function computeCameraPose(
  presetKey: keyof typeof POSE_PRESETS,
  boardBounds: BoardWorldBounds,
  aspect: number,
  horizontalWorldBias: number,
  inspectOffset: [number, number] | null,
  fovDeg: number = CAMERA_FOV_DEG
): CameraPose {
  const preset = POSE_PRESETS[presetKey];
  const tilt = THREE.MathUtils.degToRad(preset.tiltDeg);
  const vFov = THREE.MathUtils.degToRad(fovDeg);
  const tanHalfV = Math.tan(vFov / 2);
  const tanHalfH = Math.max(0.05, tanHalfV * Math.max(0.35, aspect));

  const dV =
    (boardBounds.heightWorld * Math.cos(tilt) * preset.padV) / (2 * tanHalfV) +
    boardBounds.heightWorld * 0.5 * Math.sin(tilt);
  const dH = (boardBounds.widthWorld * preset.padH) / (2 * tanHalfH);
  const baseDistance = Math.max(dV, dH, 0.95);

  const inspectX =
    presetKey === "overview" && inspectOffset ? inspectOffset[0] * 0.14 : 0;
  const inspectZ =
    presetKey === "overview" && inspectOffset ? inspectOffset[1] * 0.12 : 0;
  const distanceZoom =
    presetKey === "overview" && inspectOffset ? -0.065 : 0;
  const distance = Math.max(0.85, baseDistance + distanceZoom);

  const lookAt = new THREE.Vector3(
    horizontalWorldBias + inspectX,
    BOARD_ANCHOR_Y + preset.targetYOffset,
    preset.targetZOffset + inspectZ
  );
  const position = new THREE.Vector3(
    lookAt.x + preset.lateralX + inspectX * 0.45,
    lookAt.y + distance * Math.cos(tilt),
    lookAt.z + distance * Math.sin(tilt)
  );

  return { position, lookAt };
}

export interface CameraRigProps {
  boardBounds: BoardWorldBounds;
  boardLayoutKey?: string;
  cameraMode: CameraMode;
  horizontalBiasNormalized?: number;
  inspectWorldOffset?: [number, number] | null;
  reducedMotion: boolean;
  isPaused: boolean;
}

/**
 * PerspectiveCamera rig framing the 3D Midnight Archive desk & background room:
 * - Cinematic 25° perspective showing the desk cards, warm architect lamp, and rainy window
 * - Smooth exponential damping on intro fly-in, panel balance, suspect focus lean, and case-closed pullback
 * - Gentle micro-parallax & breathing so the 3D space feels tactile and alive
 */
export function CameraRig({
  boardBounds,
  boardLayoutKey,
  cameraMode,
  horizontalBiasNormalized = 0,
  inspectWorldOffset = null,
  reducedMotion,
  isPaused,
}: CameraRigProps) {
  const camera = useThree((state) => state.camera as THREE.PerspectiveCamera);
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);

  const aspect = size.width / Math.max(1, size.height);

  // Positive world X shifts camera right so the board appears visually centered in the open left-center area
  const horizontalWorldBias = horizontalBiasNormalized * boardBounds.widthWorld * 0.42;

  const targetPresetKey: keyof typeof POSE_PRESETS =
    cameraMode === "intro" ? "overview" : cameraMode;

  const targetPose = useMemo(
    () =>
      computeCameraPose(
        targetPresetKey,
        boardBounds,
        aspect,
        horizontalWorldBias,
        inspectWorldOffset
      ),
    [
      targetPresetKey,
      boardBounds.widthWorld,
      boardBounds.heightWorld,
      aspect,
      horizontalWorldBias,
      inspectWorldOffset?.[0],
      inspectWorldOffset?.[1],
    ]
  );

  const introStartPose = useMemo(
    () =>
      computeCameraPose(
        "introStart",
        boardBounds,
        aspect,
        horizontalWorldBias,
        null
      ),
    [
      boardBounds.widthWorld,
      boardBounds.heightWorld,
      aspect,
      horizontalWorldBias,
    ]
  );

  const currentPosRef = useRef(new THREE.Vector3());
  const currentLookAtRef = useRef(new THREE.Vector3());
  const targetPosRef = useRef(targetPose.position.clone());
  const targetLookAtRef = useRef(targetPose.lookAt.clone());
  const parallaxRef = useRef(new THREE.Vector2(0, 0));
  const finalPosScratch = useRef(new THREE.Vector3());
  const finalLookScratch = useRef(new THREE.Vector3());
  const elapsedRef = useRef(0);
  const initializedRef = useRef(false);
  const prevModeRef = useRef<CameraMode | null>(null);
  const htmlSyncFramesRef = useRef(2);

  targetPosRef.current.copy(targetPose.position);
  targetLookAtRef.current.copy(targetPose.lookAt);

  const applyCameraTransform = (pos: THREE.Vector3, lookAt: THREE.Vector3) => {
    if (!camera) return;
    if (
      camera instanceof THREE.PerspectiveCamera &&
      (camera.fov !== CAMERA_FOV_DEG || Math.abs(camera.aspect - aspect) > 1e-4)
    ) {
      camera.fov = CAMERA_FOV_DEG;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }
    camera.position.copy(pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(lookAt);
    camera.updateMatrixWorld();
  };

  useLayoutEffect(() => {
    const enteringIntro =
      cameraMode === "intro" && prevModeRef.current !== "intro";
    prevModeRef.current = cameraMode;

    if (reducedMotion) {
      currentPosRef.current.copy(targetPose.position);
      currentLookAtRef.current.copy(targetPose.lookAt);
      applyCameraTransform(currentPosRef.current, currentLookAtRef.current);
      initializedRef.current = true;
    } else if (enteringIntro) {
      currentPosRef.current.copy(introStartPose.position);
      currentLookAtRef.current.copy(introStartPose.lookAt);
      applyCameraTransform(currentPosRef.current, currentLookAtRef.current);
      initializedRef.current = true;
    } else if (!initializedRef.current) {
      currentPosRef.current.copy(targetPose.position);
      currentLookAtRef.current.copy(targetPose.lookAt);
      applyCameraTransform(currentPosRef.current, currentLookAtRef.current);
      initializedRef.current = true;
    } else {
      applyCameraTransform(currentPosRef.current, currentLookAtRef.current);
    }

    htmlSyncFramesRef.current = 4;
    invalidate();
  }, [
    camera,
    cameraMode,
    reducedMotion,
    targetPose,
    introStartPose,
    invalidate,
  ]);

  useEffect(() => {
    let raf1 = 0;
    let raf2 = 0;
    htmlSyncFramesRef.current = Math.max(htmlSyncFramesRef.current, 4);
    raf1 = requestAnimationFrame(() => {
      invalidate();
      raf2 = requestAnimationFrame(() => {
        invalidate();
      });
    });
    const t1 = setTimeout(() => {
      if (!isPaused && (typeof document === "undefined" || !document.hidden)) {
        invalidate();
      }
    }, 60);
    const t2 = setTimeout(() => {
      if (!isPaused && (typeof document === "undefined" || !document.hidden)) {
        invalidate();
      }
    }, 160);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [
    boardBounds.widthWorld,
    boardBounds.heightWorld,
    boardLayoutKey,
    cameraMode,
    horizontalBiasNormalized,
    size.width,
    size.height,
    isPaused,
    invalidate,
  ]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibility = () => {
      if (!document.hidden && !isPaused) {
        htmlSyncFramesRef.current = Math.max(htmlSyncFramesRef.current, 2);
        invalidate();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isPaused, invalidate]);

  useFrame((state, delta) => {
    const cam = state.camera as THREE.PerspectiveCamera;
    if (!cam) return;

    if (isPaused || (typeof document !== "undefined" && document.hidden)) {
      return;
    }

    if (
      cam instanceof THREE.PerspectiveCamera &&
      (cam.fov !== CAMERA_FOV_DEG || Math.abs(cam.aspect - aspect) > 1e-4)
    ) {
      cam.fov = CAMERA_FOV_DEG;
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
    }

    if (htmlSyncFramesRef.current > 0) {
      htmlSyncFramesRef.current -= 1;
      if (htmlSyncFramesRef.current > 0) {
        state.invalidate();
      }
    }

    if (reducedMotion) {
      if (
        currentPosRef.current.distanceToSquared(targetPosRef.current) >
          CONVERGE_EPS_SQ ||
        currentLookAtRef.current.distanceToSquared(targetLookAtRef.current) >
          CONVERGE_EPS_SQ
      ) {
        currentPosRef.current.copy(targetPosRef.current);
        currentLookAtRef.current.copy(targetLookAtRef.current);
        applyCameraTransform(currentPosRef.current, currentLookAtRef.current);
      }
      return;
    }

    const dt = Math.min(delta, 0.1);
    elapsedRef.current += dt;

    const lambda = cameraMode === "intro" ? 3.8 : 5.8;
    const alpha = 1 - Math.exp(-lambda * dt);

    currentPosRef.current.lerp(targetPosRef.current, alpha);
    currentLookAtRef.current.lerp(targetLookAtRef.current, alpha);

    // Subtle pointer micro-parallax + calm breathing so the 3D scene feels genuinely alive
    const pAlpha = 1 - Math.exp(-3.2 * dt);
    const targetPx = THREE.MathUtils.clamp(state.pointer.x, -1, 1);
    const targetPy = THREE.MathUtils.clamp(state.pointer.y, -1, 1);
    parallaxRef.current.x = THREE.MathUtils.lerp(
      parallaxRef.current.x,
      targetPx,
      pAlpha
    );
    parallaxRef.current.y = THREE.MathUtils.lerp(
      parallaxRef.current.y,
      targetPy,
      pAlpha
    );

    const breatheX = Math.sin(elapsedRef.current * 0.52) * 0.0045;
    const breatheY = Math.cos(elapsedRef.current * 0.41) * 0.0035;

    finalPosScratch.current
      .copy(currentPosRef.current)
      .add({
        x: parallaxRef.current.x * 0.022 + breatheX,
        y: parallaxRef.current.y * 0.01 + breatheY,
        z: -parallaxRef.current.y * 0.012,
      } as THREE.Vector3);

    finalLookScratch.current
      .copy(currentLookAtRef.current)
      .add({
        x: parallaxRef.current.x * 0.006,
        y: 0,
        z: -parallaxRef.current.y * 0.004,
      } as THREE.Vector3);

    applyCameraTransform(finalPosScratch.current, finalLookScratch.current);
  });

  return null;
}
