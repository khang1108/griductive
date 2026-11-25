import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { useFrame, useThree } from "@react-three/fiber";
import type { QualityMode } from "../../types";
import { TABLE_TOP_Y } from "./DeskProps";

const NOOP_RAYCAST: THREE.Object3D["raycast"] = () => {};

const DUST_COUNT = 58;

const DUST_VERTEX = /* glsl */ `
  attribute float aScale;
  attribute float aAlpha;
  varying float vAlpha;

  void main() {
    vAlpha = aAlpha;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = clamp(aScale * (11.5 / max(0.85, -mvPosition.z)), 2.0, 7.0);
  }
`;

const DUST_FRAGMENT = /* glsl */ `
  varying float vAlpha;

  void main() {
    float dist = length(gl_PointCoord - vec2(0.5));
    float circle = smoothstep(0.5, 0.08, dist);
    if (circle <= 0.002) discard;

    vec3 warmDust = vec3(1.0, 0.82, 0.48);
    gl_FragColor = vec4(warmDust, circle * vAlpha * 0.72);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const CONE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;

  void main() {
    vUv = uv;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vNormalView = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const CONE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;

  void main() {
    // Feather silhouette edges cleanly in view space so cone never shows hard geometry
    float edgeFade = pow(abs(dot(normalize(vNormalView), normalize(vViewDir))), 1.75);

    // vUv.y = 1.0 at lamp hood top, 0.0 at tabletop end
    float topSoft = smoothstep(1.0, 0.84, vUv.y);
    float lengthFalloff = pow(clamp(vUv.y, 0.0, 1.0), 1.45);
    float bottomSoft = smoothstep(0.0, 0.24, vUv.y);

    float shimmer = 0.94 + 0.06 * sin(uTime * 0.9 + vUv.y * 5.0);
    float alpha = edgeFade * topSoft * lengthFalloff * bottomSoft * 0.088 * shimmer;

    vec3 beamColor = vec3(1.0, 0.80, 0.49);
    gl_FragColor = vec4(beamColor, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

interface DustMotesProps {
  lampHeadPosition: [number, number, number];
  animate: boolean;
}

function DustMotes({ lampHeadPosition, animate }: DustMotesProps) {
  const elapsedRef = useRef(0);

  const { geometry, seeds } = useMemo(() => {
    const positions = new Float32Array(DUST_COUNT * 3);
    const scales = new Float32Array(DUST_COUNT);
    const alphas = new Float32Array(DUST_COUNT);
    const particleSeeds = new Float32Array(DUST_COUNT * 4);

    let s = 2026;
    const nextRand = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };

    for (let i = 0; i < DUST_COUNT; i++) {
      const t = 0.08 + nextRand() * 0.86;
      const spread = 0.12 + t * 0.48;
      const angle = nextRand() * Math.PI * 2;
      const bx =
        THREE.MathUtils.lerp(lampHeadPosition[0], 0.08, t) +
        Math.cos(angle) * spread * 0.56;
      const by = THREE.MathUtils.lerp(
        lampHeadPosition[1] - 0.04,
        TABLE_TOP_Y + 0.06,
        t
      );
      const bz =
        THREE.MathUtils.lerp(lampHeadPosition[2], 0.04, t) +
        Math.sin(angle) * spread * 0.56;

      positions[i * 3] = bx;
      positions[i * 3 + 1] = by;
      positions[i * 3 + 2] = bz;

      scales[i] = 0.55 + nextRand() * 0.85;
      alphas[i] = (0.14 + nextRand() * 0.22) * (1.0 - t * 0.35);

      particleSeeds[i * 4] = bx;
      particleSeeds[i * 4 + 1] = by;
      particleSeeds[i * 4 + 2] = bz;
      particleSeeds[i * 4 + 3] = nextRand() * Math.PI * 2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
    return { geometry: geo, seeds: particleSeeds };
  }, [lampHeadPosition[0], lampHeadPosition[1], lampHeadPosition[2]]);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  useFrame((_, delta) => {
    if (!animate) return;
    if (typeof document !== "undefined" && document.hidden) return;

    elapsedRef.current += Math.min(delta, 0.1);
    const t = elapsedRef.current;

    const attr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;

    for (let i = 0; i < DUST_COUNT; i++) {
      const bx = seeds[i * 4];
      const by = seeds[i * 4 + 1];
      const bz = seeds[i * 4 + 2];
      const phase = seeds[i * 4 + 3];

      arr[i * 3] = bx + Math.sin(t * 0.31 + phase) * 0.022;
      arr[i * 3 + 1] = by + Math.cos(t * 0.24 + phase * 1.3) * 0.018;
      arr[i * 3 + 2] = bz + Math.sin(t * 0.27 + phase * 0.7) * 0.022;
    }
    attr.needsUpdate = true;
  });

  return (
    <points geometry={geometry} raycast={NOOP_RAYCAST}>
      <shaderMaterial
        vertexShader={DUST_VERTEX}
        fragmentShader={DUST_FRAGMENT}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

interface VolumetricLampConeProps {
  lampHeadPosition: [number, number, number];
  lampTarget: [number, number, number];
  animate: boolean;
}

function VolumetricLampCone({
  lampHeadPosition,
  lampTarget,
  animate,
}: VolumetricLampConeProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
    }),
    []
  );

  const { midpoint, quaternion, length } = useMemo(() => {
    const start = new THREE.Vector3(
      lampHeadPosition[0],
      lampHeadPosition[1] - 0.015,
      lampHeadPosition[2]
    );
    const end = new THREE.Vector3(
      lampTarget[0],
      lampTarget[1] + 0.02,
      lampTarget[2]
    );
    const deltaVec = end.clone().sub(start);
    const len = Math.max(0.4, deltaVec.length());
    const dir = deltaVec.clone().normalize();
    const mid = start.clone().addScaledVector(dir, len * 0.5);
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, -1, 0),
      dir
    );
    return {
      midpoint: [mid.x, mid.y, mid.z] as [number, number, number],
      quaternion: quat,
      length: len,
    };
  }, [
    lampHeadPosition[0],
    lampHeadPosition[1],
    lampHeadPosition[2],
    lampTarget[0],
    lampTarget[1],
    lampTarget[2],
  ]);

  useFrame((_, delta) => {
    if (!animate) return;
    if (typeof document !== "undefined" && document.hidden) return;
    if (matRef.current) {
      matRef.current.uniforms.uTime.value += Math.min(delta, 0.1);
    }
  });

  return (
    <group>
      {/* Warm incandescent filament bulb tucked inside the architect lamp shade */}
      <mesh
        position={[
          lampHeadPosition[0],
          lampHeadPosition[1] - 0.012,
          lampHeadPosition[2],
        ]}
        raycast={NOOP_RAYCAST}
      >
        <sphereGeometry args={[0.024, 16, 12]} />
        <meshBasicMaterial color="#FFE9BD" toneMapped={false} />
      </mesh>

      {/* Soft additive volumetric warm cone streaming diagonally across the desk */}
      <mesh
        position={midpoint}
        quaternion={quaternion}
        raycast={NOOP_RAYCAST}
        renderOrder={2}
      >
        <cylinderGeometry args={[0.048, 0.62, length, 32, 1, true]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={CONE_VERTEX}
          fragmentShader={CONE_FRAGMENT}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

export interface LightingAndAtmosphereProps {
  quality: QualityMode;
  reducedMotion: boolean;
  isPaused: boolean;
  lampHeadPosition?: [number, number, number];
  lampTarget?: [number, number, number];
}

/**
 * Physical Midnight Archive lighting rig:
 * - RoomEnvironment PMREM specular IBL at low intensity (0.22) so walnut, brass, metal & leather gleam naturally
 * - Warm shadow-casting desk lamp spotlight (#FFCE85) + glowing filament + volumetric light cone
 * - Cool rainy-window directional moonlight rim (#5C7890) from upper-right background
 * - Subtle atmospheric depth fog + circular floating dust motes
 */
export function LightingAndAtmosphere({
  quality,
  reducedMotion,
  isPaused,
  lampHeadPosition = [-0.78, 1.44, -0.32],
  lampTarget = [0.02, TABLE_TOP_Y, 0.02],
}: LightingAndAtmosphereProps) {
  const spotLightRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  // Generate procedural PBR RoomEnvironment reflections once with zero network cost
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileEquirectangularShader();
    const roomEnv = new RoomEnvironment();
    const envRT = pmrem.fromScene(roomEnv, 0.045);

    const prevEnv = scene.environment;
    const prevIntensity = scene.environmentIntensity;
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.13;

    return () => {
      if (scene.environment === envRT.texture) {
        scene.environment = prevEnv;
        scene.environmentIntensity = prevIntensity;
      }
      roomEnv.dispose();
      envRT.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  useLayoutEffect(() => {
    const light = spotLightRef.current;
    const target = targetRef.current;
    if (!light || !target) return;
    light.target = target;
    target.updateMatrixWorld();
    // Static scene props: bake crisp shadow map on layout change rather than 60x/sec
    light.shadow.autoUpdate = false;
    light.shadow.needsUpdate = true;
  }, [
    quality,
    lampHeadPosition[0],
    lampHeadPosition[1],
    lampHeadPosition[2],
    lampTarget[0],
    lampTarget[1],
    lampTarget[2],
  ]);

  const shadowResolution: [number, number] =
    quality === "high" ? [2048, 2048] : [1024, 1024];

  const animateAtmosphere = !reducedMotion && !isPaused;

  return (
    <group name="midnight-archive-lighting">
      {/* Subtle warm-charcoal room depth fog */}
      <fog attach="fog" args={["#120f0d", 2.85, 6.4]} />

      {/* Spotlight target anchored on the tabletop */}
      <object3D ref={targetRef} position={lampTarget} />

      {/* Primary warm desk lamp key light — dynamic shadow caster */}
      <spotLight
        key={`lamp-spot-${quality}`}
        ref={spotLightRef}
        position={lampHeadPosition}
        color="#FFCE85"
        intensity={quality === "high" ? 3.4 : 3.1}
        distance={5.2}
        angle={0.86}
        penumbra={0.88}
        decay={1.32}
        castShadow
        shadow-mapSize={shadowResolution}
        shadow-bias={-0.0003}
        shadow-normalBias={0.018}
        shadow-camera-near={0.2}
        shadow-camera-far={3.8}
      />

      {/* Warm local lamp-hood bounce light */}
      <pointLight
        position={lampHeadPosition}
        color="#FFD699"
        intensity={0.45}
        distance={1.15}
        decay={2}
        castShadow={false}
      />

      {/* Cool rainy-window moonlight rim light from upper-right rear */}
      <directionalLight
        position={[1.85, 2.25, -1.45]}
        color="#6786A0"
        intensity={1.15}
        castShadow={false}
      />

      {/* Warm floor/walnut bounce vs cool nocturnal sky fill */}
      <hemisphereLight args={["#5b7184", "#2e2018", 0.56]} />
      <ambientLight color="#f4e4cb" intensity={0.18} />

      {/* Volumetric warm lamp cone + glowing bulb filament */}
      <VolumetricLampCone
        lampHeadPosition={lampHeadPosition}
        lampTarget={lampTarget}
        animate={animateAtmosphere}
      />

      {/* Soft circular dust motes drifting inside the lamp beam */}
      <DustMotes
        lampHeadPosition={lampHeadPosition}
        animate={animateAtmosphere}
      />
    </group>
  );
}
