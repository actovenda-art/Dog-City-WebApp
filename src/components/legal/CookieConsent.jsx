import { useEffect, useState } from "react";
import { Cookie, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { createPageUrl } from "@/utils";
import { getPrivacyPreferences, savePrivacyPreferences } from "@/lib/privacy-preferences";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferences, setPreferences] = useState(false);

  useEffect(() => {
    setVisible(!getPrivacyPreferences());

    const openSettings = () => {
      setPreferences(getPrivacyPreferences()?.preferences === true);
      setSettingsOpen(true);
      setVisible(true);
    };

    window.addEventListener("dogcity:open-privacy-preferences", openSettings);
    return () => window.removeEventListener("dogcity:open-privacy-preferences", openSettings);
  }, []);

  function persist(nextPreferences) {
    savePrivacyPreferences({ preferences: nextPreferences });
    setVisible(false);
    setSettingsOpen(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] p-3 sm:p-5">
      <section
        role="dialog"
        aria-modal="false"
        aria-label="Preferências de cookies"
        className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_65px_rgba(15,23,42,0.22)]"
      >
        <div className="flex items-start gap-3 p-4 sm:p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <Cookie className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-950">Privacidade e armazenamento no navegador</h2>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  Usamos recursos estritamente necessários para autenticação, segurança e funcionamento. Com sua escolha, também podemos lembrar preferências visuais.
                </p>
              </div>
              {getPrivacyPreferences() ? (
                <button type="button" aria-label="Fechar preferências" onClick={() => setVisible(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            {settingsOpen ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-700" />
                      <span className="text-sm font-semibold text-slate-900">Estritamente necessários</span>
                    </div>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Sempre ativos</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">Mantêm login, segurança, unidade ativa e a sua escolha de privacidade.</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="h-4 w-4 text-blue-700" />
                      <span className="text-sm font-semibold text-slate-900">Preferências</span>
                    </div>
                    <Switch checked={preferences} onCheckedChange={setPreferences} aria-label="Permitir cookies de preferências" />
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">Lembra ajustes visuais, como o estado da barra lateral. Não usamos cookies de publicidade.</p>
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Link to={createPageUrl("Cookies")} className="text-xs font-medium text-blue-700 hover:underline">
                Ver Política de Cookies
              </Link>
              <div className="flex flex-col gap-2 sm:flex-row">
                {settingsOpen ? (
                  <Button type="button" variant="outline" className="rounded-xl" onClick={() => persist(preferences)}>
                    Salvar preferências
                  </Button>
                ) : (
                  <Button type="button" variant="outline" className="rounded-xl" onClick={() => setSettingsOpen(true)}>
                    Configurar
                  </Button>
                )}
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => persist(false)}>
                  Somente necessários
                </Button>
                <Button type="button" className="rounded-xl bg-blue-600 text-white hover:bg-blue-700" onClick={() => persist(true)}>
                  Aceitar preferências
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
