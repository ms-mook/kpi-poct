import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KPI Dashboard - POCT Center",
  description: "สถิติการใช้งานเครื่อง POCT (Glucose, Blood gas) รายหอผู้ป่วย และตัวชี้วัดคุณภาพ รพ.ศรีนครินทร์",
};

// Applied before first paint so a returning visitor's saved theme shows
// immediately. Same storage key as kpi-dashboard, so both sites share it.
const SET_THEME_BEFORE_PAINT = `
try {
  var t = localStorage.getItem("kpi-theme");
  if (t) document.documentElement.setAttribute("data-theme", t);
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className="h-full antialiased" data-theme="ocean-dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: SET_THEME_BEFORE_PAINT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <div className="ambient-bg" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
