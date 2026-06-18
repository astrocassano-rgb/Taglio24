import * as React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppShell>{children}</AppShell>
      <PwaInstallPrompt />
    </>
  );
}

