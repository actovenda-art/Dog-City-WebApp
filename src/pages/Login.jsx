import React, { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { User } from "@/api/entities";
import { useBranding } from "@/hooks/use-branding";
import { getSafeNextPathFromSearch } from "@/lib/auth-navigation";
import { normalizePin } from "@/lib/pin-auth";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import PinPairPad from "@/components/auth/PinPairPad";
import { AlertTriangle, LoaderCircle, LogIn, Mail, ShieldCheck } from "lucide-react";

const APP_SITE_URL = import.meta.env.VITE_SITE_URL;

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
  const [pin, setPin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const normalizedPin = normalizePin(pin);

  const handleSelectDigit = (digit) => {
    setPin((current) => normalizePin(`${current}${digit}`));
  };

  const handleBackspace = () => {
    setPin((current) => current.slice(0, -1));
  };

  const handleClear = () => {
    setPin("");
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

    if (normalizedPin.length !== 6) {
      setErrorMessage("Informe os 6 dígitos do PIN.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      await User.signInWithPin?.({
        email: email.trim().toLowerCase(),
        pin: normalizedPin,
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
      setPin("");
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(37,99,235,0.10),transparent_28%),radial-gradient(circle_at_70%_90%,rgba(14,165,233,0.08),transparent_25%)]" />

      <div className="relative mx-auto grid min-h-screen max-w-[1500px] lg:grid-cols-[minmax(360px,0.88fr)_minmax(520px,1.12fr)]">
        <aside className="relative hidden overflow-hidden bg-gradient-to-br from-blue-600 via-blue-600 to-blue-700 px-12 py-14 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full border border-white/15" />
          <div className="pointer-events-none absolute -bottom-28 -left-20 h-96 w-96 rounded-full bg-white/5" />
          <div className="pointer-events-none absolute bottom-24 right-12 h-24 w-24 rounded-full border border-white/10" />

          <div className="relative">
            <div className="flex h-24 w-24 items-center justify-center rounded-[28px] border border-white/70 bg-white p-2 shadow-xl shadow-blue-950/20">
              <img
                src={isResolved && logoUrl ? logoUrl : "/dog-city-brand.png"}
                alt={companyName}
                className="h-full w-full object-contain"
              />
            </div>
            <p className="mt-10 text-xs font-semibold uppercase tracking-[0.28em] text-blue-100">Sistema de gestão</p>
            <h1 className="mt-3 max-w-lg font-brand text-5xl leading-none tracking-wide text-white xl:text-6xl">
              {companyName}
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-blue-100">
              Operação, atendimento e gestão reunidos em um ambiente seguro e organizado.
            </p>
          </div>

          <div className="relative flex items-center gap-3 border-t border-white/15 pt-6 text-sm text-blue-100">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
              <ShieldCheck className="h-4 w-4" />
            </span>
            Acesso protegido para a equipe Dog City Brasil.
          </div>
        </aside>

        <main className="flex min-h-screen items-center justify-center px-3 py-5 sm:px-8 sm:py-8 lg:px-12">
          <Card className="w-full max-w-[480px] rounded-[26px] border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.12)] sm:rounded-[30px]">
            <CardContent className="p-5 sm:p-7">
              <div className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-4 lg:hidden">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
                  <img
                    src={isResolved && logoUrl ? logoUrl : "/dog-city-brand.png"}
                    alt={companyName}
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-600">Sistema de gestão</p>
                  <p className="truncate font-brand text-2xl tracking-wide text-slate-950">{companyName}</p>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-blue-600">Acesso seguro</p>
                <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Entre na sua conta</h2>
                <p className="mt-1.5 text-sm text-slate-500">
                  Use seu email e PIN ou continue com a conta Google.
                </p>
              </div>

              <form onSubmit={handlePinLogin} className="mt-5 space-y-4">
            {wasRecovered && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-blue-700">
                Encontramos um estado antigo de sessão neste navegador e limpamos o acesso local para recuperar o login. Entre novamente para continuar.
              </div>
            )}

            {isBlocked && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-700">
                Este acesso foi cancelado ou desativado. Fale com a administração central para liberar uma nova vinculação.
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-700">Email</label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-11 rounded-xl border-slate-200 bg-white pl-9 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:ring-blue-500"
                  placeholder="email@dogcitybrasil.com.br"
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
              <div className="mb-3 flex items-center gap-2 text-slate-700">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                <span className="text-xs font-semibold">Senha PIN numérica</span>
              </div>
              <PinPairPad
                value={pin}
                onInputDigit={handleSelectDigit}
                onBackspace={handleBackspace}
                onClear={handleClear}
                disabled={isSubmitting || isGoogleSubmitting}
                variant="light"
              />
            </div>

            {errorMessage && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              </div>
            )}

            <Button type="submit" disabled={isSubmitting || isGoogleSubmitting} className="h-11 w-full rounded-xl bg-blue-600 font-semibold text-white shadow-sm hover:bg-blue-700">
              {isSubmitting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
              {isSubmitting ? "Entrando..." : "Entrar com email e PIN"}
            </Button>

            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                <span className="bg-white px-3">ou</span>
              </div>
            </div>

            <Button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isSubmitting || isGoogleSubmitting}
              variant="outline"
              className="h-11 w-full rounded-xl border-slate-200 bg-white font-semibold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            >
              {isGoogleSubmitting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <GoogleIcon />}
              <span className="ml-2">{isGoogleSubmitting ? "Redirecionando..." : "Entrar com conta Google"}</span>
            </Button>

            {!User.isEnabled?.() && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-700">
                Este ambiente está em modo local/mock. O login real só funciona com Supabase configurado.
              </div>
            )}
              </form>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
