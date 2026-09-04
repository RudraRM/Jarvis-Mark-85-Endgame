"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { GLOW_PRESETS } from "@/lib/glow";
import type { GlowState } from "@/lib/types";

export interface CoreProps {
  /** Live microphone amplitude, 0..1. Read every frame, never re-renders. */
  amplitudeRef: React.MutableRefObject<number>;
  glow: GlowState;
  /** Agent-controlled idle spin rate multiplier. */
  spinMultiplier: number;
  /** Agent/keyboard controlled scale, clamped by the caller. */
  scale: number;
  /** Fires when the user manipulates the core so the a11y live region can narrate. */
  onManipulate?: (summary: string) => void;
}

const IDLE_SPIN = 0.0022;
const DAMPING = 0.955;
const DRAG_SENSITIVITY = 0.0055;
const FLICK_IMPULSE = 0.7;
/** Per-axis ceiling on flick momentum, in radians per 60 Hz frame. */
const MAX_VELOCITY = 0.22;
/** Weight of the newest sample in the velocity EMA — smooths jittery pointers. */
const VELOCITY_BLEND = 0.45;

/** One partial-arc ring in the reactor stack. */
interface RingSpec {
  radius: number;
  tube: number;
  arc: number;
  offset: number;
  tilt: [number, number, number];
  speed: number;
  accent: boolean;
}

const RINGS: RingSpec[] = [
  // Dense coplanar stack — the face-on "diagram circle".
  { radius: 1.18, tube: 0.009, arc: Math.PI * 1.9, offset: 0, tilt: [0, 0, 0], speed: 0.9, accent: false },
  { radius: 1.3, tube: 0.005, arc: Math.PI * 0.6, offset: 0.9, tilt: [0, 0, 0.4], speed: -1.4, accent: true },
  { radius: 1.44, tube: 0.014, arc: Math.PI * 1.55, offset: 0, tilt: [0, 0, 2.1], speed: 0.5, accent: false },
  { radius: 1.52, tube: 0.004, arc: Math.PI * 0.35, offset: 0, tilt: [0, 0, 4.2], speed: 1.9, accent: true },
  { radius: 1.66, tube: 0.007, arc: Math.PI * 1.2, offset: 0, tilt: [0, 0, 3.3], speed: -0.7, accent: false },
  { radius: 1.78, tube: 0.011, arc: Math.PI * 1.75, offset: 0, tilt: [0, 0, 1.1], speed: 0.35, accent: false },
  { radius: 1.88, tube: 0.004, arc: Math.PI * 0.28, offset: 0, tilt: [0, 0, 5.4], speed: -2.2, accent: true },
  { radius: 2.02, tube: 0.006, arc: Math.PI * 1.45, offset: 0, tilt: [0, 0, 2.6], speed: 0.62, accent: false },
  // Tilted rings that give the assembly its depth as it tumbles.
  { radius: 1.6, tube: 0.006, arc: Math.PI * 1.1, offset: 0, tilt: [1.35, 0.2, 0], speed: -0.9, accent: true },
  { radius: 1.94, tube: 0.005, arc: Math.PI * 0.9, offset: 0, tilt: [0.5, 1.2, 0.3], speed: 0.8, accent: true },
  { radius: 2.18, tube: 0.004, arc: Math.PI * 0.55, offset: 0, tilt: [-1.1, 0.4, 0.8], speed: 1.3, accent: true },
];

/** Evenly distributed points on a sphere via the Fibonacci lattice. */
function useParticleField(count: number, radius: number) {
  return useMemo(() => {
    const positions = new Float32Array(count * 3);
    const base = new Float32Array(count * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < count; i += 1) {
      const y = 1 - (i / (count - 1)) * 2;
      const ring = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      const x = Math.cos(theta) * ring;
      const z = Math.sin(theta) * ring;

      positions[i * 3] = x * radius;
      positions[i * 3 + 1] = y * radius;
      positions[i * 3 + 2] = z * radius;
      base[i * 3] = x;
      base[i * 3 + 1] = y;
      base[i * 3 + 2] = z;
    }
    return { positions, base };
  }, [count, radius]);
}

export default function JarvisCore({
  amplitudeRef,
  glow,
  spinMultiplier,
  scale,
  onManipulate,
}: CoreProps) {
  const group = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const particles = useRef<THREE.Points>(null);
  const { gl, camera } = useThree();

  // Angular velocity around the world X / Y / Z axes, in radians per frame.
  const velocity = useRef(new THREE.Vector3());
  const dragging = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0, t: 0 });
  const smoothedAmplitude = useRef(0);
  const currentScale = useRef(scale);

  const preset = GLOW_PRESETS[glow];
  const { positions, base } = useParticleField(1400, 2.45);

  // Colours are mutated in place so a glow change never rebuilds geometry.
  const coreColor = useMemo(() => new THREE.Color(preset.core), [preset.core]);
  const accentColor = useMemo(() => new THREE.Color(preset.accent), [preset.accent]);

  /* ---------------------------------------------------------------- input */

  useEffect(() => {
    const canvas = gl.domElement;

    const applyDrag = (dx: number, dy: number, roll: boolean, dt: number) => {
      const group3d = group.current;
      if (!group3d) return;

      // Convert this move into radians-per-frame and fold it into the running
      // average, so a release carries the gesture's momentum rather than the
      // last noisy sample.
      const frames = THREE.MathUtils.clamp(dt, 4, 64) / 16;
      const blend = (axis: "x" | "y" | "z", radians: number) => {
        const instant = THREE.MathUtils.clamp(radians / frames, -MAX_VELOCITY, MAX_VELOCITY);
        velocity.current[axis] =
          velocity.current[axis] * (1 - VELOCITY_BLEND) + instant * VELOCITY_BLEND;
      };

      if (roll) {
        const rz = dx * DRAG_SENSITIVITY;
        group3d.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), rz);
        blend("z", rz);
        return;
      }

      const ry = dx * DRAG_SENSITIVITY;
      const rx = dy * DRAG_SENSITIVITY;
      group3d.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), ry);
      group3d.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), rx);
      blend("y", ry);
      blend("x", rx);
    };

    const onPointerDown = (event: PointerEvent) => {
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch (e) {
        console.warn("Pointer capture failed:", e);
        return;
      }
      dragging.current = true;
      lastPointer.current = { x: event.clientX, y: event.clientY, t: performance.now() };
      velocity.current.multiplyScalar(0.2);
      canvas.style.cursor = "grabbing";
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging.current) return;
      const now = performance.now();
      const dt = now - lastPointer.current.t;
      applyDrag(
        event.clientX - lastPointer.current.x,
        event.clientY - lastPointer.current.y,
        event.shiftKey || event.button === 2,
        dt,
      );
      lastPointer.current = { x: event.clientX, y: event.clientY, t: now };
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      try {
        if (canvas.hasPointerCapture(event.pointerId)) {
          canvas.releasePointerCapture(event.pointerId);
        }
      } catch (e) {
        console.warn("Pointer capture error:", e);
      }
      canvas.style.cursor = "grab";

      // A release converts tracked velocity into a decaying flick.
      velocity.current.multiplyScalar(FLICK_IMPULSE);
      velocity.current.clampLength(0, MAX_VELOCITY);
      const speed = velocity.current.length();
      if (speed > 0.004) {
        onManipulate?.(`Core flicked into free spin at ${Math.round((speed / MAX_VELOCITY) * 100)} percent momentum.`);
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      currentScale.current = THREE.MathUtils.clamp(
        currentScale.current - event.deltaY * 0.0011,
        0.55,
        2.1,
      );
    };

    canvas.style.cursor = "grab";
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [gl, onManipulate]);

  // Keyboard control lives on the canvas element so it only fires when focused.
  useEffect(() => {
    const canvas = gl.domElement;

    const onKeyDown = (event: KeyboardEvent) => {
      const nudge = event.shiftKey ? 0.09 : 0.035;
      let handled = true;
      let summary = "";

      switch (event.key) {
        case "ArrowLeft":
        case "a":
        case "A":
          velocity.current.y -= nudge;
          summary = "Core yawing left.";
          break;
        case "ArrowRight":
        case "d":
        case "D":
          velocity.current.y += nudge;
          summary = "Core yawing right.";
          break;
        case "ArrowUp":
        case "w":
        case "W":
          velocity.current.x -= nudge;
          summary = "Core pitching up.";
          break;
        case "ArrowDown":
        case "s":
        case "S":
          velocity.current.x += nudge;
          summary = "Core pitching down.";
          break;
        case "q":
        case "Q":
          velocity.current.z -= nudge;
          summary = "Core rolling counter-clockwise.";
          break;
        case "e":
        case "E":
          velocity.current.z += nudge;
          summary = "Core rolling clockwise.";
          break;
        case "+":
        case "=":
          currentScale.current = THREE.MathUtils.clamp(currentScale.current + 0.08, 0.55, 2.1);
          summary = `Core magnified to ${(currentScale.current * 100).toFixed(0)} percent.`;
          break;
        case "-":
        case "_":
          currentScale.current = THREE.MathUtils.clamp(currentScale.current - 0.08, 0.55, 2.1);
          summary = `Core reduced to ${(currentScale.current * 100).toFixed(0)} percent.`;
          break;
        case "0":
          velocity.current.set(0, 0, 0);
          currentScale.current = 1;
          group.current?.quaternion.identity();
          summary = "Core orientation and scale reset.";
          break;
        default:
          handled = false;
      }

      if (handled) {
        event.preventDefault();
        onManipulate?.(summary);
      }
    };

    canvas.addEventListener("keydown", onKeyDown);
    return () => canvas.removeEventListener("keydown", onKeyDown);
  }, [gl, onManipulate]);

  // Agent-driven scale changes feed the same value the keyboard mutates.
  useEffect(() => {
    currentScale.current = THREE.MathUtils.clamp(scale, 0.55, 2.1);
  }, [scale]);

  /* ---------------------------------------------------------------- frame */

  useFrame((state, delta) => {
    const root = group.current;
    if (!root) return;

    const step = Math.min(delta, 0.05) * 60; // frame-rate independent damping
    const amplitude = amplitudeRef.current;
    smoothedAmplitude.current += (amplitude - smoothedAmplitude.current) * 0.18;
    const level = smoothedAmplitude.current;

    if (!dragging.current) {
      const v = velocity.current;
      root.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), v.x * step);
      root.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), v.y * step + IDLE_SPIN * spinMultiplier * step);
      root.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), v.z * step);
      v.multiplyScalar(Math.pow(DAMPING, step));
      if (v.lengthSq() < 1e-8) v.set(0, 0, 0);
    }

    // Voice-reactive breathing: amplitude scales and pulses the whole assembly.
    const pulse = 1 + level * 0.28 + Math.sin(state.clock.elapsedTime * 1.6) * 0.012;
    const target = currentScale.current * pulse;
    root.scale.lerp(new THREE.Vector3(target, target, target), 0.16);

    if (inner.current) {
      inner.current.rotation.y += (0.004 + level * 0.05) * spinMultiplier * step;
      inner.current.rotation.x += 0.0015 * step;
    }

    // Push the particle shell outward with the voice envelope.
    const points = particles.current;
    if (points) {
      const attr = points.geometry.getAttribute("position") as THREE.BufferAttribute;
      const array = attr.array as Float32Array;
      const t = state.clock.elapsedTime;
      for (let i = 0; i < array.length; i += 3) {
        const wobble =
          2.45 +
          Math.sin(t * 1.3 + base[i] * 4 + base[i + 2] * 3) * 0.05 +
          level * (0.35 + Math.abs(base[i + 1]) * 0.4);
        array[i] = base[i] * wobble;
        array[i + 1] = base[i + 1] * wobble;
        array[i + 2] = base[i + 2] * wobble;
      }
      attr.needsUpdate = true;
      const material = points.material as THREE.PointsMaterial;
      material.opacity = 0.35 + level * 0.5;
      material.size = 0.016 + level * 0.02;
    }

    camera.lookAt(0, 0, 0);
  });

  const emissive = (accent: boolean) => (accent ? accentColor : coreColor);

  return (
    <group ref={group}>
      {/* Outer arc stack — the "diagram circle". */}
      {RINGS.map((ring, index) => (
        <mesh key={index} rotation={ring.tilt}>
          <torusGeometry args={[ring.radius, ring.tube, 12, 220, ring.arc]} />
          <meshStandardMaterial
            color={emissive(ring.accent)}
            emissive={emissive(ring.accent)}
            emissiveIntensity={preset.intensity * (ring.accent ? 1.5 : 1.05)}
            transparent
            opacity={ring.accent ? 0.75 : 0.95}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* Tick marks around the primary ring. */}
      {Array.from({ length: 72 }).map((_, index) => {
        const angle = (index / 72) * Math.PI * 2;
        const long = index % 6 === 0;
        return (
          <mesh
            key={`tick-${index}`}
            position={[Math.cos(angle) * 1.36, Math.sin(angle) * 1.36, 0]}
            rotation={[0, 0, angle]}
          >
            <boxGeometry args={[long ? 0.09 : 0.045, 0.006, 0.006]} />
            <meshStandardMaterial
              color={coreColor}
              emissive={coreColor}
              emissiveIntensity={preset.intensity * (long ? 1.6 : 0.7)}
              toneMapped={false}
            />
          </mesh>
        );
      })}

      {/* Segment bars on the outer band. */}
      {Array.from({ length: 28 }).map((_, index) => {
        const angle = (index / 28) * Math.PI * 2 + 0.11;
        const lit = index % 4 !== 0;
        return (
          <mesh
            key={`seg-${index}`}
            position={[Math.cos(angle) * 2.34, Math.sin(angle) * 2.34, 0]}
            rotation={[0, 0, angle + Math.PI / 2]}
          >
            <boxGeometry args={[0.16, 0.022, 0.004]} />
            <meshStandardMaterial
              color={lit ? accentColor : coreColor}
              emissive={lit ? accentColor : coreColor}
              emissiveIntensity={preset.intensity * (lit ? 1.4 : 0.35)}
              transparent
              opacity={lit ? 0.9 : 0.3}
              toneMapped={false}
            />
          </mesh>
        );
      })}

      {/* Inner wireframe lattice. */}
      <group ref={inner}>
        <mesh>
          <icosahedronGeometry args={[1, 2]} />
          <meshBasicMaterial color={coreColor} wireframe transparent opacity={0.28} toneMapped={false} />
        </mesh>
        <mesh>
          <icosahedronGeometry args={[0.62, 1]} />
          <meshBasicMaterial color={accentColor} wireframe transparent opacity={0.5} toneMapped={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.3, 32, 32]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive={coreColor}
            emissiveIntensity={preset.intensity * 1.9}
            toneMapped={false}
          />
        </mesh>
      </group>

      {/* Voice-reactive particle shell. */}
      <points ref={particles}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
            count={positions.length / 3}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          color={accentColor}
          size={0.016}
          sizeAttenuation
          transparent
          opacity={0.4}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>

      <pointLight position={[0, 0, 0]} color={coreColor} intensity={6} distance={9} />
    </group>
  );
}
