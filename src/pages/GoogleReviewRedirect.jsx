import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ExternalLink, LoaderCircle, Star, TriangleAlert } from "lucide-react";
import { getPublicGoogleReviewUrl } from "@/api/functions";
import { useBranding } from "@/hooks/use-branding";

function normalizeReviewTarget(value) {
  try {
    const url = new URL(String(value || "").trim());
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

export default function GoogleReviewRedirect() {
  const { unitReference = "" } = useParams();
  const { companyName, logoUrl } = useBranding({ variant: "base", updateDocument: false });
  const [targetUrl, setTargetUrl] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    const normalizedReference = String(unitReference || "").trim();

    if (!normalizedReference) {
      setErrorMessage("Este link de avaliação não identifica uma unidade.");
      return () => {
        active = false;
      };
    }

    async function resolveReviewTarget() {
      setErrorMessage("");
      try {
        const response = await getPublicGoogleReviewUrl({ unit_reference: normalizedReference });
        const normalizedTarget = normalizeReviewTarget(response?.url);
        if (!normalizedTarget) {
          throw new Error("A avaliação desta unidade ainda não foi configurada.");
        }
        if (!active) return;
        setTargetUrl(normalizedTarget);
        window.location.replace(normalizedTarget);
      } catch (error) {
        if (active) {
          setErrorMessage(error?.message || "Não foi possível localizar a avaliação desta unidade.");
        }
      }
    }

    resolveReviewTarget();
    return () => {
      active = false;
    };
  }, [unitReference]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm">
        {logoUrl ? (
          <img src={logoUrl} alt={companyName || "Dog City Brasil"} className="mx-auto h-20 w-20 object-contain" />
        ) : (
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50">
            <Star className="h-8 w-8 fill-amber-400 text-amber-500" />
          </div>
        )}

        <h1 className="mt-5 text-xl font-semibold text-slate-950">Avalie a Dog City Brasil</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {errorMessage
            ? errorMessage
            : "Você será direcionado para a página de avaliações desta unidade no Google."}
        </p>

        {errorMessage ? (
          <div className="mt-6 flex items-center justify-center gap-2 text-sm font-medium text-amber-700">
            <TriangleAlert className="h-4 w-4" />
            Link indisponível
          </div>
        ) : (
          <div className="mt-6 flex items-center justify-center gap-2 text-sm font-medium text-blue-700">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Abrindo o Google...
          </div>
        )}

        {targetUrl ? (
          <a
            href={targetUrl}
            className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-700 underline underline-offset-4"
          >
            Abrir avaliação manualmente
            <ExternalLink className="h-4 w-4" />
          </a>
        ) : null}
      </section>
    </main>
  );
}
