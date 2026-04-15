import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { User } from "@/api/entities";
import { getSafeNextPathFromSearch, getSafeRedirectTarget, isSameAppLocation } from "@/lib/auth-navigation";
import {
  buildRecoveredLoginUrl,
  clearCorruptedBrowserAuthState,
  recordNavigationSample,
  shouldTriggerAuthRecovery,
  wasRecentlyRecovered,
} from "@/lib/auth-recovery";
import { ACTIVE_UNIT_EVENT } from "@/lib/unit-context";
import { createPageUrl, getPageNameFromPath } from "@/utils";

import Layout from "./Layout.jsx";
import AccessGuard from "@/components/layout/AccessGuard";
import UnitModeGuard from "@/components/layout/UnitModeGuard";
import Login from "./Login.jsx";
import AuthCallback from "./AuthCallback.jsx";
import CompletarCadastro from "./CompletarCadastro.jsx";
import CadastroClientePublico from "./CadastroClientePublico.jsx";
import DefinirPin from "./DefinirPin.jsx";
import ValidarPin from "./ValidarPin.jsx";
import Dev_Dashboard from "./Dev_Dashboard";
import Backup from "./Backup";
import Registrador from "./Registrador";
import Agenda_Comercial from "./Agenda_Comercial";
import Cadastro from "./Cadastro";
import Planos from "./Planos";
import Cockpit from "./Cockpit";
import ControleGerencial from "./ControleGerencial";
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
import Despesas from "./Despesas";
import ConfigurarIntegracoes from "./ConfigurarIntegracoes";
import AdministracaoSistema from "./AdministracaoSistema";
import VisualizadorImagem from "./VisualizadorImagem";

const PAGES = {
  Login,
  AuthCallback,
  CompletarCadastro,
  CadastroClientePublico,
  DefinirPin,
  ValidarPin,
  Dev_Dashboard,
  Backup,
  Registrador,
  Agenda_Comercial,
  Cadastro,
  Planos,
  Cockpit,
  ControleGerencial,
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
  Despesas,
  ConfigurarIntegracoes,
  AdministracaoSistema,
  VisualizadorImagem,
};

const STANDALONE_PAGES = new Set(["Login", "AuthCallback", "CompletarCadastro", "CadastroClientePublico", "DefinirPin", "ValidarPin", "VisualizadorImagem"]);
const PUBLIC_PAGES = new Set(["Login", "AuthCallback", "CompletarCadastro", "CadastroClientePublico", "VisualizadorImagem"]);

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

function StandalonePage({ pageName }) {
  const PageComponent = PAGES[pageName];

  if (!PageComponent) return null;
  return <PageComponent />;
}

function ProtectedPage({ pageName, currentUser, unitScopeVersion }) {
  const PageComponent = PAGES[pageName];

  if (!PageComponent) return null;
  return (
    <AccessGuard pageName={pageName} currentUser={currentUser}>
      <UnitModeGuard pageName={pageName}>
        <PageComponent key={`page-${pageName}-${unitScopeVersion}`} />
      </UnitModeGuard>
    </AccessGuard>
  );
}

function ProtectedLayout({ currentPageName, currentUser }) {
  return (
    <Layout currentPageName={currentPageName} initialUser={currentUser}>
      <Outlet />
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
  const pinSetupPath = createPageUrl("DefinirPin");
  const pinValidationPath = createPageUrl("ValidarPin");

  if (!authEnabled) return children;
  if (!authReady) return <FullScreenAuthLoader />;
  if (!currentUser) {
    const next = getSafeRedirectTarget(location.pathname, location.search);
    if (isSameAppLocation(`${createPageUrl("Login")}?next=${encodeURIComponent(next)}`, location.pathname, location.search, location.hash)) {
      return children;
    }
    return <Navigate to={`${createPageUrl("Login")}?next=${encodeURIComponent(next)}`} replace />;
  }
  if (currentUser?.active === false) {
    if (isSameAppLocation(`${createPageUrl("Login")}?blocked=1`, location.pathname, location.search, location.hash)) {
      return children;
    }
    return <Navigate to={`${createPageUrl("Login")}?blocked=1`} replace />;
  }
  if (currentUser?.onboarding_status === "pendente" && location.pathname !== onboardingPath) {
    const next = getSafeRedirectTarget(location.pathname, location.search);
    if (isSameAppLocation(`${onboardingPath}?next=${encodeURIComponent(next)}`, location.pathname, location.search, location.hash)) {
      return children;
    }
    return <Navigate to={`${onboardingPath}?next=${encodeURIComponent(next)}`} replace />;
  }
  if (currentUser?.pin_required_reset === true && location.pathname !== pinSetupPath) {
    const next = getSafeRedirectTarget(location.pathname, location.search);
    if (isSameAppLocation(`${pinSetupPath}?next=${encodeURIComponent(next)}`, location.pathname, location.search, location.hash)) {
      return children;
    }
    return <Navigate to={`${pinSetupPath}?next=${encodeURIComponent(next)}`} replace />;
  }
  if (location.pathname !== pinValidationPath && !User.isCurrentDeviceTrusted?.(currentUser)) {
    const next = getSafeRedirectTarget(location.pathname, location.search);
    if (isSameAppLocation(`${pinValidationPath}?next=${encodeURIComponent(next)}`, location.pathname, location.search, location.hash)) {
      return children;
    }
    return <Navigate to={`${pinValidationPath}?next=${encodeURIComponent(next)}`} replace />;
  }

  return children;
}

function RedirectAuthenticatedUser({ authEnabled, authReady, currentUser, children }) {
  const location = useLocation();

  if (!authEnabled) return children;
  if (!authReady) return <FullScreenAuthLoader />;
  if (currentUser && currentUser.active !== false) {
    if (currentUser?.onboarding_status === "pendente") {
      const target = `${createPageUrl("CompletarCadastro")}?next=${encodeURIComponent(getSafeNextPathFromSearch(location.search))}`;
      if (isSameAppLocation(target, location.pathname, location.search, location.hash)) {
        return children;
      }
      return <Navigate to={target} replace />;
    }
    if (currentUser?.pin_required_reset === true) {
      const target = `${createPageUrl("DefinirPin")}?next=${encodeURIComponent(getSafeNextPathFromSearch(location.search))}`;
      if (isSameAppLocation(target, location.pathname, location.search, location.hash)) {
        return children;
      }
      return <Navigate to={target} replace />;
    }
    if (!User.isCurrentDeviceTrusted?.(currentUser)) {
      const target = `${createPageUrl("ValidarPin")}?next=${encodeURIComponent(getSafeNextPathFromSearch(location.search))}`;
      if (isSameAppLocation(target, location.pathname, location.search, location.hash)) {
        return children;
      }
      return <Navigate to={target} replace />;
    }
    const nextTarget = getSafeNextPathFromSearch(location.search);
    if (isSameAppLocation(nextTarget, location.pathname, location.search, location.hash)) {
      return children;
    }
    return <Navigate to={nextTarget} replace />;
  }

  return children;
}

function PagesContent() {
  const location = useLocation();
  const currentPage = getPageNameFromPath(location.pathname);
  const authEnabled = typeof User.requiresLogin === "function" ? User.requiresLogin() : false;
  const [authReady, setAuthReady] = useState(!authEnabled);
  const [currentUser, setCurrentUser] = useState(null);
  const [unitScopeVersion, setUnitScopeVersion] = useState(0);

  useEffect(() => {
    const samples = recordNavigationSample(location.pathname, location.search);
    if (!shouldTriggerAuthRecovery(samples) || wasRecentlyRecovered()) {
      return;
    }

    console.warn("Auth navigation loop detected. Clearing browser auth state.");
    clearCorruptedBrowserAuthState();
    window.location.replace(buildRecoveredLoginUrl());
  }, [location.pathname, location.search]);

  useEffect(() => {
    let mounted = true;

    async function syncCurrentUser() {
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
      }
    }

    async function loadCurrentUser() {
      if (!authEnabled) {
        if (mounted) {
          await syncCurrentUser();
          setAuthReady(true);
        }
        return;
      }

      try {
        await syncCurrentUser();
      } finally {
        if (mounted) {
          setAuthReady(true);
        }
      }
    }

    loadCurrentUser();

    const subscription = User.onAuthStateChange?.(async () => {
      try {
        await syncCurrentUser();
        if (mounted) {
          setAuthReady(true);
        }
      } catch (error) {
        if (mounted) {
          setCurrentUser(null);
          setAuthReady(true);
        }
      }
    });

    const handleUnitChanged = async () => {
      await syncCurrentUser();
      if (mounted) {
        setUnitScopeVersion((current) => current + 1);
      }
    };

    window.addEventListener(ACTIVE_UNIT_EVENT, handleUnitChanged);

    return () => {
      mounted = false;
      window.removeEventListener(ACTIVE_UNIT_EVENT, handleUnitChanged);
      subscription?.unsubscribe?.();
    };
  }, [authEnabled]);

  const protectedLayoutPages = Object.keys(PAGES).filter((pageName) => !STANDALONE_PAGES.has(pageName));
  const privateStandalonePages = Object.keys(PAGES).filter((pageName) => STANDALONE_PAGES.has(pageName) && !PUBLIC_PAGES.has(pageName) && pageName !== "Login");

  return (
    <Routes>
      <Route path="/" element={<Navigate to={createPageUrl("Dev_Dashboard")} replace />} />

      <Route
        path={createPageUrl("Login")}
        element={(
          <RedirectAuthenticatedUser authEnabled={authEnabled} authReady={authReady} currentUser={currentUser}>
            <StandalonePage pageName="Login" />
          </RedirectAuthenticatedUser>
        )}
      />

      {PUBLIC_PAGES.has("AuthCallback") ? (
        <Route path={createPageUrl("AuthCallback")} element={<StandalonePage pageName="AuthCallback" />} />
      ) : null}

      {PUBLIC_PAGES.has("CompletarCadastro") ? (
        <Route path={createPageUrl("CompletarCadastro")} element={<StandalonePage pageName="CompletarCadastro" />} />
      ) : null}

      {PUBLIC_PAGES.has("CadastroClientePublico") ? (
        <Route path={createPageUrl("CadastroClientePublico")} element={<StandalonePage pageName="CadastroClientePublico" />} />
      ) : null}

      {PUBLIC_PAGES.has("VisualizadorImagem") ? (
        <Route path={createPageUrl("VisualizadorImagem")} element={<StandalonePage pageName="VisualizadorImagem" />} />
      ) : null}

      {privateStandalonePages.map((pageName) => (
        <Route
          key={`standalone-private-${pageName}`}
          path={createPageUrl(pageName)}
          element={(
            <RequireAuth authEnabled={authEnabled} authReady={authReady} currentUser={currentUser}>
              <StandalonePage pageName={pageName} />
            </RequireAuth>
          )}
        />
      ))}

      <Route
        element={(
          <RequireAuth authEnabled={authEnabled} authReady={authReady} currentUser={currentUser}>
            <ProtectedLayout currentPageName={currentPage} currentUser={currentUser} />
          </RequireAuth>
        )}
      >
        {protectedLayoutPages.map((pageName) => (
          <Route
            key={`protected-${pageName}`}
            path={createPageUrl(pageName)}
            element={<ProtectedPage pageName={pageName} currentUser={currentUser} unitScopeVersion={unitScopeVersion} />}
          />
        ))}
      </Route>

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
