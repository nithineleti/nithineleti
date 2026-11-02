import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "AgentX | Voice agents for accountable business conversations",
    template: "%s | AgentX",
  },
  description:
    "AgentX helps businesses design voice agents for approved answers, consent-first lead capture and human handoff.",
  applicationName: "AgentX",
  keywords: ["voice agents", "AI receptionist", "lead capture", "business automation"],
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "AgentX",
    title: "AgentX | Voice agents for accountable business conversations",
    description: "Turn business calls into clear, consent-first next steps.",
  },
  twitter: {
    card: "summary",
    title: "AgentX | Voice agents for accountable business conversations",
    description: "Turn business calls into clear, consent-first next steps.",
  },
  icons: {
    icon: "/agentx-symbol.png",
    shortcut: "/agentx-symbol.png",
    apple: "/agentx-symbol.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
