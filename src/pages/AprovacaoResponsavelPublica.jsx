import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { responsavelApproval } from "@/api/functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Dog, LoaderCircle, LockKeyhole, MessageSquareWarning, ShieldCheck, XCircle } from "lucide-react";

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getStatusTone(status) {
  if (status === "aprovado") return "bg-green-100 text-green-700";
  if (status === "recusado") return "bg-rose-100 text-rose-700";
  if (status === "expirado") return "bg-amber-100 text-amber-700";
  return "bg-blue-100 text-blue-700";
}

export default function AprovacaoResponsavelPublica() {
  const location = useLocation();
  const token = useMemo(() => new URLSearchParams(location.search).get("token") || "", [location.search]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [context, setContext] = useState(null);
  const [sessionToken, setSessionToken] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [decisionMessage, setDecisionMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setErrorMessage("Link de aprovação inválido.");
      setIsLoading(false);
      return;
    }
    loadContext();
  }, [token]);

  async function loadContext() {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const result = await responsavelApproval({
        action: "get_context",
        token,
      });
      setContext(result || null);
    } catch (error) {
      setErrorMessage(error?.message || "Não foi possível carregar a solicitação.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAuthenticate(event) {
    event.preventDefault();
    setErrorMessage("");
    setDecisionMessage("");
    setIsAuthenticating(true);
    try {
      const result = await responsavelApproval({
        action: "authenticate",
        token,
        login,
        password,
      });
      setSessionToken(result?.session_token || "");
      setContext((current) => ({
        ...(current || {}),
        authenticated: true,
        request: result?.request || current?.request || null,
        responsavel: result?.responsavel || current?.responsavel || null,
        orcamento: result?.orcamento || current?.orcamento || null,
        dogs: result?.dogs || current?.dogs || [],
      }));
    } catch (error) {
      setErrorMessage(error?.message || "Não foi possível autenticar o responsável.");
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function submitDecision(action) {
    setIsSubmitting(true);
    setErrorMessage("");
    setDecisionMessage("");
    try {
      const result = await responsavelApproval({
        action,
        token,
        session_token: sessionToken,
      });
      setContext((current) => ({
        ...(current || {}),
        request: result?.request || current?.request || null,
      }));
      setDecisionMessage(action === "approve"
        ? "Aprovação registrada com segurança. A equipe da Dog City já pode seguir com o atendimento."
        : "Recusa registrada com segurança. A equipe da Dog City será avisada imediatamente.");
    } catch (error) {
      setErrorMessage(error?.message || "Não foi possível registrar sua decisão.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const request = context?.request || null;
  const status = request?.status || "pendente";
  const isAuthenticated = Boolean(sessionToken) || context?.authenticated;
  const dogs = Array.isArray(context?.dogs) ? context.dogs : [];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="text-center text-white">
          <LoaderCircle className="mx-auto h-10 w-10 animate-spin text-orange-400" />
          <p className="mt-4 text-sm text-slate-300">Carregando solicitação...</p>
        </div>
      </div>
    );
  }

  if (errorMessage && !request) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-10">
        <div className="mx-auto max-w-xl">
          <Card className="border-rose-200 bg-white">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-rose-100 p-3 text-rose-700">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">Não foi possível abrir esta aprovação</h1>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{errorMessage}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <Card className="overflow-hidden border-slate-200 bg-white">
          <CardHeader className="border-b bg-gradient-to-r from-orange-50 via-white to-blue-50">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-600">Aprovação autenticada</p>
                <CardTitle className="mt-2 text-2xl text-slate-900">Confirmação do responsável</CardTitle>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Entre com seu login e sua senha para aprovar ou recusar esta solicitação com rastreabilidade completa.
                </p>
              </div>
              <Badge className={getStatusTone(status)}>
                {status === "aprovado" ? "Aprovado" : status === "recusado" ? "Recusado" : status === "expirado" ? "Expirado" : "Pendente"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 p-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Valor</p>
                <p className="mt-2 text-lg font-bold text-slate-900">{formatCurrency(context?.orcamento?.valor_total || request?.source_context?.valor_total || 0)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Validade do link</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(request?.expires_at)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Solicitado em</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{formatDateTime(request?.created_at)}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-slate-900">
                <Dog className="h-4 w-4 text-blue-600" />
                <p className="text-sm font-semibold">Dogs e atendimento</p>
              </div>
              <div className="mt-3 space-y-2">
                {dogs.length ? dogs.map((dog) => (
                  <div key={dog.id || dog.nome} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">{dog.nome || "Dog"}</span>
                    {dog.raca ? ` · ${dog.raca}` : ""}
                  </div>
                )) : (
                  <p className="text-sm text-slate-500">Os detalhes do atendimento serão confirmados pela equipe da Dog City.</p>
                )}
              </div>
            </div>

            {!isAuthenticated && status === "pendente" ? (
              <form onSubmit={handleAuthenticate} className="rounded-3xl border border-blue-100 bg-blue-50/70 p-5">
                <div className="flex items-center gap-2 text-slate-900">
                  <LockKeyhole className="h-4 w-4 text-blue-600" />
                  <p className="text-sm font-semibold">Acesso do responsável</p>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Login</Label>
                    <Input value={login} onChange={(event) => setLogin(event.target.value)} placeholder="Email ou login cadastrado" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Senha</Label>
                    <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Digite sua senha" />
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-600">
                  Esse acesso é individual do responsável e protege o histórico da aprovação com data, horário e dispositivo.
                </p>
                {errorMessage ? (
                  <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {errorMessage}
                  </div>
                ) : null}
                <div className="mt-4 flex justify-end">
                  <Button type="submit" disabled={isAuthenticating} className="bg-blue-600 text-white hover:bg-blue-700">
                    {isAuthenticating ? "Validando acesso..." : "Entrar para confirmar"}
                  </Button>
                </div>
              </form>
            ) : null}

            {isAuthenticated && status === "pendente" ? (
              <div className="rounded-3xl border border-emerald-100 bg-emerald-50/70 p-5">
                <div className="flex items-center gap-2 text-slate-900">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <p className="text-sm font-semibold">Escolha sua decisão</p>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-700">
                  Sua decisão ficará registrada com segurança para a equipe da Dog City, junto com data, horário e dados básicos do acesso utilizado.
                </p>
                {errorMessage ? (
                  <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {errorMessage}
                  </div>
                ) : null}
                {decisionMessage ? (
                  <div className="mt-3 rounded-2xl border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-700">
                    {decisionMessage}
                  </div>
                ) : null}
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <Button disabled={isSubmitting} onClick={() => submitDecision("approve")} className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700">
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {isSubmitting ? "Registrando..." : "Aprovar"}
                  </Button>
                  <Button disabled={isSubmitting} variant="outline" onClick={() => submitDecision("decline")} className="flex-1 border-rose-200 text-rose-700 hover:bg-rose-50">
                    <XCircle className="mr-2 h-4 w-4" />
                    {isSubmitting ? "Registrando..." : "Recusar"}
                  </Button>
                </div>
              </div>
            ) : null}

            {status !== "pendente" ? (
              <div className={`rounded-3xl border p-5 ${status === "aprovado" ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
                <div className="flex items-start gap-3">
                  <div className={`rounded-2xl p-3 ${status === "aprovado" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                    {status === "aprovado" ? <CheckCircle2 className="h-6 w-6" /> : <MessageSquareWarning className="h-6 w-6" />}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      {status === "aprovado" ? "Solicitação aprovada" : "Solicitação recusada"}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      {decisionMessage || (status === "aprovado"
                        ? "A aprovação já foi registrada. A equipe da Dog City seguirá com o fluxo interno."
                        : "A recusa já foi registrada. A equipe da Dog City revisará a solicitação internamente.")}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
