import Layout from "./Layout.jsx";

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

import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { createPageUrl, getPageNameFromPath } from "@/utils";

const PAGES = {
    
    Dev_Dashboard: Dev_Dashboard,
    
    Backup: Backup,
    
    Registrador: Registrador,
    
    Agenda_Comercial: Agenda_Comercial,
    
    Cadastro: Cadastro,
    
    Planos: Planos,
    
    Cockpit: Cockpit,
    
    ContasReceber: ContasReceber,
    
    PedidosInternos: PedidosInternos,
    
    Movimentacoes: Movimentacoes,
    
    Receitas: Receitas,
    
    ContasPagar: ContasPagar,
    
    RelatoriosCaes: RelatoriosCaes,
    
    PerfilCao: PerfilCao,
    
    Orcamentos: Orcamentos,
    
    ConfiguracoesPrecos: ConfiguracoesPrecos,
    
    HistoricoOrcamentos: HistoricoOrcamentos,
    
    Agendamentos: Agendamentos,
    
    PlanosConfig: PlanosConfig,
    
    ServicosPrestados: ServicosPrestados,
    
    Despesas: Despesas,
    
    ConfigurarIntegracoes: ConfigurarIntegracoes,

    AdministracaoSistema: AdministracaoSistema,

    VisualizadorImagem: VisualizadorImagem,
    
}

const STANDALONE_PAGES = new Set(["VisualizadorImagem"]);

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

// Create a wrapper component that uses useLocation inside the Router context
function PagesContent() {
    const location = useLocation();
    const currentPage = getPageNameFromPath(location.pathname);
    
    return (
        <Routes>
            <Route path="/" element={<Navigate to={createPageUrl("Dev_Dashboard")} replace />} />

            {Object.keys(PAGES).map((pageName) => (
                <Route
                    key={`pretty-${pageName}`}
                    path={createPageUrl(pageName)}
                    element={<PageFrame pageName={pageName} currentPageName={currentPage} />}
                />
            ))}

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
