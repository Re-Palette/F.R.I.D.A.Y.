import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "F.R.I.D.A.Y.",
    short_name: "FRIDAY",
    description: "Personal Intelligence Operating System",
    start_url: "/",
    // No browser chrome: installed from Chrome it opens as its own window,
    // which is also what lets it sit open in the background listening for a
    // wake word later on.
    display: "standalone",
    background_color: "#050505",
    theme_color: "#050505",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
