import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { User } from "@/api/entities";
import { useBranding } from "@/hooks/use-branding";
import { getSafeNextPathFromSearch } from "@/lib/auth-navigation";
import { normalizePin, validatePin } from "@/lib/pin-auth";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, KeyRound, LoaderCircle, LogOut } from "lucide-react";

export default function DefinirPin() {
  const location = useLocation();
  const navigate = useNavigate();
  const { companyName, logoUrl, isResolved } = useBranding({ variant: "base" });
  const nextPath = useMemo(() => getSafeNextPathFromSearch(location.search), [location.search]);
  const [currentUser, setCurrentUser] = useState(null);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadCurrentUser() {
      try {
        const me = await User.me();
        if (!me) {
          navigate(createPageUrl("Login"), { replace: true });
          return;
        }

        if (me.onboarding_status === "pendente") {
          navigate(`${createPageUrl("CompletarCadastro")}?next=${encodeURIComponent(nextPath)}`, { replace: true });
          return;
        }

        if (me.pin_required_reset !== true) {
          navigate(nextPath, { replace: true });
          return;
        }

        if (mounted) {
          setCurrentUser(me);
        }
      } catch (error) {
        if (mounted) {
          setErrorMessage(error?.message || "Nao foi possivel validar sua sessao.");
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadCurrentUser();

    return () => {
      mounted = false;
    };
  }, [navigate, nextPath]);

  async function handleLogout() {
    await User.logout?.();
    window.location.replace(createPageUrl("Login"));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const normalizedPin = normalizePin(pin);
    const normalizedConfirmPin = normalizePin(confirmPin);
    const validationError = validatePin(normalizedPin);

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    if (normalizedPin !== normalizedConfirmPin) {
      setErrorMessage("A confirmacao nao corresponde ao PIN informado.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      await User.setPin?.({ pin: normalizedPin });
      window.location.replace(nextPath);
    } catch (error) {
      setErrorMessage(error?.message || "Nao foi possivel definir o PIN.");
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-slate-800 bg-slate-900 text-white">
          <CardContent className="p-8 text-center">
            <LoaderCircle className="w-10 h-10 mx-auto animate-spin text-orange-400" />
            <h1 className="mt-4 text-2xl font-semibold">Preparando acesso</h1>
            <p className="mt-2 text-sm text-slate-300">
              Estamos conferindo se este usuario precisa definir um novo PIN.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff7ed,_#f8fafc_55%,_#e2e8f0)] flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-orange-200 bg-white/95 shadow-2xl shadow-orange-100">
        <CardContent className="p-8">
          <div className="flex flex-col items-center text-center">
            {isResolved && logoUrl ? (
              <img src={logoUrl} alt={companyName} className="w-20 h-20 object-contain" />
            ) : (
              <div className="h-20 w-20 rounded-3xl border border-orange-100 bg-white/90 shadow-sm" />
            )}
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.25em] text-orange-500">Seguranca</p>
            <h1 className="mt-3 text-3xl font-brand text-slate-900">Definir PIN</h1>
            <p className="mt-3 text-sm text-slate-600">
              {currentUser?.full_name ? `${currentUser.full_name},` : "Voce"} este acesso precisa de um novo PIN antes de continuar.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <Label>Nova senha</Label>
              <Input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                value={pin}
                onChange={(event) => setPin(normalizePin(event.target.value))}
                className="mt-2 text-center text-lg tracking-[0.4em]"
                placeholder="000000"
                maxLength={6}
              />
            </div>

            <div>
              <Label>Confirme</Label>
              <Input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                value={confirmPin}
                onChange={(event) => setConfirmPin(normalizePin(event.target.value))}
                className="mt-2 text-center text-lg tracking-[0.4em]"
                placeholder="000000"
                maxLength={6}
              />
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              <div className="flex items-start gap-2">
                <KeyRound className="w-4 h-4 mt-0.5" />
                <span>O PIN deve conter 6 numeros e nao pode ser sequencial.</span>
              </div>
            </div>

            {errorMessage && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              </div>
            )}

            <Button type="submit" disabled={isSubmitting} className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white">
              {isSubmitting ? (
                <LoaderCircle className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <KeyRound className="w-4 h-4 mr-2" />
              )}
              {isSubmitting ? "Salvando..." : "Salvar novo PIN"}
            </Button>

            <Button type="button" variant="outline" onClick={handleLogout} className="w-full">
              <LogOut className="w-4 h-4 mr-2" />
              Sair
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
