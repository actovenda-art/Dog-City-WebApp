import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ClipboardCopy,
  FileText,
  ListFilter,
  Loader2,
  MoreHorizontal,
  ReceiptText,
  RefreshCw,
  Search,
  Send,
  Trash2,
  UsersRound,
  Wallet,
} from "lucide-react";

import { bancoInter } from "@/api/functions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DatePickerInput } from "@/components/common/DateTimeInputs";
import { useStableCallback } from "@/hooks/use-stable-callback";

const MIN_CHARGE_AMOUNT = 2.5;
const INITIAL_FORM = {
  valor: "",
  data_vencimento: "",
  descricao: "",
};

const STEPS = [
  { id: 1, label: "Carteiras", icon: UsersRound },
  { id: 2, label: "Valor", icon: ReceiptText },
  { id: 3, label: "Vencimento", icon: Calendar },
  { id: 4, label: "Descrição", icon: FileText },
  { id: 5, label: "Conferência", icon: CheckCircle2 },
];

function parseAmount(value) {
  const normalized = String(value || "").trim().replace(/\./g, "").replace(",", ".");
  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value) {
  if (!value) return "Não informado";
  const dateKey = String(value).slice(0, 10);
  const date = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(date.getTime()) ? dateKey : date.toLocaleDateString("pt-BR");
}

function formatDateTime(value) {
  if (!value) return "Não informado";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function getFirstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "cliente";
}

function buildClientMessage(charge, url) {
  const description = String(charge?.descricao || "cobrança").trim();
  return `${getGreeting()}, ${getFirstName(charge?.responsavel_nome)}!! Tudo bem? 😊\n\nAqui está o novo link de pagamento da ${description}.\n\n> Link: ${url}\n>\n> Vencimento: ${formatDate(charge?.data_vencimento)}\n>\n> Valor: ${formatCurrency(charge?.valor)}\n\nPara solicitar o descritivo, é só responder "Descritivo". ; )`;
}

async function copyText(value) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Mobile browsers may expose the API but deny it outside a secure context.
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Não foi possível copiar automaticamente.");
}

function getStatusPresentation(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "recebido") return { label: "Recebido", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  if (["cancelado", "baixado", "expirado"].includes(normalized)) return { label: normalized === "expirado" ? "Expirado" : "Cancelado", className: "border-slate-200 bg-slate-100 text-slate-600" };
  return { label: "Em aberto", className: "border-blue-200 bg-blue-50 text-blue-700" };
}

function isChargeOpen(charge) {
  return ["emitido", "pendente_emissao"].includes(String(charge?.status || "").toLowerCase());
}

export default function WalletBulkIssuanceDialog({ open, onOpenChange, wallets, currentUser, onCompleted }) {
  const [view, setView] = useState("issued");
  const [step, setStep] = useState(1);
  const [selectedWalletIds, setSelectedWalletIds] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState(INITIAL_FORM);
  const [error, setError] = useState("");
  const [issuedCharges, setIssuedCharges] = useState([]);
  const [issuedSort, setIssuedSort] = useState({ key: "issued_at", direction: "desc" });
  const [loadingIssued, setLoadingIssued] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issueProgress, setIssueProgress] = useState({ current: 0, total: 0 });
  const [issueSummary, setIssueSummary] = useState(null);
  const [copyingId, setCopyingId] = useState("");
  const [feedback, setFeedback] = useState({});
  const [pendingAction, setPendingAction] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const availableWallets = useMemo(() => {
    const seen = new Set();
    return (wallets || [])
      .filter((wallet) => wallet?.carteira_id && !seen.has(wallet.carteira_id) && seen.add(wallet.carteira_id))
      .sort((left, right) => String(left?.carteira_nome || "").localeCompare(String(right?.carteira_nome || ""), "pt-BR"));
  }, [wallets]);

  const filteredWallets = useMemo(() => {
    const query = normalizeSearch(searchTerm);
    if (!query) return availableWallets;
    return availableWallets.filter((wallet) => normalizeSearch([
      wallet?.carteira_nome,
      wallet?.carteira_codigo,
      ...(wallet?.linked_dog_labels || []),
    ].join(" ")).includes(query));
  }, [availableWallets, searchTerm]);

  const selectedWallets = useMemo(
    () => availableWallets.filter((wallet) => selectedWalletIds.includes(wallet.carteira_id)),
    [availableWallets, selectedWalletIds],
  );

  const sortedIssuedCharges = useMemo(() => {
    const { key, direction } = issuedSort;
    return [...issuedCharges].sort((left, right) => {
      let comparison = 0;
      if (key === "name") {
        comparison = String(left.responsavel_nome || left.carteira_nome || "")
          .localeCompare(String(right.responsavel_nome || right.carteira_nome || ""), "pt-BR", { sensitivity: "base" });
      } else if (key === "amount") {
        comparison = Number(left.valor || 0) - Number(right.valor || 0);
      } else {
        const field = key === "due_date" ? "data_vencimento" : "emitido_em";
        comparison = String(left[field] || (key === "issued_at" ? left.criado_em : ""))
          .localeCompare(String(right[field] || (key === "issued_at" ? right.criado_em : "")));
      }
      return (direction === "asc" ? comparison : -comparison)
        || String(left.id || "").localeCompare(String(right.id || ""));
    });
  }, [issuedCharges, issuedSort]);

  const selectIssuedSort = (key) => {
    setIssuedSort((current) => current.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: key === "name" ? "asc" : "desc" });
  };

  const loadIssuedCharges = useStableCallback(async () => {
    if (!currentUser?.empresa_id) return;
    setLoadingIssued(true);
    setError("");
    try {
      const result = await bancoInter({
        action: "listWalletIssuedCharges",
        empresa_id: currentUser.empresa_id,
        sort_by: "issued_at",
      });
      setIssuedCharges(Array.isArray(result?.charges) ? result.charges : []);
    } catch (loadError) {
      setIssuedCharges([]);
      setError(loadError?.message || "Não foi possível carregar as cobranças emitidas.");
    } finally {
      setLoadingIssued(false);
    }
  });

  useEffect(() => {
    if (!open) return;
    setView("issued");
    setStep(1);
    setError("");
    setIssueSummary(null);
    loadIssuedCharges();
  }, [open, currentUser?.empresa_id, loadIssuedCharges]);

  const resetNewIssue = () => {
    setStep(1);
    setSelectedWalletIds([]);
    setSearchTerm("");
    setForm(INITIAL_FORM);
    setError("");
    setIssueSummary(null);
  };

  const selectView = (nextView) => {
    setView(nextView);
    setError("");
    if (nextView === "issued") loadIssuedCharges();
  };

  const toggleWallet = (walletId) => {
    setSelectedWalletIds((current) => current.includes(walletId)
      ? current.filter((id) => id !== walletId)
      : [...current, walletId]);
    setError("");
  };

  const handleNext = () => {
    setError("");
    if (step === 1 && selectedWalletIds.length === 0) {
      setError("Selecione ao menos uma carteira para continuar.");
      return;
    }
    if (step === 2 && parseAmount(form.valor) < MIN_CHARGE_AMOUNT) {
      setError("Informe um valor igual ou superior a R$ 2,50.");
      return;
    }
    if (step === 3) {
      const dueDate = String(form.data_vencimento || "").slice(0, 10);
      if (!dueDate || dueDate < new Date().toISOString().slice(0, 10)) {
        setError("Selecione um vencimento válido, a partir de hoje.");
        return;
      }
    }
    setStep((current) => Math.min(current + 1, 5));
  };

  const handleIssue = async () => {
    const amount = parseAmount(form.valor);
    if (!currentUser?.empresa_id || selectedWallets.length === 0 || amount < MIN_CHARGE_AMOUNT) return;

    setIssuing(true);
    setError("");
    setIssueProgress({ current: 0, total: selectedWallets.length });
    const successful = [];
    const failed = [];

    for (let index = 0; index < selectedWallets.length; index += 1) {
      const wallet = selectedWallets[index];
      setIssueProgress({ current: index + 1, total: selectedWallets.length });
      try {
        const result = await bancoInter({
          action: "issueWalletCharge",
          empresa_id: currentUser.empresa_id,
          carteira_id: wallet.carteira_id,
          carteira_conta_id: wallet.carteira_conta_id || null,
          responsavel_id: wallet.responsavel_id || null,
          valor: amount,
          data_vencimento: form.data_vencimento,
          descricao: form.descricao.trim(),
          metodo: "boleto_bancario",
          usuario_id: currentUser?.id || null,
          public_base_url: typeof window !== "undefined" ? window.location.origin : "",
        });
        successful.push({ wallet, charge: result?.charge, publicUrl: result?.public_url || "" });
      } catch (issueError) {
        failed.push({ wallet, message: issueError?.message || "Falha ao emitir cobrança." });
      }
    }

    setIssuing(false);
    setIssueSummary({ successful, failed });
    await loadIssuedCharges();
    setIssuedSort({ key: "issued_at", direction: "desc" });
    setView("issued");
    onCompleted?.({ successful, failed });
  };

  const handleCopyClientLink = async (charge) => {
    if (!charge?.id || !currentUser?.empresa_id) return;
    setCopyingId(charge.id);
    setFeedback((current) => ({ ...current, [charge.id]: null }));
    try {
      const result = await bancoInter({
        action: "getWalletChargePublicLink",
        empresa_id: currentUser.empresa_id,
        carteira_cobranca_id: charge.id,
        public_base_url: typeof window !== "undefined" ? window.location.origin : "",
      });
      const url = String(result?.public_url || "").trim();
      if (!url) throw new Error("O link de pagamento não foi retornado.");
      await copyText(buildClientMessage(charge, url));
      setFeedback((current) => ({ ...current, [charge.id]: { type: "success", message: "Mensagem do cliente copiada." } }));
    } catch (copyError) {
      setFeedback((current) => ({ ...current, [charge.id]: { type: "error", message: copyError?.message || "Não foi possível copiar o link." } }));
    } finally {
      setCopyingId("");
    }
  };

  const confirmAction = async () => {
    if (!pendingAction?.charge?.id || !currentUser?.empresa_id) return;
    setActionLoading(true);
    const charge = pendingAction.charge;
    try {
      await bancoInter({
        action: pendingAction.type === "cancel" ? "cancelWalletCharge" : "markWalletChargeReceived",
        empresa_id: currentUser.empresa_id,
        carteira_cobranca_id: charge.id,
        motivo_cancelamento: "Cancelada pela emissão em massa",
      });
      setPendingAction(null);
      await loadIssuedCharges();
    } catch (actionError) {
      setFeedback((current) => ({ ...current, [charge.id]: { type: "error", message: actionError?.message || "Não foi possível concluir a ação." } }));
      setPendingAction(null);
    } finally {
      setActionLoading(false);
    }
  };

  const amount = parseAmount(form.valor);
  const allFilteredSelected = filteredWallets.length > 0 && filteredWallets.every((wallet) => selectedWalletIds.includes(wallet.carteira_id));

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => !issuing && onOpenChange(nextOpen)}>
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[1120px] flex-col gap-0 overflow-hidden rounded-[26px] border-slate-200 bg-slate-50 p-0 shadow-[0_24px_80px_rgba(15,23,42,0.22)] sm:max-h-[92vh] sm:rounded-[30px]">
          <DialogHeader className="border-b border-slate-200 bg-white px-5 py-5 pr-14 text-left sm:px-7 sm:py-6 sm:pr-16">
            <div className="flex items-start gap-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-[0_8px_20px_rgba(37,99,235,0.24)]">
                <Send className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-xl tracking-tight text-slate-950 sm:text-2xl">Emissão em massa</DialogTitle>
                <DialogDescription className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">
                  Emita cobranças para várias carteiras e acompanhe os links em um só lugar.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
            <div className="mx-auto grid max-w-md grid-cols-2 rounded-2xl bg-slate-100 p-1">
              <button type="button" onClick={() => selectView("issued")} className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${view === "issued" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                Emitidos
              </button>
              <button type="button" onClick={() => selectView("new")} className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${view === "new" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                Novas emissões
              </button>
            </div>
          </div>

          {view === "issued" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="rounded-full border-blue-100 bg-blue-50 text-blue-700">{issuedCharges.length} emitida{issuedCharges.length === 1 ? "" : "s"}</Badge>
                  {issueSummary ? (
                    <span className={`text-xs font-medium ${issueSummary.failed.length ? "text-amber-700" : "text-emerald-700"}`}>
                      {issueSummary.successful.length} concluída{issueSummary.successful.length === 1 ? "" : "s"}
                      {issueSummary.failed.length ? `, ${issueSummary.failed.length} com erro` : ""}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Select value={issuedSort.key} onValueChange={selectIssuedSort}>
                    <SelectTrigger aria-label="Ordenar cobranças" className="h-9 min-w-0 flex-1 rounded-xl border-slate-200 bg-slate-50 text-xs shadow-none lg:hidden">
                      <ListFilter className="mr-2 h-3.5 w-3.5" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">Nome</SelectItem>
                      <SelectItem value="due_date">Vencimento</SelectItem>
                      <SelectItem value="issued_at">Emissão</SelectItem>
                      <SelectItem value="amount">Valor</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0 rounded-xl lg:hidden" onClick={() => selectIssuedSort(issuedSort.key)} aria-label={`Inverter ordem: ${issuedSort.direction === "asc" ? "crescente" : "decrescente"}`}>
                    {issuedSort.direction === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                  </Button>
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0 rounded-xl" onClick={() => loadIssuedCharges()} disabled={loadingIssued} aria-label="Atualizar cobranças">
                    <RefreshCw className={`h-3.5 w-3.5 ${loadingIssued ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
                {loadingIssued ? (
                  <div className="flex min-h-[280px] items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando emissões...</div>
                ) : error ? (
                  <div className="mx-auto flex min-h-[280px] max-w-md flex-col items-center justify-center text-center">
                    <p className="text-sm font-semibold text-red-700">{error}</p>
                    <Button variant="outline" className="mt-4 rounded-full" onClick={() => loadIssuedCharges()}>Tentar novamente</Button>
                  </div>
                ) : issuedCharges.length === 0 ? (
                  <div className="flex min-h-[280px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white px-6 text-center">
                    <ReceiptText className="h-8 w-8 text-slate-300" />
                    <p className="mt-3 text-sm font-semibold text-slate-900">Nenhuma cobrança emitida</p>
                    <p className="mt-1 text-xs text-slate-500">Use a aba Novas emissões para preparar o primeiro lote.</p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white">
                    <div className="hidden grid-cols-[minmax(180px,1.5fr)_120px_150px_120px_150px_44px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 lg:grid">
                      {[
                        ["name", "Nome da carteira"],
                        ["due_date", "Vencimento"],
                        ["issued_at", "Data de emissão"],
                        ["amount", "Valor"],
                      ].map(([key, label]) => (
                        <button key={key} type="button" onClick={() => selectIssuedSort(key)} aria-label={`Ordenar por ${label}${issuedSort.key === key ? `, ordem ${issuedSort.direction === "asc" ? "crescente" : "decrescente"}` : ""}`} className={`flex items-center gap-1 text-left hover:text-blue-700 ${issuedSort.key === key ? "text-blue-700" : ""}`}>
                          {label}
                          {issuedSort.key === key ? (issuedSort.direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : null}
                        </button>
                      ))}
                      <span>Link cliente</span><span />
                    </div>
                    <div className="divide-y divide-slate-100">
                      {sortedIssuedCharges.map((charge) => {
                        const status = getStatusPresentation(charge.status);
                        const openCharge = isChargeOpen(charge);
                        const chargeFeedback = feedback[charge.id];
                        return (
                          <article key={charge.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(180px,1.5fr)_120px_150px_120px_150px_44px] lg:items-center">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-950">{charge.responsavel_nome || "Responsável financeiro"}</p>
                              <div className="mt-1 flex min-w-0 items-center gap-2">
                                <Badge variant="outline" className={`rounded-full px-2 py-0 text-[10px] ${status.className}`}>{status.label}</Badge>
                                <span className="truncate text-[11px] text-slate-400">{charge.descricao || "Sem descrição"}</span>
                              </div>
                            </div>
                            <div><p className="text-[10px] uppercase text-slate-400 lg:hidden">Vencimento</p><p className="text-xs font-medium text-slate-700">{formatDate(charge.data_vencimento)}</p></div>
                            <div><p className="text-[10px] uppercase text-slate-400 lg:hidden">Emissão</p><p className="text-xs font-medium text-slate-700">{formatDateTime(charge.emitido_em || charge.criado_em)}</p></div>
                            <div><p className="text-[10px] uppercase text-slate-400 lg:hidden">Valor</p><p className="text-sm font-bold text-slate-950">{formatCurrency(charge.valor)}</p></div>
                            <div>
                              <Button type="button" variant="outline" size="sm" className="h-8 w-full rounded-full border-blue-200 text-[11px] text-blue-700 hover:bg-blue-50" onClick={() => handleCopyClientLink(charge)} disabled={!openCharge || copyingId === charge.id}>
                                {copyingId === charge.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ClipboardCopy className="mr-1.5 h-3.5 w-3.5" />}
                                Link cliente
                              </Button>
                              {chargeFeedback ? <p className={`mt-1 text-[10px] ${chargeFeedback.type === "error" ? "text-red-600" : "text-emerald-600"}`}>{chargeFeedback.message}</p> : null}
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 justify-self-end rounded-full" disabled={!openCharge} aria-label="Ações da cobrança"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52 rounded-2xl">
                                <DropdownMenuItem onClick={() => setPendingAction({ type: "receive", charge })}><Check className="mr-2 h-4 w-4 text-emerald-600" />Marcar como recebido</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-red-700 focus:text-red-700" onClick={() => setPendingAction({ type: "cancel", charge })}><Trash2 className="mr-2 h-4 w-4" />Cancelar cobrança</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
                <Button variant="outline" className="h-10 rounded-full" onClick={() => onOpenChange(false)}>Fechar</Button>
                <Button className="h-10 rounded-full bg-blue-600 px-5 text-white hover:bg-blue-700" onClick={() => { resetNewIssue(); setView("new"); }}>Nova emissão</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
                <div className="grid grid-cols-5 gap-1 sm:gap-2">
                  {STEPS.map((item) => {
                    const Icon = item.icon;
                    const active = item.id === step;
                    const complete = item.id < step;
                    return (
                      <div key={item.id} className={`flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-1.5 py-2 text-[10px] font-semibold sm:text-xs ${active ? "bg-blue-50 text-blue-700" : complete ? "text-emerald-700" : "text-slate-400"}`}>
                        {complete ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                        <span className="hidden truncate sm:inline">{item.label}</span>
                        <span className="sm:hidden">{item.id}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7 sm:py-6">
                {step === 1 ? (
                  <div className="mx-auto max-w-3xl">
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-700"><Wallet className="h-5 w-5" /></span>
                      <div><h3 className="text-lg font-bold text-slate-950">Selecione as carteiras</h3><p className="mt-1 text-xs text-slate-500">Cada carteira selecionada receberá uma cobrança individual com os mesmos dados.</p></div>
                    </div>
                    <div className="relative mt-5">
                      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar responsável ou cão..." className="h-11 rounded-2xl border-slate-200 bg-white pl-10" />
                    </div>
                    <div className="mt-3 flex items-center justify-between px-1 text-xs">
                      <button type="button" className="font-semibold text-blue-700" onClick={() => setSelectedWalletIds(allFilteredSelected ? selectedWalletIds.filter((id) => !filteredWallets.some((wallet) => wallet.carteira_id === id)) : [...new Set([...selectedWalletIds, ...filteredWallets.map((wallet) => wallet.carteira_id)])])}>{allFilteredSelected ? "Desmarcar exibidas" : "Selecionar exibidas"}</button>
                      <span className="text-slate-500">{selectedWalletIds.length} selecionada{selectedWalletIds.length === 1 ? "" : "s"}</span>
                    </div>
                    <div className="mt-3 max-h-[330px] space-y-2 overflow-y-auto pr-1">
                      {filteredWallets.map((wallet) => {
                        const checked = selectedWalletIds.includes(wallet.carteira_id);
                        return (
                          <button key={wallet.carteira_id} type="button" onClick={() => toggleWallet(wallet.carteira_id)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${checked ? "border-blue-300 bg-blue-50/70 ring-1 ring-blue-100" : "border-slate-200 bg-white hover:border-blue-200"}`}>
                            <Checkbox checked={checked} tabIndex={-1} aria-hidden="true" />
                            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-900">{wallet.carteira_nome}</span><span className="mt-0.5 block truncate text-[11px] text-slate-500">{wallet.linked_dog_labels?.join(", ") || "Sem cães vinculados"}</span></span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {step === 2 ? (
                  <div className="mx-auto max-w-lg"><h3 className="text-lg font-bold text-slate-950">Defina o valor</h3><p className="mt-1 text-xs text-slate-500">O mesmo valor será emitido para cada uma das {selectedWalletIds.length} carteiras.</p><Label htmlFor="bulk-charge-value" className="mt-6 block text-xs font-semibold text-slate-700">Valor por carteira</Label><div className="relative mt-2"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">R$</span><Input id="bulk-charge-value" inputMode="decimal" autoFocus value={form.valor} onChange={(event) => { setForm((current) => ({ ...current, valor: event.target.value })); setError(""); }} placeholder="0,00" className="h-14 rounded-2xl border-slate-200 bg-white pl-12 text-xl font-bold" /></div><div className="mt-4 rounded-2xl bg-slate-100 p-4 text-xs text-slate-600">Total do lote: <strong className="text-slate-950">{formatCurrency(amount * selectedWalletIds.length)}</strong></div></div>
                ) : null}

                {step === 3 ? (
                  <div className="mx-auto max-w-lg"><h3 className="text-lg font-bold text-slate-950">Defina o vencimento</h3><p className="mt-1 text-xs text-slate-500">Todas as cobranças do lote terão a mesma data.</p><Label className="mt-6 block text-xs font-semibold text-slate-700">Vencimento</Label><div className="mt-2"><DatePickerInput value={form.data_vencimento} onChange={(value) => { setForm((current) => ({ ...current, data_vencimento: value })); setError(""); }} placeholder="Selecione a data" /></div></div>
                ) : null}

                {step === 4 ? (
                  <div className="mx-auto max-w-lg"><h3 className="text-lg font-bold text-slate-950">Adicione uma descrição</h3><p className="mt-1 text-xs text-slate-500">A descrição é opcional e será usada na mensagem enviada ao cliente.</p><Label htmlFor="bulk-charge-description" className="mt-6 block text-xs font-semibold text-slate-700">Descrição (opcional)</Label><Textarea id="bulk-charge-description" value={form.descricao} onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))} maxLength={180} rows={5} placeholder="Ex.: Mensalidade de Day Care" className="mt-2 resize-none rounded-2xl border-slate-200 bg-white" /><p className="mt-2 text-right text-[11px] text-slate-400">{form.descricao.length}/180</p></div>
                ) : null}

                {step === 5 ? (
                  <div className="mx-auto max-w-3xl"><h3 className="text-lg font-bold text-slate-950">Confira antes de emitir</h3><p className="mt-1 text-xs text-slate-500">A confirmação criará uma cobrança individual para cada carteira selecionada.</p><div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase text-slate-400">Valor por carteira</p><p className="mt-1 text-lg font-bold text-slate-950">{formatCurrency(amount)}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase text-slate-400">Vencimento</p><p className="mt-1 text-lg font-bold text-slate-950">{formatDate(form.data_vencimento)}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase text-slate-400">Total do lote</p><p className="mt-1 text-lg font-bold text-blue-700">{formatCurrency(amount * selectedWalletIds.length)}</p></div></div><div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase text-slate-400">Descrição</p><p className="mt-1 text-sm text-slate-700">{form.descricao.trim() || "Sem descrição"}</p></div><div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase text-slate-400">Carteiras selecionadas</p><Badge variant="outline" className="rounded-full">{selectedWallets.length}</Badge></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{selectedWallets.map((wallet) => <div key={wallet.carteira_id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700"><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" /><span className="truncate">{wallet.carteira_nome}</span></div>)}</div></div></div>
                ) : null}

                {error ? <div className="mx-auto mt-5 max-w-lg rounded-2xl bg-red-50 px-4 py-3 text-xs font-medium text-red-700" role="alert">{error}</div> : null}
              </div>

              <DialogFooter className="flex-row items-center justify-between border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
                <Button type="button" variant="ghost" className="h-10 rounded-full" onClick={() => step === 1 ? setView("issued") : setStep((current) => current - 1)} disabled={issuing}><ChevronLeft className="mr-1.5 h-4 w-4" />{step === 1 ? "Emitidos" : "Voltar"}</Button>
                {step < 5 ? <Button type="button" className="h-10 rounded-full bg-blue-600 px-6 text-white hover:bg-blue-700" onClick={handleNext}>Seguir</Button> : <Button type="button" className="h-10 rounded-full bg-blue-600 px-6 text-white hover:bg-blue-700" onClick={handleIssue} disabled={issuing}>{issuing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Emitindo {issueProgress.current}/{issueProgress.total}</> : "Confirmar emissão"}</Button>}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingAction)} onOpenChange={(nextOpen) => !nextOpen && !actionLoading && setPendingAction(null)}>
        <AlertDialogContent className="w-[calc(100vw-1.5rem)] max-w-[440px] rounded-[26px]">
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingAction?.type === "cancel" ? "Cancelar esta cobrança?" : "Marcar como recebida?"}</AlertDialogTitle>
            <AlertDialogDescription className="leading-6">
              {pendingAction?.type === "cancel"
                ? "A cobrança será cancelada no Banco Inter e o link do cliente deixará de funcionar."
                : "A cobrança será baixada no Banco Inter e o valor será creditado uma única vez na carteira do responsável financeiro."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-2xl bg-slate-50 p-4 text-sm"><p className="font-semibold text-slate-950">{pendingAction?.charge?.responsavel_nome}</p><p className="mt-1 text-slate-500">{formatCurrency(pendingAction?.charge?.valor)} · vencimento {formatDate(pendingAction?.charge?.data_vencimento)}</p></div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading} className="rounded-full">Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); confirmAction(); }} disabled={actionLoading} className={`rounded-full ${pendingAction?.type === "cancel" ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}`}>{actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{pendingAction?.type === "cancel" ? "Cancelar cobrança" : "Confirmar recebimento"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

WalletBulkIssuanceDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onOpenChange: PropTypes.func.isRequired,
  wallets: PropTypes.arrayOf(PropTypes.object),
  currentUser: PropTypes.object,
  onCompleted: PropTypes.func,
};

WalletBulkIssuanceDialog.defaultProps = {
  wallets: [],
  currentUser: null,
  onCompleted: null,
};
