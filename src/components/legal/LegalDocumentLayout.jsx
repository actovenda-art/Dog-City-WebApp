import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import PropTypes from "prop-types";
import { Button } from "@/components/ui/button";
import LegalLinks from "@/components/legal/LegalLinks";
import { privacyContact } from "@/lib/privacy-preferences";

export function LegalSection({ title, children }) {
  return (
    <section className="border-t border-slate-100 pt-6 first:border-0 first:pt-0">
      <h2 className="text-lg font-semibold tracking-tight text-slate-950">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-7 text-slate-600">{children}</div>
    </section>
  );
}

export function LegalList({ children }) {
  return <ul className="list-disc space-y-1 pl-5 marker:text-blue-500">{children}</ul>;
}

export default function LegalDocumentLayout({ eyebrow, title, summary, version, children }) {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#eff6ff_0%,#f8fafc_230px,#f8fafc_100%)] px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <Button type="button" variant="ghost" className="-ml-3 mb-4 rounded-xl text-slate-600" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>

        <article className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_22px_70px_rgba(15,23,42,0.08)]">
          <header className="border-b border-slate-100 bg-gradient-to-br from-blue-50 via-white to-emerald-50 px-5 py-7 sm:px-9 sm:py-10">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
              <ShieldCheck className="h-4 w-4" />
              {eyebrow}
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">{summary}</p>
            <p className="mt-4 text-xs text-slate-500">Versão {version} • última atualização em 30 de julho de 2026</p>
          </header>

          <div className="space-y-7 px-5 py-7 sm:px-9 sm:py-9">{children}</div>

          <footer className="border-t border-slate-100 bg-slate-50 px-5 py-5 sm:px-9">
            <p className="text-center text-xs leading-5 text-slate-500">
              Controlador: {privacyContact.controllerName}.
              {privacyContact.email ? (
                <>
                  {" "}Canal de privacidade:{" "}
                  <a href={`mailto:${privacyContact.email}`} className="font-medium text-blue-700 hover:underline">{privacyContact.email}</a>.
                </>
              ) : (
                " Para exercer seus direitos, contate a unidade responsável pelo seu cadastro ou vínculo."
              )}
            </p>
            <LegalLinks className="mt-3" compact />
          </footer>
        </article>
      </div>
    </main>
  );
}

LegalSection.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
};

LegalList.propTypes = {
  children: PropTypes.node.isRequired,
};

LegalDocumentLayout.propTypes = {
  eyebrow: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  summary: PropTypes.string.isRequired,
  version: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
};
