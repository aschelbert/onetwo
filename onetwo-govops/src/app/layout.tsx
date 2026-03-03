import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ONE two — Admin Console",
  description: "ONE two GovOps Admin Console",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
