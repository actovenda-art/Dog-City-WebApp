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

import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';

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
    
}

function _getCurrentPage(url) {
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    let urlLastPart = url.split('/').pop();
    if (urlLastPart.includes('?')) {
        urlLastPart = urlLastPart.split('?')[0];
    }

    const pageName = Object.keys(PAGES).find(page => page.toLowerCase() === urlLastPart.toLowerCase());
    return pageName || Object.keys(PAGES)[0];
}

// Create a wrapper component that uses useLocation inside the Router context
function PagesContent() {
    const location = useLocation();
    const currentPage = _getCurrentPage(location.pathname);
    
    return (
        <Layout currentPageName={currentPage}>
            <Routes>            
                
                    <Route path="/" element={<Dev_Dashboard />} />
                
                
                <Route path="/Dev_Dashboard" element={<Dev_Dashboard />} />
                
                <Route path="/Backup" element={<Backup />} />
                
                <Route path="/Registrador" element={<Registrador />} />
                
                <Route path="/Agenda_Comercial" element={<Agenda_Comercial />} />
                
                <Route path="/Cadastro" element={<Cadastro />} />
                
                <Route path="/Planos" element={<Planos />} />
                
                <Route path="/Cockpit" element={<Cockpit />} />
                
                <Route path="/ContasReceber" element={<ContasReceber />} />
                
                <Route path="/PedidosInternos" element={<PedidosInternos />} />
                
                <Route path="/Movimentacoes" element={<Movimentacoes />} />
                
                <Route path="/Receitas" element={<Receitas />} />
                
                <Route path="/ContasPagar" element={<ContasPagar />} />
                
                <Route path="/RelatoriosCaes" element={<RelatoriosCaes />} />
                
                <Route path="/PerfilCao" element={<PerfilCao />} />
                
                <Route path="/Orcamentos" element={<Orcamentos />} />
                
                <Route path="/ConfiguracoesPrecos" element={<ConfiguracoesPrecos />} />
                
                <Route path="/HistoricoOrcamentos" element={<HistoricoOrcamentos />} />
                
                <Route path="/Agendamentos" element={<Agendamentos />} />
                
                <Route path="/PlanosConfig" element={<PlanosConfig />} />
                
                <Route path="/ServicosPrestados" element={<ServicosPrestados />} />
                
                <Route path="/Despesas" element={<Despesas />} />
                
                <Route path="/ConfigurarIntegracoes" element={<ConfigurarIntegracoes />} />
                
            </Routes>
        </Layout>
    );
}

export default function Pages() {
    return (
        <Router>
            <PagesContent />
        </Router>
    );
}