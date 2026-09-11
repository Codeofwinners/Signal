import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Signal — Consumer AI Visibility",
  description:
    "Manual consumer AI visibility tracking for brands and SEO teams.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
