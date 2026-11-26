import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import type { BoardWorldBounds } from "../../layout/boardLayout";

/** Verified flat tabletop surface Y coordinate of wooden_table_02.glb (scale Y = 1.0). */
export const TABLE_TOP_Y = 0.7994;

/** Blotter mesh thickness and vertical center/anchor coordinates. */
export const BLOTTER_THICKNESS = 0.0045;
export const BLOTTER_CENTER_Y = TABLE_TOP_Y + BLOTTER_THICKNESS * 0.5;
export const BOARD_ANCHOR_Y = TABLE_TOP_Y + 0.0062;

/** Generous oiled-walnut desk surface (~2.95m x 1.44m) framing the blotter and revealing the rear room. */
export const TABLE_SCALE: [number, number, number] = [2.6, 1.0, 2.04];

export const DESK_MODEL_PATHS = {
  table: "/models/wooden_table_02.glb",
  lamp: "/models/desk_lamp_arm_01.glb",
  binder: "/models/binder_notebook.glb",
  stationery: "/models/stationery_supplies.glb",
} as const;

const NOOP_RAYCAST: THREE.Object3D["raycast"] = () => {};

let modelsPreloaded = false;

/** Preloads the four CC0 Poly Haven GLB models. */
export function preloadDeskModels(): void {
  if (modelsPreloaded) return;
  modelsPreloaded = true;
  useGLTF.preload(DESK_MODEL_PATHS.table);
  useGLTF.preload(DESK_MODEL_PATHS.lamp);
  useGLTF.preload(DESK_MODEL_PATHS.binder);
  useGLTF.preload(DESK_MODEL_PATHS.stationery);
}

export interface ScenePropLayout {
  blotterWidth: number;
  blotterDepth: number;
  lampBasePos: [number, number, number];
  lampRotationY: number;
  lampScale: number;
  lampHeadPos: [number, number, number];
  mugPos: [number, number, number];
  folderPos: [number, number, number];
  magnifierPos: [number, number, number];
  binderPos: [number, number, number];
  binderRotationY: number;
  binderScale: number;
  cupPos: [number, number, number];
  cupScale: number;
  restingPenPos: [number, number, number];
  restingEraserPos: [number, number, number];
}

/**
 * Computes non-overlapping prop placements outside boardBounds + blotter margin
 * so decorative props and shadows frame the board cinematically without occluding cards.
 */
export function getScenePropLayout(
  boardBounds: BoardWorldBounds
): ScenePropLayout {
  const halfW = boardBounds.widthWorld / 2;
  const halfH = boardBounds.heightWorld / 2;

  const blotterWidth = boardBounds.widthWorld + 0.088;
  const blotterDepth = boardBounds.heightWorld + 0.088;

  // Articulated architect lamp in upper-left, angled toward board center so full arm stays in frame.
  const lampBaseX = -Math.min(0.96, halfW + 0.34);
  const lampBaseZ = -Math.min(0.42, Math.max(0.28, halfH * 0.62));
  const lampScale = 0.82;
  const lampRotationY = Math.atan2(lampBaseX - 0.04, lampBaseZ - 0.02);

  // Bulb primitive in desk_lamp_arm_01.glb sits near local (0, 0.6956, -0.1767) with min.y = -0.088.
  const bulbForwardOffset = 0.1767 * lampScale;
  const bulbHeightOffset = (0.6956 - -0.088) * lampScale;
  const lampHeadPos: [number, number, number] = [
    lampBaseX - Math.sin(lampRotationY) * bulbForwardOffset,
    TABLE_TOP_Y + bulbHeightOffset,
    lampBaseZ - Math.cos(lampRotationY) * bulbForwardOffset,
  ];

  // Left-perimeter detective desk storytelling props (always outside blotter).
  const leftMarginX = -Math.min(0.98, halfW + 0.29);
  const mugPos: [number, number, number] = [leftMarginX - 0.04, TABLE_TOP_Y, -0.02];
  const folderPos: [number, number, number] = [leftMarginX - 0.02, TABLE_TOP_Y, 0.27];
  const magnifierPos: [number, number, number] = [
    Math.min(-halfW - 0.17, leftMarginX + 0.08),
    TABLE_TOP_Y,
    0.44,
  ];

  // Right-side binder and upper-right stationery supplies outside boardBounds.
  const rightBaseX = Math.min(1.02, halfW + 0.34);
  const binderPos: [number, number, number] = [rightBaseX, 0, 0.1];
  const binderRotationY = Math.PI / 2 - 0.18;
  const binderScale = 0.8;

  const cupPos: [number, number, number] = [
    Math.min(1.08, rightBaseX + 0.06),
    0,
    -0.34,
  ];
  const cupScale = 1.3;

  const restingPenPos: [number, number, number] = [
    Math.max(halfW + 0.15, rightBaseX - 0.11),
    0,
    0.44,
  ];
  const restingEraserPos: [number, number, number] = [
    Math.max(halfW + 0.16, rightBaseX + 0.03),
    0,
    0.49,
  ];

  return {
    blotterWidth,
    blotterDepth,
    lampBasePos: [lampBaseX, 0, lampBaseZ],
    lampRotationY,
    lampScale,
    lampHeadPos,
    mugPos,
    folderPos,
    magnifierPos,
    binderPos,
    binderRotationY,
    binderScale,
    cupPos,
    cupScale,
    restingPenPos,
    restingEraserPos,
  };
}

interface DecorativeShadowOptions {
  castShadow?: boolean;
  receiveShadow?: boolean;
}

export function prepareDecorativeObject<T extends THREE.Object3D>(
  root: T,
  options: DecorativeShadowOptions = {}
): T {
  const { castShadow = true, receiveShadow = true } = options;
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.raycast = NOOP_RAYCAST;
      child.castShadow = castShadow;
      child.receiveShadow = receiveShadow;
    }
  });
  return root;
}

export function seatObjectOnSurface(
  object: THREE.Object3D,
  surfaceY: number,
  options: { centerXZ?: boolean } = {}
): THREE.Box3 {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty() || !Number.isFinite(box.min.y)) {
    return box;
  }

  if (options.centerXZ) {
    const center = new THREE.Vector3();
    box.getCenter(center);
    object.position.x -= center.x;
    object.position.z -= center.z;
  }

  object.position.y += surfaceY - box.min.y;
  object.updateMatrixWorld(true);
  return box.setFromObject(object);
}

interface BuildPropWrapperOptions {
  scale?: number | [number, number, number];
  rotation?: [number, number, number];
  surfaceY: number;
  centerXZ?: boolean;
  resetSourcePosition?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

function buildSeatedPropWrapper(
  source: THREE.Object3D,
  options: BuildPropWrapperOptions
): THREE.Group {
  const {
    scale = 1,
    rotation = [0, 0, 0],
    surfaceY,
    centerXZ = false,
    resetSourcePosition = false,
    castShadow = true,
    receiveShadow = true,
  } = options;

  const wrapper = new THREE.Group();
  const clone = source.clone(true);
  if (resetSourcePosition) {
    clone.position.set(0, 0, 0);
  }
  if (typeof scale === "number") {
    clone.scale.setScalar(scale);
  } else {
    clone.scale.set(scale[0], scale[1], scale[2]);
  }
  clone.rotation.set(rotation[0], rotation[1], rotation[2]);

  prepareDecorativeObject(clone, { castShadow, receiveShadow });
  wrapper.add(clone);
  seatObjectOnSurface(wrapper, surfaceY, { centerXZ });
  return wrapper;
}

const RAIN_WINDOW_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RAIN_WINDOW_FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float rainLayer(vec2 uv, float scale, float speed) {
    vec2 gv = uv * vec2(scale, scale * 0.38);
    vec2 id = floor(gv);
    gv = fract(gv) - 0.5;
    float n = hash21(id);
    float t = uTime * speed + n * 6.2831;
    float x = (n - 0.5) * 0.55;
    float y = -fract(t * 0.28 + n) + 0.5;
    vec2 dropPos = (gv - vec2(x, y)) * vec2(1.0, 2.4);
    float drop = smoothstep(0.09, 0.015, length(dropPos));
    float trail = smoothstep(0.055, 0.0, abs(gv.x - x))
      * smoothstep(-0.02, 0.42, gv.y - y)
      * smoothstep(0.48, 0.06, gv.y - y) * 0.55;
    return max(drop, trail);
  }

  void main() {
    // Deep nocturnal sky gradient + distant warm streetlamp horizon glow
    vec3 nightTop = vec3(0.06, 0.10, 0.16);
    vec3 nightMid = vec3(0.13, 0.21, 0.29);
    vec3 streetGlow = vec3(0.52, 0.37, 0.21);

    vec3 col = mix(nightMid, nightTop, smoothstep(0.08, 0.95, vUv.y));
    float bokeh1 = smoothstep(0.38, 0.0, length(vUv - vec2(0.28, 0.20)));
    float bokeh2 = smoothstep(0.32, 0.0, length(vUv - vec2(0.74, 0.16)));
    float moonGlow = smoothstep(0.58, 0.0, length(vUv - vec2(0.66, 0.78)));

    col += streetGlow * (bokeh1 * 0.22 + bokeh2 * 0.15);
    col += vec3(0.20, 0.32, 0.44) * moonGlow * 0.35;

    // Animated raindrop streaks trickling down frosted glass
    float r1 = rainLayer(vUv, 14.0, 0.85);
    float r2 = rainLayer(vUv + vec2(0.37, 0.19), 22.0, 1.15);
    float rain = clamp(r1 + r2 * 0.75, 0.0, 1.0);
    col += vec3(0.26, 0.38, 0.50) * rain * 0.45;

    // Subtle frosted glass vignette around mullions
    float edgeVignette = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x)
      * smoothstep(0.0, 0.10, vUv.y) * smoothstep(1.0, 0.90, vUv.y);
    col *= mix(0.68, 1.0, edgeVignette);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export interface DeskBackdropProps {
  boardBounds: BoardWorldBounds;
  reducedMotion?: boolean;
  isPaused?: boolean;
}

/**
 * Non-suspending Midnight Archive detective office architecture:
 * - Stitched dark leather desk blotter with brass corner accents
 * - Wood-paneled wainscot back wall, precinct map board & archival shelves
 * - Animated rain-streaked midnight window with Venetian blind slats & moonlight gobos
 * - Perimeter detective props (manila case folder, brass magnifier, ceramic coffee mug)
 */
export function DeskBackdrop({
  boardBounds,
  reducedMotion = false,
  isPaused = false,
}: DeskBackdropProps) {
  const propLayout = useMemo(
    () => getScenePropLayout(boardBounds),
    [boardBounds]
  );

  const rainMatRef = useRef<THREE.ShaderMaterial>(null);

  const rainUniforms = useMemo(
    () => ({
      uTime: { value: 1.5 },
    }),
    []
  );

  useFrame((_, delta) => {
    if (reducedMotion || isPaused) return;
    if (typeof document !== "undefined" && document.hidden) return;
    if (rainMatRef.current) {
      rainMatRef.current.uniforms.uTime.value += Math.min(delta, 0.1);
    }
  });

  const stitchLine = useMemo(() => {
    const hw = propLayout.blotterWidth / 2 - 0.013;
    const hd = propLayout.blotterDepth / 2 - 0.013;
    const pts = [
      new THREE.Vector3(-hw, 0, -hd),
      new THREE.Vector3(hw, 0, -hd),
      new THREE.Vector3(hw, 0, hd),
      new THREE.Vector3(-hw, 0, hd),
      new THREE.Vector3(-hw, 0, -hd),
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(pts);
    const material = new THREE.LineDashedMaterial({
      color: "#8c6d49",
      dashSize: 0.016,
      gapSize: 0.01,
      transparent: true,
      opacity: 0.68,
    });
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    line.position.set(0, TABLE_TOP_Y + BLOTTER_THICKNESS + 0.0005, 0);
    line.raycast = NOOP_RAYCAST;
    return line;
  }, [propLayout.blotterWidth, propLayout.blotterDepth]);

  useEffect(() => {
    return () => {
      stitchLine.geometry.dispose();
      const mat = stitchLine.material;
      if (Array.isArray(mat)) {
        mat.forEach((m) => m.dispose());
      } else {
        mat.dispose();
      }
    };
  }, [stitchLine]);

  const cornerOffsets = useMemo(() => {
    const cx = propLayout.blotterWidth / 2 - 0.018;
    const cz = propLayout.blotterDepth / 2 - 0.018;
    return [
      [-cx, -cz, 0],
      [cx, -cz, -Math.PI / 2],
      [cx, cz, Math.PI],
      [-cx, cz, Math.PI / 2],
    ] as const;
  }, [propLayout.blotterWidth, propLayout.blotterDepth]);

  const blindSlats = useMemo(
    () => Array.from({ length: 12 }, (_, idx) => 0.46 - idx * 0.082),
    []
  );

  return (
    <group name="midnight-archive-backdrop">
      {/* Dark stitched leather desk blotter under the investigation board */}
      <mesh
        position={[0, BLOTTER_CENTER_Y, 0]}
        receiveShadow
        castShadow={false}
        raycast={NOOP_RAYCAST}
      >
        <boxGeometry
          args={[
            propLayout.blotterWidth,
            BLOTTER_THICKNESS,
            propLayout.blotterDepth,
          ]}
        />
        <meshStandardMaterial
          color="#1b1512"
          roughness={0.82}
          metalness={0.06}
        />
      </mesh>

      {/* Brass corner accents on the desk blotter */}
      {cornerOffsets.map(([cx, cz, rotY], idx) => (
        <group
          key={idx}
          position={[cx, TABLE_TOP_Y + BLOTTER_THICKNESS + 0.0008, cz]}
          rotation={[0, rotY, 0]}
        >
          <mesh raycast={NOOP_RAYCAST} castShadow={false} receiveShadow>
            <boxGeometry args={[0.036, 0.0014, 0.006]} />
            <meshStandardMaterial
              color="#c89b54"
              metalness={0.82}
              roughness={0.28}
            />
          </mesh>
          <mesh
            position={[-0.015, 0, 0.015]}
            raycast={NOOP_RAYCAST}
            castShadow={false}
            receiveShadow
          >
            <boxGeometry args={[0.006, 0.0014, 0.036]} />
            <meshStandardMaterial
              color="#c89b54"
              metalness={0.82}
              roughness={0.28}
            />
          </mesh>
        </group>
      ))}

      {/* Subtle stitched border inset inside the leather blotter */}
      <primitive object={stitchLine} />

      {/* Immediate dark walnut surface fallback plane until wooden_table_02.glb mounts */}
      <mesh
        position={[0, TABLE_TOP_Y - 0.0015, 0]}
        receiveShadow
        castShadow={false}
        raycast={NOOP_RAYCAST}
      >
        <boxGeometry args={[2.92, 0.002, 1.42]} />
        <meshStandardMaterial
          color="#2c2019"
          roughness={0.76}
          metalness={0.04}
        />
      </mesh>

      {/* =====================================================================
          Left-Desk Detective Storytelling Props (Procedural PBR, 0 network KB)
         ===================================================================== */}
      {/* Ceramic Detective Coffee Mug on Cork Coaster */}
      <group position={propLayout.mugPos}>
        {/* Cork coaster */}
        <mesh
          position={[0, 0.002, 0]}
          castShadow
          receiveShadow
          raycast={NOOP_RAYCAST}
        >
          <cylinderGeometry args={[0.052, 0.052, 0.004, 24]} />
          <meshStandardMaterial color="#6e5036" roughness={0.92} metalness={0} />
        </mesh>
        {/* Dark glazed ceramic mug body */}
        <mesh
          position={[0, 0.046, 0]}
          castShadow
          receiveShadow
          raycast={NOOP_RAYCAST}
        >
          <cylinderGeometry args={[0.039, 0.035, 0.084, 24]} />
          <meshStandardMaterial
            color="#23282d"
            roughness={0.26}
            metalness={0.08}
          />
        </mesh>
        {/* Dark espresso surface inside mug */}
        <mesh
          position={[0, 0.085, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={NOOP_RAYCAST}
        >
          <circleGeometry args={[0.034, 20]} />
          <meshStandardMaterial
            color="#160f0a"
            roughness={0.14}
            metalness={0.05}
          />
        </mesh>
        {/* Mug handle */}
        <mesh
          position={[-0.042, 0.047, 0]}
          rotation={[0, 0, Math.PI / 2]}
          castShadow
          raycast={NOOP_RAYCAST}
        >
          <torusGeometry args={[0.022, 0.0055, 10, 18, Math.PI]} />
          <meshStandardMaterial
            color="#23282d"
            roughness={0.26}
            metalness={0.08}
          />
        </mesh>
      </group>

      {/* Confidential Manila Case Folder & Polaroid Slip */}
      <group position={propLayout.folderPos} rotation={[0, 0.16, 0]}>
        {/* Bottom manila folder leaf */}
        <mesh
          position={[0, 0.002, 0]}
          castShadow
          receiveShadow
          raycast={NOOP_RAYCAST}
        >
          <boxGeometry args={[0.21, 0.003, 0.28]} />
          <meshStandardMaterial
            color="#b89664"
            roughness={0.86}
            metalness={0.02}
          />
        </mesh>
        {/* Manila index tab */}
        <mesh
          position={[0.095, 0.002, -0.08]}
          raycast={NOOP_RAYCAST}
          receiveShadow
        >
          <boxGeometry args={[0.032, 0.003, 0.075]} />
          <meshStandardMaterial color="#b89664" roughness={0.86} />
        </mesh>
        {/* Aged inner report paper peeking slightly askew */}
        <mesh
          position={[-0.004, 0.0042, 0.006]}
          rotation={[0, -0.05, 0]}
          receiveShadow
          raycast={NOOP_RAYCAST}
        >
          <boxGeometry args={[0.192, 0.0015, 0.258]} />
          <meshStandardMaterial color="#dfd1b6" roughness={0.9} />
        </mesh>
        {/* Top folder cover */}
        <mesh
          position={[-0.006, 0.0062, 0.002]}
          rotation={[0, 0.02, 0]}
          castShadow
          receiveShadow
          raycast={NOOP_RAYCAST}
        >
          <boxGeometry args={[0.205, 0.0025, 0.275]} />
          <meshStandardMaterial
            color="#c3a16e"
            roughness={0.84}
            metalness={0.02}
          />
        </mesh>
        {/* Crimson classification band */}
        <mesh
          position={[-0.006, 0.0078, -0.06]}
          rotation={[0, 0.02, 0]}
          raycast={NOOP_RAYCAST}
        >
          <boxGeometry args={[0.12, 0.0008, 0.022]} />
          <meshStandardMaterial color="#7d271f" roughness={0.88} />
        </mesh>
      </group>

      {/* Vintage Brass-Rimmed Detective Magnifying Glass */}
      <group position={propLayout.magnifierPos} rotation={[0, -0.58, 0]}>
        {/* Brass lens bezel */}
        <mesh
          position={[0, 0.007, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
          receiveShadow
          raycast={NOOP_RAYCAST}
        >
          <torusGeometry args={[0.042, 0.0045, 14, 32]} />
          <meshStandardMaterial
            color="#cfa156"
            metalness={0.86}
            roughness={0.24}
          />
        </mesh>
        {/* Optical glass lens catching warm specular highlight */}
        <mesh
          position={[0, 0.007, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={NOOP_RAYCAST}
        >
          <circleGeometry args={[0.04, 28]} />
          <meshPhysicalMaterial
            color="#dce8ef"
            transparent
            opacity={0.24}
            roughness={0.06}
            metalness={0.08}
            clearcoat={1}
            clearcoatRoughness={0.06}
          />
        </mesh>
        {/* Brass collar */}
        <mesh
          position={[0, 0.007, 0.052]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
          raycast={NOOP_RAYCAST}
        >
          <cylinderGeometry args={[0.006, 0.006, 0.016, 14]} />
          <meshStandardMaterial
            color="#cfa156"
            metalness={0.86}
            roughness={0.24}
          />
        </mesh>
        {/* Turned walnut handle */}
        <mesh
          position={[0, 0.007, 0.105]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
          receiveShadow
          raycast={NOOP_RAYCAST}
        >
          <cylinderGeometry args={[0.0065, 0.0085, 0.092, 16]} />
          <meshStandardMaterial
            color="#2b1b14"
            roughness={0.55}
            metalness={0.06}
          />
        </mesh>
      </group>

      {/* =====================================================================
          Midnight Detective Office Room Architecture & Rainy Window
         ===================================================================== */}
      {/* Dark timber office floor */}
      <mesh
        position={[0, -0.002, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        castShadow={false}
        raycast={NOOP_RAYCAST}
      >
        <planeGeometry args={[11, 9]} />
        <meshStandardMaterial color="#0f0d0b" roughness={0.94} metalness={0} />
      </mesh>

      {/* Deep charcoal-umber plaster back wall */}
      <mesh
        position={[0, 1.55, -0.79]}
        receiveShadow
        castShadow={false}
        raycast={NOOP_RAYCAST}
      >
        <planeGeometry args={[9.5, 4.4]} />
        <meshStandardMaterial color="#141210" roughness={0.94} metalness={0} />
      </mesh>

      {/* Wood wainscot lower wall panel + chair rail molding */}
      <mesh
        position={[0, 0.44, -0.778]}
        receiveShadow
        castShadow={false}
        raycast={NOOP_RAYCAST}
      >
        <boxGeometry args={[9.2, 0.88, 0.02]} />
        <meshStandardMaterial
          color="#1d1612"
          roughness={0.84}
          metalness={0.04}
        />
      </mesh>
      <mesh
        position={[0, 0.89, -0.766]}
        receiveShadow
        castShadow={false}
        raycast={NOOP_RAYCAST}
      >
        <boxGeometry args={[9.2, 0.032, 0.032]} />
        <meshStandardMaterial
          color="#2a1f18"
          roughness={0.76}
          metalness={0.06}
        />
      </mesh>

      {/* Left-Rear Archive Bookshelf Silhouette with Case Boxes & Ledgers */}
      <group position={[-1.08, 0.82, -0.71]}>
        {/* Bookshelf frame */}
        <mesh castShadow={false} receiveShadow raycast={NOOP_RAYCAST}>
          <boxGeometry args={[0.78, 0.92, 0.14]} />
          <meshStandardMaterial color="#1b1410" roughness={0.86} />
        </mesh>
        {/* Shelf planks */}
        {[-0.14, 0.15, 0.42].map((sy, idx) => (
          <mesh
            key={idx}
            position={[0, sy, 0.01]}
            castShadow={false}
            receiveShadow
            raycast={NOOP_RAYCAST}
          >
            <boxGeometry args={[0.74, 0.02, 0.145]} />
            <meshStandardMaterial color="#271d17" roughness={0.78} />
          </mesh>
        ))}
        {/* Archival case file boxes & bound ledgers on shelves */}
        {[
          { x: -0.24, y: 0.0, w: 0.1, h: 0.24, c: "#6b543b" },
          { x: -0.12, y: -0.01, w: 0.1, h: 0.22, c: "#5e4934" },
          { x: 0.02, y: -0.01, w: 0.042, h: 0.22, c: "#452520" },
          { x: 0.07, y: 0.0, w: 0.045, h: 0.24, c: "#23332e" },
          { x: 0.13, y: -0.01, w: 0.04, h: 0.21, c: "#483729" },
          { x: -0.2, y: 0.28, w: 0.13, h: 0.22, c: "#665038" },
          { x: -0.05, y: 0.27, w: 0.12, h: 0.21, c: "#56422f" },
          { x: 0.11, y: 0.27, w: 0.14, h: 0.21, c: "#3c2e24" },
        ].map((b, idx) => (
          <mesh
            key={idx}
            position={[b.x, b.y, 0.02]}
            castShadow={false}
            receiveShadow
            raycast={NOOP_RAYCAST}
          >
            <boxGeometry args={[b.w, b.h, 0.11]} />
            <meshStandardMaterial color={b.c} roughness={0.88} />
          </mesh>
        ))}
      </group>

      {/* Center-Rear Framed Precinct Corkboard Silhouette */}
      <group position={[-0.16, 1.07, -0.77]}>
        <mesh castShadow={false} receiveShadow raycast={NOOP_RAYCAST}>
          <boxGeometry args={[0.68, 0.36, 0.02]} />
          <meshStandardMaterial color="#251c16" roughness={0.82} />
        </mesh>
        <mesh position={[0, 0, 0.012]} raycast={NOOP_RAYCAST}>
          <planeGeometry args={[0.62, 0.31]} />
          <meshStandardMaterial color="#31241b" roughness={0.95} />
        </mesh>
        {[
          [-0.17, 0.04, 0.04, "#928168"],
          [0.03, 0.05, -0.03, "#83735c"],
          [0.19, -0.03, 0.05, "#8b7b63"],
          [-0.07, -0.06, -0.04, "#7b6c57"],
        ].map(([px, py, rot, col], idx) => (
          <mesh
            key={idx}
            position={[px as number, py as number, 0.015]}
            rotation={[0, 0, rot as number]}
            raycast={NOOP_RAYCAST}
          >
            <planeGeometry args={[0.11, 0.075]} />
            <meshStandardMaterial color={col as string} roughness={0.92} />
          </mesh>
        ))}
      </group>

      {/* Rain-Streaked Noir Window with Venetian Blinds in Upper-Right Background */}
      <group position={[0.66, 1.12, -0.76]}>
        {/* Heavy dark timber window casing */}
        <mesh castShadow={false} receiveShadow raycast={NOOP_RAYCAST}>
          <boxGeometry args={[1.08, 0.72, 0.034]} />
          <meshStandardMaterial
            color="#201813"
            roughness={0.82}
            metalness={0.06}
          />
        </mesh>

        {/* Animated Rainy Midnight Glass Shader */}
        <mesh position={[0, 0, 0.019]} raycast={NOOP_RAYCAST}>
          <planeGeometry args={[0.98, 0.64]} />
          <shaderMaterial
            ref={rainMatRef}
            vertexShader={RAIN_WINDOW_VERTEX}
            fragmentShader={RAIN_WINDOW_FRAGMENT}
            uniforms={rainUniforms}
            toneMapped
          />
        </mesh>

        {/* Classic Mullion Crossbars */}
        <mesh position={[0, 0, 0.023]} raycast={NOOP_RAYCAST}>
          <boxGeometry args={[0.022, 0.65, 0.012]} />
          <meshStandardMaterial color="#18120f" roughness={0.88} />
        </mesh>
        <mesh position={[0, 0.02, 0.023]} raycast={NOOP_RAYCAST}>
          <boxGeometry args={[0.99, 0.02, 0.012]} />
          <meshStandardMaterial color="#18120f" roughness={0.88} />
        </mesh>

        {/* Horizontal Venetian Blind Slats + Vertical Draw Cords */}
        {blindSlats.slice(0, 9).map((_, idx) => {
          const sy = 0.28 - idx * 0.068;
          return (
            <mesh
              key={idx}
              position={[0, sy, 0.029]}
              rotation={[0.38, 0, 0]}
              raycast={NOOP_RAYCAST}
            >
              <boxGeometry args={[0.97, 0.014, 0.004]} />
              <meshStandardMaterial
                color="#1b1816"
                roughness={0.62}
                metalness={0.22}
              />
            </mesh>
          );
        })}
        {[-0.34, 0.34].map((cx, idx) => (
          <mesh key={idx} position={[cx, 0, 0.032]} raycast={NOOP_RAYCAST}>
            <boxGeometry args={[0.004, 0.64, 0.004]} />
            <meshStandardMaterial color="#2a2420" roughness={0.9} />
          </mesh>
        ))}

        {/* Soft Venetian-Blind Moonlight Gobo Bars Projected Across Nearby Wall */}
        {[-0.2, -0.09, 0.02, 0.13].map((gy, idx) => (
          <mesh
            key={idx}
            position={[-0.72, gy - 0.06, -0.006]}
            rotation={[0, 0, -0.14]}
            raycast={NOOP_RAYCAST}
          >
            <planeGeometry args={[0.46, 0.028]} />
            <meshBasicMaterial
              color="#7194b0"
              transparent
              opacity={0.055}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export interface DeskPropsProps {
  boardBounds: BoardWorldBounds;
}

/**
 * Loads and auto-seats the four CC0 Poly Haven GLB props around the board.
 * Wrapped in <Suspense fallback={null}> so the HTML board renders immediately.
 */
export function DeskProps({ boardBounds }: DeskPropsProps) {
  const tableGltf = useGLTF(DESK_MODEL_PATHS.table);
  const lampGltf = useGLTF(DESK_MODEL_PATHS.lamp);
  const binderGltf = useGLTF(DESK_MODEL_PATHS.binder);
  const stationeryGltf = useGLTF(DESK_MODEL_PATHS.stationery);

  const propLayout = useMemo(
    () => getScenePropLayout(boardBounds),
    [boardBounds]
  );

  // Scaled walnut desk positioned so top remains at TABLE_TOP_Y = 0.7994.
  const tableObject = useMemo(() => {
    const cloned = tableGltf.scene.clone(true);
    cloned.scale.set(TABLE_SCALE[0], TABLE_SCALE[1], TABLE_SCALE[2]);
    return prepareDecorativeObject(cloned, {
      castShadow: false,
      receiveShadow: true,
    });
  }, [tableGltf.scene]);

  // Static architect desk lamp seated flush onto TABLE_TOP_Y from min.y = -0.088.
  const lampObject = useMemo(() => {
    return buildSeatedPropWrapper(lampGltf.scene, {
      scale: propLayout.lampScale,
      rotation: [0, propLayout.lampRotationY, 0],
      surfaceY: TABLE_TOP_Y,
      castShadow: true,
      receiveShadow: true,
    });
  }, [lampGltf.scene, propLayout.lampScale, propLayout.lampRotationY]);

  // Open & closed binder notebooks centered in XZ and seated flush onto TABLE_TOP_Y.
  const binderObject = useMemo(() => {
    return buildSeatedPropWrapper(binderGltf.scene, {
      scale: propLayout.binderScale,
      rotation: [0, propLayout.binderRotationY, 0],
      surfaceY: TABLE_TOP_Y,
      centerXZ: true,
      castShadow: true,
      receiveShadow: true,
    });
  }, [binderGltf.scene, propLayout.binderScale, propLayout.binderRotationY]);

  // Individual stationery items extracted cleanly from asset-spread layout and auto-seated.
  const stationeryParts = useMemo(() => {
    const getNode = (name: string): THREE.Object3D | null =>
      stationeryGltf.scene.getObjectByName(name) ?? null;

    const cupNode = getNode("stationery_supplies_pencilcup");
    const pencilUsedNode = getNode("stationery_supplies_pencil_used");
    const pencilNewNode = getNode("stationery_supplies_pencil_new_a");
    const penBlueNode = getNode("stationery_supplies_pen_blue");
    const penFancyNode = getNode("stationery_supplies_pen_fancy");
    const eraserNode = getNode("stationery_supplies_eraser");

    const cup = cupNode
      ? buildSeatedPropWrapper(cupNode, {
          scale: propLayout.cupScale,
          surfaceY: TABLE_TOP_Y,
          centerXZ: true,
          resetSourcePosition: true,
          castShadow: true,
          receiveShadow: true,
        })
      : null;

    const cupFloorY = TABLE_TOP_Y + 0.012;
    const cupUtensils: THREE.Group[] = [];
    const utensilConfigs: Array<{
      node: THREE.Object3D | null;
      rot: [number, number, number];
      offset: [number, number];
    }> = [
      {
        node: pencilUsedNode,
        rot: [0.1, 0.4, Math.PI / 2 - 0.14],
        offset: [-0.014, 0.008],
      },
      {
        node: penBlueNode,
        rot: [-0.12, -0.5, Math.PI / 2 - 0.18],
        offset: [0.013, -0.01],
      },
      {
        node: pencilNewNode,
        rot: [0.06, 1.6, Math.PI / 2 - 0.11],
        offset: [0.004, 0.014],
      },
    ];

    for (const cfg of utensilConfigs) {
      if (!cfg.node) continue;
      const item = buildSeatedPropWrapper(cfg.node, {
        scale: 1.15,
        rotation: cfg.rot,
        surfaceY: cupFloorY,
        centerXZ: true,
        resetSourcePosition: true,
        castShadow: true,
        receiveShadow: true,
      });
      item.position.x += cfg.offset[0];
      item.position.z += cfg.offset[1];
      cupUtensils.push(item);
    }

    const restingPen = penFancyNode
      ? buildSeatedPropWrapper(penFancyNode, {
          scale: 1.24,
          rotation: [0, 0.42, 0],
          surfaceY: TABLE_TOP_Y,
          centerXZ: true,
          resetSourcePosition: true,
          castShadow: true,
          receiveShadow: true,
        })
      : null;

    const restingEraser = eraserNode
      ? buildSeatedPropWrapper(eraserNode, {
          scale: 1.24,
          rotation: [0, -0.28, 0],
          surfaceY: TABLE_TOP_Y,
          centerXZ: true,
          resetSourcePosition: true,
          castShadow: true,
          receiveShadow: true,
        })
      : null;

    return { cup, cupUtensils, restingPen, restingEraser };
  }, [stationeryGltf.scene, propLayout.cupScale]);

  const invalidate = useThree((state) => state.invalidate);
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    scene.traverse((obj) => {
      if (obj instanceof THREE.SpotLight && obj.castShadow) {
        obj.shadow.needsUpdate = true;
      }
    });
    invalidate();
    const raf = requestAnimationFrame(() => invalidate());
    return () => cancelAnimationFrame(raf);
  }, [
    invalidate,
    scene,
    tableObject,
    lampObject,
    binderObject,
    stationeryParts,
  ]);

  return (
    <group name="midnight-archive-props">
      <primitive object={tableObject} />

      {/* Upper-left desk lamp + weighted cast-iron base collar */}
      <group position={propLayout.lampBasePos}>
        <mesh
          position={[0, TABLE_TOP_Y + 0.011, 0]}
          castShadow
          receiveShadow
          raycast={NOOP_RAYCAST}
        >
          <cylinderGeometry args={[0.08, 0.09, 0.022, 24]} />
          <meshStandardMaterial
            color="#1c1917"
            roughness={0.55}
            metalness={0.55}
          />
        </mesh>
        <primitive object={lampObject} />
      </group>

      {/* Right-side open & closed binder notebooks */}
      <group position={propLayout.binderPos}>
        <primitive object={binderObject} />
      </group>

      {/* Upper-right pencil cup with standing pens/pencils */}
      <group position={propLayout.cupPos}>
        {stationeryParts.cup ? (
          <primitive object={stationeryParts.cup} />
        ) : null}
        {stationeryParts.cupUtensils.map((utensil, idx) => (
          <primitive key={idx} object={utensil} />
        ))}
      </group>

      {/* Resting fountain pen & eraser next to the binder */}
      {stationeryParts.restingPen ? (
        <group position={propLayout.restingPenPos}>
          <primitive object={stationeryParts.restingPen} />
        </group>
      ) : null}
      {stationeryParts.restingEraser ? (
        <group position={propLayout.restingEraserPos}>
          <primitive object={stationeryParts.restingEraser} />
        </group>
      ) : null}
    </group>
  );
}
