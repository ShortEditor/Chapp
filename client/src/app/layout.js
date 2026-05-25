import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import "./globals.css";
import { SocketProvider } from "@/context/SocketContext";
import PwaManager from "@/components/PwaManager";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
      className={`${plusJakartaSans.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[#f0f2f5] text-[#202124] flex flex-col overflow-x-hidden">
        <SocketProvider>
          <PwaManager />
          {children}
        </SocketProvider>
      </body>
    </html>
  );
}
