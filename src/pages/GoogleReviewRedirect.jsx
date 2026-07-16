import { useEffect } from "react";
import { ExternalLink, LoaderCircle, Star } from "lucide-react";
import { GOOGLE_REVIEW_TARGET_URL } from "@/lib/google-review";
import { useBranding } from "@/hooks/use-branding";

export default function GoogleReviewRedirect() {
  const { companyName, logoUrl } = useBranding({ variant: "base", updateDocument: false });

  useEffect(() => {
    window.location.replace(GOOGLE_REVIEW_TARGET_URL);
  }, []);

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
          Você será direcionado para a página de avaliações da empresa no Google.
        </p>

        <div className="mt-6 flex items-center justify-center gap-2 text-sm font-medium text-blue-700">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Abrindo o Google...
        </div>

        <a
          href={GOOGLE_REVIEW_TARGET_URL}
          className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-700 underline underline-offset-4"
        >
          Abrir avaliação manualmente
          <ExternalLink className="h-4 w-4" />
        </a>
      </section>
    </main>
  );
}
