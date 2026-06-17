"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";

function NuovaPrenotazioneRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = searchParams?.toString() ? `?${searchParams.toString()}` : "";
    router.replace(`/prenota${params}` as Route);
  }, [router, searchParams]);

  return (
    <div className="text-sm text-slate-400 text-center py-10">
      Reindirizzamento in corso...
    </div>
  );
}

export default function NuovaPrenotazionePage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-400 text-center py-10">Caricamento...</div>}>
      <NuovaPrenotazioneRedirect />
    </Suspense>
  );
}
