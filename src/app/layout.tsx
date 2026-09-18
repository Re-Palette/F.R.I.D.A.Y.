import type { Metadata, Viewport } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "F.R.I.D.A.Y.",
  description: "Personal Intelligence Operating System",
  appleWebApp: { capable: true, title: "FRIDAY", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  // Paints the installed window's chrome the same near-black as the app, so
  // there is no light seam around it.
  themeColor: "#050505",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-void text-fg">{children}</body>
    </html>
  );
}
