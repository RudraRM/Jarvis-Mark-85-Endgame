import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "J.A.R.V.I.S. · Mark 55",
  description:
    "A cinematic, voice-driven Jarvis assistant HUD: NVIDIA Parakeet ASR, the Hermes Web Fish agent, and an interactive 3D reactor core.",
};

export const viewport: Viewport = {
  themeColor: "#03070d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="hud-grain">{children}</body>
    </html>
  );
}
