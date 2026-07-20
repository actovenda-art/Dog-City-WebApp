import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { bancoInter } from "@/api/functions";
import LoadingScreen from "@/components/layout/LoadingScreen";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ClipboardCopy, Download, Landmark, LockKeyhole, QrCode, XCircle } from "lucide-react";

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
}

function formatDate(value) {
  const normalized = String(value || "").slice(0, 10);
  if (!normalized) return "-";
  const parsed = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString("pt-BR");
}

async function copyText(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  }
}

function getStatusPresentation(charge) {
  if (charge?.status === "recebido") {
    return { label: "Pagamento confirmado", tone: "border-emerald-200 bg-emerald-50 text-emerald-700", icon: CheckCircle2 };
  }
  if (["baixado", "cancelado", "expirado"].includes(charge?.status)) {
    return { label: charge?.status === "expirado" ? "Cobrança expirada" : "Cobrança encerrada", tone: "border-slate-200 bg-slate-100 text-slate-600", icon: XCircle };
  }
  return { label: "Aguardando pagamento", tone: "border-blue-200 bg-blue-50 text-blue-700", icon: Landmark };
}

export default function CobrancaPublica() {
  const { token = "" } = useParams();
  const [charge, setCharge] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let active = true;

    async function loadCharge() {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const result = await bancoInter({ action: "getWalletChargePublic", token });
        if (active) setCharge(result?.charge || null);
      } catch (error) {
        if (active) setErrorMessage(error?.message || "Não foi possível abrir esta cobrança.");
      } finally {
        if (active) setIsLoading(false);
      }
    }

    if (!token) {
      setErrorMessage("Link de cobrança inválido.");
      setIsLoading(false);
      return () => {
        active = false;
      };
    }

    loadCharge();
    return () => {
      active = false;
    };
  }, [token]);

  async function handleCopy(value, label) {
    const copied = await copyText(value);
    setFeedback(copied ? `${label} copiado.` : `Não foi possível copiar ${label.toLowerCase()}.`);
  }

  async function handleDownload() {
    setIsDownloading(true);
    setFeedback("");
    try {
      const response = await bancoInter({ action: "downloadWalletChargePdfPublic", token });
      const pdfBase64 = String(response?.pdf || "").replace(/^data:application\/pdf;base64,/i, "");
      if (!pdfBase64) throw new Error("O boleto não retornou um PDF para download.");
      const binary = window.atob(pdfBase64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = response?.file_name || "boleto-dog-city.pdf";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => window.URL.revokeObjectURL(url), 5_000);
    } catch (error) {
      setFeedback(error?.message || "Não foi possível baixar o boleto.");
    } finally {
      setIsDownloading(false);
    }
  }

  if (isLoading) return <LoadingScreen />;

  if (errorMessage || !charge) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
        <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <img src="/dog-city-brand.png" alt="Dog City Brasil" className="mx-auto h-12 w-12 object-contain" />
          <XCircle className="mx-auto mt-5 h-9 w-9 text-red-500" />
          <h1 className="mt-3 text-xl font-bold text-slate-950">Cobrança indisponível</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{errorMessage || "Este link não está disponível."}</p>
        </section>
      </main>
    );
  }

  const status = getStatusPresentation(charge);
  const StatusIcon = status.icon;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#eff6ff,transparent_45%),linear-gradient(180deg,#f8fafc,#ffffff)] px-4 py-8 sm:px-6 sm:py-12">
      <section className="mx-auto w-full max-w-xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.10)]">
        <header className="border-b border-slate-100 bg-gradient-to-r from-blue-50 via-white to-emerald-50 px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src="/dog-city-brand.png" alt="Dog City Brasil" className="h-10 w-10 rounded-xl object-contain" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-blue-700">Dog City Brasil</p>
                <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">Pagamento da carteira</h1>
              </div>
            </div>
            <Badge variant="outline" className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.tone}`}>
              <StatusIcon className="mr-1.5 h-3.5 w-3.5" />
              {status.label}
            </Badge>
          </div>
        </header>

        <div className="space-y-5 px-5 py-6 sm:px-7 sm:py-7">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
            <p className="text-xs font-medium text-slate-500">Responsável financeiro</p>
            <p className="mt-1 text-base font-semibold text-slate-950">{charge.responsavel_nome}</p>
            {charge.descricao ? (
              <>
                <p className="mt-4 text-xs font-medium text-slate-500">Descrição</p>
                <p className="mt-1 text-sm leading-6 text-slate-800">{charge.descricao}</p>
              </>
            ) : null}
            <div className={`${charge.descricao ? "mt-5" : "mt-4"} flex items-end justify-between gap-3 border-t border-slate-200 pt-4`}>
              <div>
                <p className="text-xs font-medium text-slate-500">Vencimento</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{formatDate(charge.data_vencimento)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-slate-500">Valor</p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{formatCurrency(charge.valor)}</p>
              </div>
            </div>
          </div>

          {charge.ativo ? (
            <>
              <div className="rounded-2xl border border-blue-100 bg-blue-50/55 p-4">
                <div className="flex items-center gap-2 text-slate-900">
                  <Landmark className="h-4 w-4 text-blue-700" />
                  <p className="text-sm font-semibold">Boleto bancário</p>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">Use o código de barras ou baixe o boleto para pagar no seu banco.</p>
                {charge?.boleto?.linha_digitavel ? (
                  <div className="mt-3 flex gap-2">
                    <div className="min-w-0 flex-1 break-all rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs text-slate-700">{charge.boleto.linha_digitavel}</div>
                    <Button type="button" variant="outline" size="sm" className="h-auto shrink-0 border-blue-200 bg-white" onClick={() => handleCopy(charge.boleto.linha_digitavel, "Código do boleto")}>
                      <ClipboardCopy className="mr-1.5 h-3.5 w-3.5" />Copiar
                    </Button>
                  </div>
                ) : null}
                <Button type="button" variant="outline" className="mt-3 border-blue-200 bg-white" onClick={handleDownload} disabled={isDownloading}>
                  <Download className="mr-2 h-4 w-4" />
                  {isDownloading ? "Preparando boleto..." : "Baixar boleto"}
                </Button>
              </div>

              {charge?.pix?.copia_e_cola ? (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/55 p-4">
                  <div className="flex items-center gap-2 text-slate-900">
                    <QrCode className="h-4 w-4 text-emerald-700" />
                    <p className="text-sm font-semibold">Pix copia e cola</p>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-600">Este Pix foi emitido junto com o boleto pelo Banco Inter.</p>
                  <div className="mt-3 flex gap-2">
                    <div className="min-w-0 flex-1 break-all rounded-xl border border-emerald-100 bg-white px-3 py-2 text-xs text-slate-700">{charge.pix.copia_e_cola}</div>
                    <Button type="button" variant="outline" size="sm" className="h-auto shrink-0 border-emerald-200 bg-white" onClick={() => handleCopy(charge.pix.copia_e_cola, "Pix copia e cola")}>
                      <ClipboardCopy className="mr-1.5 h-3.5 w-3.5" />Copiar
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              {charge.status === "recebido"
                ? "Este pagamento já foi confirmado. Não é necessário realizar uma nova ação."
                : "Esta cobrança não está mais disponível para pagamento. Se necessário, solicite uma nova cobrança à equipe Dog City Brasil."}
            </div>
          )}

          {feedback ? <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">{feedback}</p> : null}

          <div className="flex items-center justify-center gap-2 pt-1 text-[11px] text-slate-400">
            <LockKeyhole className="h-3.5 w-3.5" />
            Link protegido para esta cobrança
          </div>
        </div>
      </section>
    </main>
  );
}
