export const PAGE_ROUTES: Record<string, string> = {
    Login: "login",
    AuthCallback: "auth-callback",
    CompletarCadastro: "completar-cadastro",
    CadastroClientePublico: "cadastro-cliente",
    CadastroMonitorPublico: "cadastro-funcionario",
    DefinirPin: "definir-pin",
    ValidarPin: "validar-pin",
    Dev_Dashboard: "dashboard",
    Backup: "backup",
    Registrador: "registrador",
    Agenda_Comercial: "agenda-comercial",
    Cadastro: "cadastro",
    Perfis: "perfis",
    Planos: "planos",
    Cockpit: "cockpit",
    ControleGerencial: "controle-gerencial",
    Escalacao: "escalacao",
    ContasReceber: "contas-receber",
    PedidosInternos: "pedidos-internos",
    Movimentacoes: "movimentacoes",
    Receitas: "receitas",
    ContasPagar: "contas-pagar",
    RelatoriosCaes: "relatorios-caes",
    PerfilCao: "perfil-cao",
    Orcamentos: "orcamentos",
    ConfiguracoesPrecos: "configuracoes-precos",
    HistoricoOrcamentos: "historico-orcamentos",
    Agendamentos: "agendamentos",
    PlanosConfig: "planos-config",
    Despesas: "despesas",
    ConfigurarIntegracoes: "integracoes",
    AdministracaoSistema: "administracao",
    VisualizadorImagem: "visualizador-imagem",
};

const IMAGE_VIEW_STORAGE_PREFIX = "image_view_payload_";

function normalizeLegacySlug(pageName: string) {
    return pageName.toLowerCase().replace(/ /g, "-");
}

export function createPageUrl(pageName: string) {
    return "/" + (PAGE_ROUTES[pageName] || normalizeLegacySlug(pageName));
}

export function getPageNameFromPath(pathname: string) {
    const cleanPath = pathname.replace(/\/+$/, "") || "/";
    if (cleanPath === "/") {
        return "Dev_Dashboard";
    }

    const slug = cleanPath.split("/").pop()?.split("?")[0] || "";
    const matched = Object.entries(PAGE_ROUTES).find(([, routeSlug]) => routeSlug.toLowerCase() === slug.toLowerCase());
    if (matched) return matched[0];

    const legacyMatched = Object.keys(PAGE_ROUTES).find((pageName) => {
        return pageName.toLowerCase() === slug.toLowerCase() || normalizeLegacySlug(pageName) === slug.toLowerCase();
    });

    return legacyMatched || "Dev_Dashboard";
}

export function isImagePreviewable(value?: string | null) {
    if (!value) return false;
    if (value.startsWith("data:image/")) return true;
    return /\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?.*)?$/i.test(value);
}

export function openImageViewer(src: string, title = "Imagem") {
    if (!src || typeof window === "undefined") return;

    const key = `${IMAGE_VIEW_STORAGE_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(key, JSON.stringify({ src, title, createdAt: Date.now() }));
    window.open(`${createPageUrl("VisualizadorImagem")}?imageKey=${encodeURIComponent(key)}`, "_blank", "noopener,noreferrer");
}

export function getImageViewerPayload(imageKey: string | null) {
    if (!imageKey || typeof window === "undefined") return null;

    try {
        const raw = localStorage.getItem(imageKey);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        return null;
    }
}
