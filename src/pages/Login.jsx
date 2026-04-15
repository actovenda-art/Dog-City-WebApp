import React, { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { User } from "@/api/entities";
import { useBranding } from "@/hooks/use-branding";
import { getSafeNextPathFromSearch } from "@/lib/auth-navigation";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import PinPairPad from "@/components/auth/PinPairPad";
import { AlertTriangle, LoaderCircle, LogIn, Mail, ShieldCheck } from "lucide-react";

const APP_SITE_URL = import.meta.env.VITE_SITE_URL;

function shufflePairs() {
  const digits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
  for (let index = digits.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [digits[index], digits[randomIndex]] = [digits[randomIndex], digits[index]];
  }

  const result = [];
  for (let index = 0; index < digits.length; index += 2) {
    result.push([digits[index], digits[index + 1]]);
  }
  return result;
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.8-6-6.2s2.7-6.2 6-6.2c1.9 0 3.2.8 4 1.5l2.7-2.6C17 2.8 14.8 2 12 2 6.9 2 2.8 6.4 2.8 11.8S6.9 21.6 12 21.6c6.9 0 9.1-5 9.1-7.6 0-.5-.1-.9-.2-1.3H12z" />
    </svg>
  );
}

export default function Login() {
  const location = useLocation();
  const navigate = useNavigate();
  const { companyName, logoUrl, isResolved } = useBranding({ variant: "base" });
  const nextPath = useMemo(() => getSafeNextPathFromSearch(location.search), [location.search]);
  const isBlocked = useMemo(() => new URLSearchParams(location.search).get("blocked") === "1", [location.search]);
  const wasRecovered = useMemo(() => new URLSearchParams(location.search).get("recovered") === "1", [location.search]);
  const inviteToken = useMemo(() => new URLSearchParams(location.search).get("invite"), [location.search]);
  const [email, setEmail] = useState("");
  const [pairs, setPairs] = useState(() => shufflePairs());
  const [selectedEntries, setSelectedEntries] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const selectedPairs = useMemo(() => selectedEntries.map((entry) => entry.pair), [selectedEntries]);
  const selectedDigits = useMemo(() => selectedEntries.map((entry) => entry.digit), [selectedEntries]);

  const handleSelectDigit = (pair, digit) => {
    setSelectedEntries((current) => current.length >= 6 ? current : [...current, { pair, digit }]);
  };

  const handleBackspace = () => {
    setSelectedEntries((current) => current.slice(0, -1));
  };

  const handleShuffle = () => {
    setPairs(shufflePairs());
  };

  const handleGoogleLogin = async () => {
    if (!User.isEnabled?.()) {
      setErrorMessage("Supabase não configurado para autenticação neste ambiente.");
      return;
    }

    setIsGoogleSubmitting(true);
    setErrorMessage("");

    try {
      await User.signInWithGoogle({
        redirectTo: `${(APP_SITE_URL || window.location.origin).replace(/\/+$/, "")}${createPageUrl("AuthCallback")}`,
        nextPath,
      });
    } catch (error) {
      console.error("Erro ao iniciar login Google:", error);
      setErrorMessage(error?.message || "Não foi possível iniciar o login com Google.");
      setIsGoogleSubmitting(false);
    }
  };

  const handlePinLogin = async (event) => {
    event.preventDefault();

    if (!email.trim()) {
      setErrorMessage("Informe o email para continuar.");
      return;
    }

    if (selectedDigits.length !== 6) {
      setErrorMessage("Selecione os 6 dígitos correspondentes ao PIN.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      await User.signInWithPinPairs?.({
        email: email.trim().toLowerCase(),
        selectedPairs,
        selectedDigits,
        pin: selectedDigits.join(""),
      });

      const currentUser = await User.me();
      const buildCompletePath = () => {
        const params = new URLSearchParams();
        if (inviteToken) params.set("invite", inviteToken);
        if (nextPath) params.set("next", nextPath);
        return `${createPageUrl("CompletarCadastro")}${params.toString() ? `?${params.toString()}` : ""}`;
      };

      if (currentUser?.onboarding_status === "pendente") {
        navigate(buildCompletePath(), { replace: true });
        return;
      }

      if (currentUser?.pin_required_reset === true) {
        const params = new URLSearchParams();
        if (nextPath) params.set("next", nextPath);
        navigate(`${createPageUrl("DefinirPin")}${params.toString() ? `?${params.toString()}` : ""}`, { replace: true });
        return;
      }

      navigate(nextPath, { replace: true });
    } catch (error) {
      console.error("Erro ao autenticar com PIN:", error);
      setErrorMessage(error?.message || "Não foi possível autenticar com email e PIN.");
      setIsSubmitting(false);
      setSelectedEntries([]);
      setPairs(shufflePairs());
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#0f172a,_#111827_55%,_#020617)] flex items-center justify-center p-4">
      <Card className="w-full max-w-lg border-slate-700 bg-slate-950 text-white shadow-2xl shadow-slate-950/60">
        <CardContent className="p-8">
          <div className="flex flex-col items-center text-center">
            {isResolved && logoUrl ? (
              <img src={logoUrl} alt={companyName} className="w-20 h-20 object-contain" />
            ) : (
              <div className="h-20 w-20 rounded-3xl border border-slate-700 bg-white/5" />
            )}
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.25em] text-blue-300">Acesso</p>
            <h1 className="mt-3 text-3xl font-brand text-white">{companyName}</h1>
            <p className="mt-3 text-sm text-slate-300">
              Entre com email e PIN ou use sua conta Google abaixo.
            </p>
          </div>

          <form onSubmit={handlePinLogin} className="mt-8 space-y-5">
            {wasRecovered && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
                Encontramos um estado antigo de sessao neste navegador e limpamos o acesso local para recuperar o login. Entre novamente para continuar.
              </div>
            )}

            {isBlocked && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                Este acesso foi cancelado ou desativado. Fale com a administração central para liberar uma nova vinculação.
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-slate-200">Login</label>
              <div className="relative mt-2">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="border-slate-700 bg-slate-900 pl-9 text-white placeholder:text-slate-500"
                  placeholder="email@dogcitybrasil.com.br"
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
              <div className="mb-4 flex items-center gap-2 text-slate-200">
                <ShieldCheck className="h-4 w-4 text-blue-300" />
                <span className="text-sm font-medium">Senha PIN em pares aleatorios</span>
              </div>
              <PinPairPad
                pairs={pairs}
                selectedCount={selectedEntries.length}
                onSelectDigit={handleSelectDigit}
                onBackspace={handleBackspace}
                onShuffle={handleShuffle}
                disabled={isSubmitting || isGoogleSubmitting}
              />
            </div>

            {errorMessage && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              </div>
            )}

            <Button type="submit" disabled={isSubmitting || isGoogleSubmitting} className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white">
              {isSubmitting ? <LoaderCircle className="w-4 h-4 mr-2 animate-spin" /> : <LogIn className="w-4 h-4 mr-2" />}
              {isSubmitting ? "Entrando..." : "Entrar com email e PIN"}
            </Button>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-800" />
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-[0.2em] text-slate-500">
                <span className="bg-slate-950 px-3">ou</span>
              </div>
            </div>

            <Button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isSubmitting || isGoogleSubmitting}
              className="w-full h-12 bg-white text-slate-900 hover:bg-slate-100"
            >
              {isGoogleSubmitting ? <LoaderCircle className="w-4 h-4 mr-2 animate-spin" /> : <GoogleIcon />}
              <span className="ml-2">{isGoogleSubmitting ? "Redirecionando..." : "Entrar com conta Google"}</span>
            </Button>

            {!User.isEnabled?.() && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                Este ambiente esta em modo local/mock. O login real so funciona com Supabase configurado.
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
