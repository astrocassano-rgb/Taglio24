import { AlertCircle, Mail, ShieldAlert } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AbbonamentoScadutoPage() {
  return (
    <div className="relative min-h-screen flex items-center justify-center bg-slate-950 px-4 py-12 overflow-hidden">
      {/* Sfondo con radial gradient premium ed effetto Apple OLED */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(circle at 50% 30%, rgba(6,182,212,0.15), transparent 50%), radial-gradient(circle at 50% 80%, rgba(139,92,246,0.1), transparent 60%)",
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Glassmorphism Card */}
        <div className="rounded-3xl border border-slate-800/80 bg-slate-900/40 p-8 text-center shadow-2xl backdrop-blur-xl">
          {/* Cerchio icona animato o luminoso */}
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-400 shadow-lg shadow-red-500/5">
            <ShieldAlert className="h-10 w-10" />
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight text-slate-50 mb-3">
            Abbonamento Scaduto
          </h1>

          <p className="text-sm text-slate-400 leading-relaxed mb-8">
            {"L'accesso ai servizi di questo salone è temporaneamente sospeso a causa della scadenza o della mancata attivazione dell'abbonamento alla piattaforma."}
          </p>

          {/* Dettagli operativi */}
          <div className="rounded-2xl bg-slate-950/60 border border-slate-800/60 p-4 text-left mb-8 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-violet-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-slate-300">Sei il gestore del salone?</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {"Puoi rinnovare la licenza accedendo al pannello di controllo globale o contattando l'assistenza commerciale."}
                </p>
              </div>
            </div>
          </div>

          {/* Azioni */}
          <div className="flex flex-col gap-3">
            <a
              href="mailto:info@dogwash24.it?subject=Rinnovo%20Abbonamento%20Salone"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl font-medium transition-colors bg-blue-500 text-white hover:bg-blue-400 active:bg-blue-600 w-full shadow-lg shadow-cyan-500/10 hover:shadow-cyan-500/20 text-base"
            >
              <Mail className="h-4 w-4" />
              {"Contatta il Supporto"}
            </a>
            
            <a
              href="https://app.dogwash24.it/superadmin"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl font-medium transition-colors bg-transparent text-slate-400 hover:text-slate-200 w-full text-xs"
            >
              {"Accedi come Superadmin"}
            </a>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-slate-600 mt-6 tracking-wider uppercase font-semibold">
          Powered by DogWash24 &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
