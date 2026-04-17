import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { User } from "@/api/entities";
import { useBranding } from "@/hooks/use-branding";
import { getSafeNextPathFromSearch, isSameAppLocation } from "@/lib/auth-navigation";
import { normalizePin } from "@/lib/pin-auth";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import PinPairPad from "@/components/auth/PinPairPad";
import { AlertTriangle, KeyRound, LoaderCircle, LogOut } from "lucide-react";

export default function ValidarPin() {
  const location = useLocation();
  const navigate = useNavigate();
  const { companyName, logoUrl, isResolved } = useBranding({ variant: "base" });
  const nextPath = useMemo(() => getSafeNextPathFromSearch(location.search), [location.search]);
  const [currentUser, setCurrentUser] = useState(null);
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const normalizedPin = normalizePin(pin);

  useEffect(() => {
    let mounted = true;

    async function loadContext() {
      try {
        const me = await User.me();
        if (!me) {
          if (!isSameAppLocation(createPageUrl("Login"), location.pathname, location.search, location.hash)) {
            navigate(createPageUrl("Login"), { replace: true });
          }
          return;
        }

        if (me.pin_required_reset === true) {
          const target = `${createPageUrl("DefinirPin")}?next=${encodeURIComponent(nextPath)}`;
          if (!isSameAppLocation(target, location.pathname, location.search, location.hash)) {
            navigate(target, { replace: true });
          }
          return;
        }

        if (User.isCurrentDeviceTrusted?.(me)) {
          if (!isSameAppLocation(nextPath, location.pathname, location.search, location.hash)) {
            navigate(nextPath, { replace: true });
          }
          return;
        }

        if (mounted) {
          setCurrentUser(me);
        }
      } catch (error) {
        if (mounted) {
          setErrorMessage(error?.message || "Não foi possível validar o dispositivo.");
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadContext();

    return () => {
      mounted = false;
    };
  }, [location.hash, location.pathname, location.search, navigate, nextPath]);

  const handleSelectDigit = (digit) => {
    setPin((current) => normalizePin(`${current}${digit}`));
  };

  const handleBackspace = () => {
    setPin((current) => current.slice(0, -1));
  };

  const handleClear = () => {
    setPin("");
  };

  async function handleLogout() {
    await User.logout?.();
    window.location.replace(createPageUrl("Login"));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (normalizedPin.length !== 6) {
      setErrorMessage("Informe os 6 dígitos do seu PIN.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      await User.verifyCurrentDevicePin?.({ pin: normalizedPin });
      window.location.replace(nextPath);
    } catch (error) {
      setErrorMessage(error?.message || "Não foi possível validar o PIN.");
      setIsSubmitting(false);
      setPin("");
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-slate-800 bg-slate-900 text-white">
          <CardContent className="p-8 text-center">
            <LoaderCircle className="w-10 h-10 mx-auto animate-spin text-orange-400" />
            <h1 className="mt-4 text-2xl font-semibold">Validando dispositivo</h1>
            <p className="mt-2 text-sm text-slate-300">
              Estamos confirmando se este acesso precisa do PIN neste dispositivo.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

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
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.25em] text-blue-300">Dispositivo novo</p>
            <h1 className="mt-3 text-3xl font-brand text-white">Validar PIN</h1>
            <p className="mt-3 text-sm text-slate-300">
              {currentUser?.full_name || currentUser?.email || "Sua conta"} precisa confirmar o PIN antes de liberar este dispositivo.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label className="text-sm font-medium text-slate-200">Email</label>
              <Input value={currentUser?.email || ""} disabled className="mt-2 border-slate-700 bg-slate-900 text-white" />
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
              <div className="mb-4 flex items-center gap-2 text-slate-200">
                <KeyRound className="h-4 w-4 text-blue-300" />
                <span className="text-sm font-medium">Digite seu PIN</span>
              </div>
              <PinPairPad
                value={pin}
                onInputDigit={handleSelectDigit}
                onBackspace={handleBackspace}
                onClear={handleClear}
                disabled={isSubmitting}
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

            <Button type="submit" disabled={isSubmitting} className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white">
              {isSubmitting ? <LoaderCircle className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}
              {isSubmitting ? "Validando..." : "Validar PIN"}
            </Button>

            <Button type="button" variant="outline" onClick={handleLogout} className="w-full border-slate-700 bg-transparent text-white hover:bg-slate-800">
              <LogOut className="w-4 h-4 mr-2" />
              Sair
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
