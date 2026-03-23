import React, { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { User } from "@/api/entities";
import { useBranding } from "@/hooks/use-branding";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, LoaderCircle, LogIn } from "lucide-react";

const APP_SITE_URL = import.meta.env.VITE_SITE_URL;

function getSafeNextPath(search) {
  const params = new URLSearchParams(search);
  const next = params.get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return createPageUrl("Dev_Dashboard");
  }
  return next;
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.8-6-6.2s2.7-6.2 6-6.2c1.9 0 3.2.8 4 1.5l2.7-2.6C17 2.8 14.8 2 12 2 6.9 2 2.8 6.4 2.8 11.8S6.9 21.6 12 21.6c6.9 0 9.1-5 9.1-7.6 0-.5-.1-.9-.2-1.3H12z" />
      <path fill="#34A853" d="M2.8 11.8c0 5.4 4.1 9.8 9.2 9.8 2.8 0 5-1 6.7-2.7l-3.1-2.4c-.8.6-1.9 1-3.6 1-2.8 0-5.2-1.9-6-4.6l-3.2 2.5c1.5 3.1 4.7 5.2 8.9 5.2z" opacity=".001" />
      <path fill="#FBBC05" d="M4 7.2l2.6 1.9c.7-2.1 2.6-3.6 5.4-3.6 1.9 0 3.2.8 4 1.5l2.7-2.6C17 2.8 14.8 2 12 2 8 2 4.6 4.3 3 7.7L4 7.2z" />
      <path fill="#4285F4" d="M12 21.6c2.7 0 5-.9 6.6-2.5l-3.1-2.4c-.8.6-1.9 1-3.5 1-3.3 0-6-2.8-6-6.2 0-1 .2-1.9.6-2.8L3.4 6.2C2.9 7.3 2.8 8.5 2.8 9.8 2.8 15.2 6.9 19.6 12 19.6z" opacity=".001" />
    </svg>
  );
}

export default function Login() {
  const location = useLocation();
  const { companyName, logoUrl } = useBranding();
  const nextPath = useMemo(() => getSafeNextPath(location.search), [location.search]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleGoogleLogin = async () => {
    if (!User.isEnabled?.()) {
      setErrorMessage("Supabase nao configurado para autenticacao neste ambiente.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      await User.signInWithGoogle({
        redirectTo: `${(APP_SITE_URL || window.location.origin).replace(/\/+$/, "")}${createPageUrl("AuthCallback")}`,
        nextPath,
      });
    } catch (error) {
      console.error("Erro ao iniciar login Google:", error);
      setErrorMessage(error?.message || "Nao foi possivel iniciar o login com Google.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff7ed,_#f8fafc_55%,_#e2e8f0)] flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-orange-200 bg-white/95 shadow-2xl shadow-orange-100">
        <CardContent className="p-8">
          <div className="flex flex-col items-center text-center">
            <img src={logoUrl} alt={companyName} className="w-20 h-20 object-contain" />
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.25em] text-orange-500">Acesso</p>
            <h1 className="mt-3 text-3xl font-brand text-slate-900">{companyName}</h1>
            <p className="mt-3 text-sm text-slate-600">
              Entre com sua conta Google para acessar o ambiente da empresa.
            </p>
          </div>

          <div className="mt-8 space-y-4">
            <Button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isSubmitting}
              className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white"
            >
              {isSubmitting ? (
                <LoaderCircle className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <GoogleIcon />
              )}
              <span className="ml-2">{isSubmitting ? "Redirecionando..." : "Entrar com Google"}</span>
            </Button>

            {!User.isEnabled?.() && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                Este ambiente esta em modo local/mock. O login Google so funciona com Supabase configurado.
              </div>
            )}

            {errorMessage && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-500">
            <LogIn className="w-4 h-4" />
            <span>OAuth gerenciado por Supabase Auth</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
