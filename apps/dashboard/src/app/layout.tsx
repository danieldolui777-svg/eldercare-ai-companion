import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { AuthGate } from "@/components/AuthGate";

export const metadata: Metadata = { title: "Eldercare Dashboard" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-gray-50 min-h-screen">
        <AuthGate>
          <Nav />
          <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
        </AuthGate>
      </body>
    </html>
  );
}
