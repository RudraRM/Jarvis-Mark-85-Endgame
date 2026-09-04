"use client";

import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { Suspense } from "react";
import JarvisCore, { type CoreProps } from "./JarvisCore";

/**
 * Canvas host for the interactive core. The WebGL canvas itself is the focusable,
 * labelled control — screen readers announce it as an interactive node and the
 * keyboard bindings in JarvisCore listen on this exact element.
 */
export default function CoreCanvas(props: CoreProps) {
  return (
    <div className="absolute inset-0">
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        camera={{ position: [0, 0, 8.6], fov: 42 }}
        onCreated={({ gl }) => {
          const canvas = gl.domElement;
          canvas.tabIndex = 0;
          canvas.setAttribute("role", "application");
          canvas.setAttribute("aria-label", "Interactive Jarvis Core Node");
          canvas.setAttribute("aria-live", "polite");
          canvas.setAttribute(
            "aria-description",
            "Drag to rotate. Arrow keys or W A S D rotate, Q and E roll, plus and minus zoom, 0 resets.",
          );
          canvas.style.outline = "none";
          canvas.addEventListener("focus", () => {
            canvas.style.boxShadow = "0 0 0 2px rgb(6 182 212 / 0.9)";
          });
          canvas.addEventListener("blur", () => {
            canvas.style.boxShadow = "none";
          });
          canvas.addEventListener("contextmenu", (event) => event.preventDefault());
        }}
      >
        <color attach="background" args={["#03070d"]} />
        <fog attach="fog" args={["#03070d", 8, 16]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[4, 6, 8]} intensity={0.6} />
        <Suspense fallback={null}>
          <JarvisCore {...props} />
        </Suspense>
        {/* Bloom is what sells the holographic glow; keep the threshold high so
            only the emissive geometry blooms, not the whole frame. */}
        <EffectComposer>
          <Bloom intensity={1.15} luminanceThreshold={0.22} luminanceSmoothing={0.35} mipmapBlur radius={0.72} />
          <Vignette eskil={false} offset={0.22} darkness={0.85} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
