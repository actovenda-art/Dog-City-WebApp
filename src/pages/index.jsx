import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { User } from "@/api/entities";
import { createPageUrl, getPageNameFromPath } from "@/utils";

import Layout from "./Layout.jsx";
import Login from "./Login.jsx";
import AuthCallback from "./AuthCallback.jsx";
import CompletarCadastro from "./CompletarCadastro.jsx";
import Dev_Dashboard from "./Dev_Dashboard";
import Backup from "./Backup";
import Registrador from "./Registrador";
import Agenda_Comercial from "./Agenda_Comercial";
import Cadastro from "./Cadastro";
import Planos from "./Planos";
import Cockpit from "./Cockpit";
import ContasReceber from "./ContasReceber";
import PedidosInternos from "./PedidosInternos";
import Movimentacoes from "./Movimentacoes";
import Receitas from "./Receitas";
import ContasPagar from "./ContasPagar";
import RelatoriosCaes from "./RelatoriosCaes";
import PerfilCao from "./PerfilCao";
import Orcamentos from "./Orcamentos";
import ConfiguracoesPrecos from "./ConfiguracoesPrecos";
import HistoricoOrcamentos from "./HistoricoOrcamentos";
import Agendamentos from "./Agendamentos";
import PlanosConfig from "./PlanosConfig";
import ServicosPrestados from "./ServicosPrestados";
import Despesas from "./Despesas";
import ConfigurarIntegracoes from "./ConfigurarIntegracoes";
import AdministracaoSistema from "./AdministracaoSistema";
import VisualizadorImagem from "./VisualizadorImagem";

const PAGES = {
  Login,
  AuthCallback,
  CompletarCadastro,
  Dev_Dashboard,
  Backup,
  Registrador,
  Agenda_Comercial,
  Cadastro,
  Planos,
  Cockpit,
  ContasReceber,
  PedidosInternos,
  Movimentacoes,
  Receitas,
  ContasPagar,
  RelatoriosCaes,
  PerfilCao,
  Orcamentos,
  ConfiguracoesPrecos,
  HistoricoOrcamentos,
  Agendamentos,
  PlanosConfig,
  ServicosPrestados,
  Despesas,
  ConfigurarIntegracoes,
  AdministracaoSistema,
  VisualizadorImagem,
};

const STANDALONE_PAGES = new Set(["Login", "AuthCallback", "CompletarCadastro", "VisualizadorImagem"]);
const PUBLIC_PAGES = new Set(["Login", "AuthCallback", "VisualizadorImagem"]);

function getSafeNextPath(search) {
  const params = new URLSearchParams(search);
  const next = params.get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return createPageUrl("Dev_Dashboard");
  }
  return next;
}

function FullScreenAuthLoader() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center text-white">
        <LoaderCircle className="w-10 h-10 mx-auto animate-spin text-orange-400" />
        <p className="mt-4 text-sm text-slate-300">Carregando sessao...</p>
      </div>
    </div>
  );
}

function PageFrame({ pageName, currentPageName }) {
  const PageComponent = PAGES[pageName];

  if (!PageComponent) return null;
  if (STANDALONE_PAGES.has(pageName)) {
    return <PageComponent />;
  }

  return (
    <Layout currentPageName={currentPageName}>
      <PageComponent />
    </Layout>
  );
}

function LegacyPageRedirect({ pageName }) {
  const location = useLocation();

  return (
    <Navigate
      to={{ pathname: createPageUrl(pageName), search: location.search }}
      replace
    />
  );
}

function RequireAuth({ authEnabled, authReady, currentUser, children }) {
  const location = useLocation();
  const onboardingPath = createPageUrl("CompletarCadastro");

  if (!authEnabled) return children;
  if (!authReady) return <FullScreenAuthLoader />;
  if (!currentUser) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`${createPageUrl("Login")}?next=${encodeURIComponent(next)}`} replace />;
  }
  if (currentUser?.onboarding_status === "pendente" && location.pathname !== onboardingPath) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`${onboardingPath}?next=${encodeURIComponent(next)}`} replace />;
  }

  return children;
}

function RedirectAuthenticatedUser({ authEnabled, authReady, currentUser, children }) {
  const location = useLocation();

  if (!authEnabled) return children;
  if (!authReady) return <FullScreenAuthLoader />;
  if (currentUser) {
    return <Navigate to={getSafeNextPath(location.search)} replace />;
  }

  return children;
}

function PagesContent() {
  const location = useLocation();
  const currentPage = getPageNameFromPath(location.pathname);
  const authEnabled = typeof User.requiresLogin === "function" ? User.requiresLogin() : false;
  const [authReady, setAuthReady] = useState(!authEnabled);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function loadCurrentUser() {
      if (!authEnabled) {
        if (mounted) {
          setCurrentUser(await User.me());
          setAuthReady(true);
        }
        return;
      }

      try {
        const user = await User.me();
        if (mounted) {
          setCurrentUser(user);
        }
      } catch (error) {
        console.error("Erro ao carregar sessao:", error);
        if (mounted) {
          setCurrentUser(null);
        }
      } finally {
        if (mounted) {
          setAuthReady(true);
        }
      }
    }

    loadCurrentUser();

    const subscription = User.onAuthStateChange?.(async () => {
      try {
        const user = await User.me();
        if (mounted) {
          setCurrentUser(user);
          setAuthReady(true);
        }
      } catch (error) {
        if (mounted) {
          setCurrentUser(null);
          setAuthReady(true);
        }
      }
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe?.();
    };
  }, [authEnabled]);

  return (
    <Routes>
      <Route path="/" element={<Navigate to={createPageUrl("Dev_Dashboard")} replace />} />

      {Object.keys(PAGES).map((pageName) => {
        const frame = <PageFrame pageName={pageName} currentPageName={currentPage} />;
        let element = frame;

        if (pageName === "Login") {
          element = (
            <RedirectAuthenticatedUser authEnabled={authEnabled} authReady={authReady} currentUser={currentUser}>
              {frame}
            </RedirectAuthenticatedUser>
          );
        } else if (!PUBLIC_PAGES.has(pageName)) {
          element = (
            <RequireAuth authEnabled={authEnabled} authReady={authReady} currentUser={currentUser}>
              {frame}
            </RequireAuth>
          );
        }

        return (
          <Route
            key={`pretty-${pageName}`}
            path={createPageUrl(pageName)}
            element={element}
          />
        );
      })}

      {Object.keys(PAGES).map((pageName) => {
        const legacyPath = `/${pageName}`;
        const prettyPath = createPageUrl(pageName);

        if (legacyPath.toLowerCase() === prettyPath.toLowerCase()) {
          return null;
        }

        return (
          <Route
            key={`legacy-${pageName}`}
            path={legacyPath}
            element={<LegacyPageRedirect pageName={pageName} />}
          />
        );
      })}

      <Route path="*" element={<Navigate to={createPageUrl("Dev_Dashboard")} replace />} />
    </Routes>
  );
}

export default function Pages() {
  return (
    <Router>
      <PagesContent />
    </Router>
  );
}
