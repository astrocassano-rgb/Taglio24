"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "./ui/button";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Detect iOS since it doesn't support beforeinstallprompt
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    
    // Check if already installed
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;

    if (isStandalone) {
      return; // Already installed
    }

    if (isIosDevice) {
      setIsIOS(true);
      // Optional: show a custom prompt for iOS after a delay
      const timer = setTimeout(() => setIsVisible(true), 3000);
      return () => clearTimeout(timer);
    }

    // Android / Desktop handling
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === "accepted") {
      console.log("PWA installata");
      setIsVisible(false);
      setDeferredPrompt(null);
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 p-4 bg-slate-900 border border-slate-700 shadow-2xl rounded-2xl flex items-center gap-4 animate-in slide-in-from-bottom-5">
      <div className="flex-shrink-0 w-12 h-12 bg-cyan-500/20 rounded-xl flex items-center justify-center text-cyan-400">
        <Download className="w-6 h-6" />
      </div>
      
      <div className="flex-1">
        <h4 className="font-semibold text-slate-100 text-sm">Installa Taglio24</h4>
        {isIOS ? (
          <p className="text-xs text-slate-400">Tocca Condividi e &quot;Aggiungi a Home&quot;</p>
        ) : (
          <p className="text-xs text-slate-400">Accedi più velocemente all&apos;App</p>
        )}
      </div>

      {!isIOS && (
        <Button onClick={handleInstallClick} className="bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs px-3 py-1.5 h-auto">
          Installa
        </Button>
      )}

      <button onClick={() => setIsVisible(false)} className="p-2 text-slate-500 hover:text-slate-300">
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}
