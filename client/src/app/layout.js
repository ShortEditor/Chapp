import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SocketProvider } from "@/context/SocketContext";
import PwaManager from "@/components/PwaManager";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Chapp — Privacy-First Realtime Messaging",
  description: "A secure, privacy-focused realtime messaging platform where users own their conversations. No permanent server storage.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Chapp"
  }
};

export const viewport = {
  themeColor: '#0a0a0c',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full dark antialiased`}
      style={{ colorScheme: 'dark' }}
    >
      <body className="min-h-full bg-[#0a0a0c] text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-200 flex flex-col overflow-x-hidden">
        <SocketProvider>
          <PwaManager />
          {children}
        </SocketProvider>
      </body>
    </html>
  );
}
