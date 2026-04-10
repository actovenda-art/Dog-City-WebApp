
import React, { useState, useEffect } from "react";
import { Empresa, User } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl, getPageNameFromPath } from "@/utils";
import { 
  LogOut,
  Shield,
  Database,
  ClipboardCheck,
  Calendar,
  UserPlus,
  CreditCard,
  BarChart3,
  DollarSign,
  TrendingUp,
  PieChart,
  FileText,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  Settings,
  Dog,
  Wallet,
  Truck,
  Building2
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import LoadingScreen from "@/components/layout/LoadingScreen";
import NotificationBell from "@/components/layout/NotificationBell";
import { OFFICIAL_DOG_CITY_LOGO_URL, useBranding } from "@/hooks/use-branding";
import { ACTIVE_UNIT_EVENT, getStoredActiveUnitId, getUnitDisplayName, resolveDogCityUnit, setStoredActiveUnitId } from "@/lib/unit-context";

export default function Layout({ children, currentPageName }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [availableUnits, setAvailableUnits] = useState([]);
  const [activeUnitId, setActiveUnitId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const brandTitleClass = "font-brand text-gray-900";
  const { companyName: brandName } = useBranding({ variant: "base", updateDocument: false });
  const showUnitSelector = availableUnits.length > 1;
  const [expandedSections, setExpandedSections] = useState({
    operacional: false,
    financeiro: false,
    orcamentos: false,
    relatorios: false,
    sistema: false
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    const handleUnitChanged = (event) => {
      const nextUnitId = event?.detail?.unitId || getStoredActiveUnitId();
      if (!nextUnitId) return;

      setActiveUnitId(nextUnitId);
      setCurrentUser((current) => current ? {
        ...current,
        active_unit_id: nextUnitId,
        empresa_id: nextUnitId,
      } : current);
    };

    window.addEventListener(ACTIVE_UNIT_EVENT, handleUnitChanged);
    return () => window.removeEventListener(ACTIVE_UNIT_EVENT, handleUnitChanged);
  }, []);

  const loadUser = async () => {
    try {
      const user = await User.me();
      let resolvedUser = user;

      if (user) {
        const unitRows = await Empresa.list("-created_date", 200);
        const baseUnit = resolveDogCityUnit(unitRows || []);
        const allowedUnitIds = Array.isArray(user.allowed_unit_ids) && user.allowed_unit_ids.length > 0
          ? user.allowed_unit_ids
          : [user.empresa_id].filter(Boolean);
        const storedUnitId = getStoredActiveUnitId();
        const scopedUnits = (unitRows || []).filter((item) => allowedUnitIds.length === 0 || allowedUnitIds.includes(item.id));
        const resolvedUnitId = (storedUnitId && scopedUnits.some((item) => item.id === storedUnitId))
          ? storedUnitId
          : (resolveDogCityUnit(scopedUnits)?.id || scopedUnits?.[0]?.id || user.empresa_id || "");

        if (resolvedUnitId) {
          setStoredActiveUnitId(resolvedUnitId);
        }

        setAvailableUnits(scopedUnits);
        setActiveUnitId(resolvedUnitId);
        resolvedUser = {
          ...user,
          allowed_unit_ids: allowedUnitIds,
          active_unit_id: resolvedUnitId || null,
          empresa_id: resolvedUnitId || user.empresa_id || null,
        };
      }

      setCurrentUser(resolvedUser);
    } catch (error) {
      console.error("Erro ao carregar usuário:", error);
    }
    setIsLoading(false);
  };

  const handleLogout = async () => {
    await User.logout();
    window.location.reload();
  };

  const handleUnitChange = (value) => {
    if (!value || value === activeUnitId) return;
    setStoredActiveUnitId(value);
    setActiveUnitId(value);
    setCurrentUser((current) => current ? {
      ...current,
      active_unit_id: value,
      empresa_id: value,
    } : current);
    setIsMobileMenuOpen(false);
    window.location.reload();
  };

  const handleLoadingComplete = () => {
    setShowLoadingScreen(false);
  };

  const activeUnit = availableUnits.find((unit) => unit.id === activeUnitId) || null;
  const activeUnitName = activeUnit?.nome_fantasia || getUnitDisplayName(activeUnit);
  const officialLogoUrl = OFFICIAL_DOG_CITY_LOGO_URL;

  const menuSections = [
        {
          id: "operacional",
          title: "Operacional",
          icon: Dog,
          items: [
            { title: "Registrador", url: createPageUrl("Registrador"), icon: ClipboardCheck },
            { title: "Agendamentos", url: createPageUrl("Agendamentos"), icon: Calendar },
            { title: "Serviços Prestados", url: createPageUrl("ServicosPrestados"), icon: ClipboardCheck },
            { title: "Cadastro", url: createPageUrl("Cadastro"), icon: UserPlus },
            { title: "Planos Recorrentes", url: createPageUrl("PlanosConfig"), icon: CreditCard },
          ]
        },
        {
          id: "financeiro",
          title: "Financeiro",
          icon: Wallet,
          items: [
            { title: "Transações", url: createPageUrl("Movimentacoes"), icon: DollarSign },
            { title: "Receitas", url: createPageUrl("Receitas"), icon: TrendingUp },
            { title: "Despesas", url: createPageUrl("Despesas"), icon: TrendingUp },
            { title: "Contas a Pagar", url: createPageUrl("ContasPagar"), icon: DollarSign },
            { title: "Contas a Receber", url: createPageUrl("ContasReceber"), icon: TrendingUp },
          ]
        },
        {
          id: "orcamentos",
          title: "Orçamentos",
          icon: FileText,
          items: [
            { title: "Novo Orçamento", url: createPageUrl("Orcamentos"), icon: FileText },
            { title: "Histórico", url: createPageUrl("HistoricoOrcamentos"), icon: FileText },
            { title: "Config. Preços", url: createPageUrl("ConfiguracoesPrecos"), icon: Settings },
          ]
        },
        {
          id: "relatorios",
          title: "Relatórios",
          icon: BarChart3,
          items: [
            { title: "Cockpit", url: createPageUrl("Cockpit"), icon: PieChart },
            { title: "Controle Gerencial", url: createPageUrl("ControleGerencial"), icon: BarChart3 },
            { title: "Relatórios Cães", url: createPageUrl("RelatoriosCaes"), icon: BarChart3 },
          ]
        },
        {
          id: "sistema",
          title: "Sistema",
          icon: Settings,
          items: [
            { title: "Gestão de Usuários", url: createPageUrl("Dev_Dashboard"), icon: Shield },
            { title: "Administração", url: createPageUrl("AdministracaoSistema"), icon: Building2 },
            { title: "Backup", url: createPageUrl("Backup"), icon: Database },
            { title: "Tarefas", url: createPageUrl("PedidosInternos"), icon: FileText },
            { title: "Integrações", url: createPageUrl("ConfigurarIntegracoes"), icon: Settings },
          ]
        }
      ];

  // Show loading screen on initial load
  if (isLoading || showLoadingScreen) {
    return (
      <AnimatePresence>
        {(isLoading || showLoadingScreen) && (
          <LoadingScreen onComplete={handleLoadingComplete} />
        )}
      </AnimatePresence>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex md:flex-col w-64 bg-white border-r border-gray-200 fixed h-screen">
        {/* Logo */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <img 
              src={officialLogoUrl}
              alt={brandName}
              className="h-12 w-12 rounded-2xl border border-gray-100 bg-white p-1 object-contain shadow-sm"
            />
            <div className="min-w-0">
              <h1 className={`${brandTitleClass} truncate text-2xl leading-none`}>{brandName}</h1>
              <p className="mt-1 truncate text-sm font-medium text-gray-600">{activeUnitName}</p>
            </div>
          </div>
        </div>

        {/* Menu Items */}
                    <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                      {menuSections.map((section) => {
                        const SectionIcon = section.icon;
                        const isExpanded = expandedSections[section.id];

                        return (
                          <div key={section.id} className="mb-1">
                            <button
                              onClick={() => toggleSection(section.id)}
                              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <SectionIcon className="w-4 h-4" />
                                <span className="text-xs font-semibold uppercase tracking-wider">{section.title}</span>
                              </div>
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>

                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="pl-2 space-y-0.5 mt-1">
                                    {section.items.map((item) => {
                                      const Icon = item.icon;
                                      const isActive = currentPageName === getPageNameFromPath(item.url);

                                      return (
                                        <Link
                                          key={item.title}
                                          to={item.url}
                                          className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                                            isActive
                                              ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm'
                                              : 'text-gray-700 hover:bg-orange-50 hover:text-orange-600'
                                          }`}
                                        >
                                          <Icon className="w-4 h-4" />
                                          <span className="text-sm">{item.title}</span>
                                        </Link>
                                      );
                                    })}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </nav>

        {/* User Info */}
        {currentUser && (
          <div className="border-t border-gray-200 p-4">
            <div className="mb-4 rounded-2xl border border-gray-200 bg-gray-50 p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">Unidade ativa</p>
              {showUnitSelector ? (
                <select
                  value={activeUnitId}
                  onChange={(event) => handleUnitChange(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                >
                  {availableUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>{unit.nome_fantasia}</option>
                  ))}
                </select>
              ) : (
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
                  {activeUnitName}
                </div>
              )}
            </div>
            <div className="mb-3">
              <p className="text-sm font-medium text-gray-900 truncate">{currentUser.full_name}</p>
              <p className="text-xs text-gray-600 truncate">{currentUser.email}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="w-full border-orange-300 text-orange-600 hover:bg-orange-50"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sair
            </Button>
          </div>
        )}
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-50">
        <div className="flex items-center justify-between p-4">
          <div className="min-w-0">
            <div>
              <h1 className={`${brandTitleClass} truncate text-xl leading-none`}>{brandName}</h1>
              {activeUnitId ? (
                <p className="mt-1 truncate text-xs text-gray-500">
                  {activeUnitName}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {currentUser && <NotificationBell userId={currentUser.id} />}
            <img
              src={officialLogoUrl}
              alt={brandName}
              className="h-8 w-8 rounded-full object-contain"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Desktop Notification Bell - Fixed position */}
      {currentUser && (
        <div className="hidden md:block fixed top-4 right-6 z-50">
          <NotificationBell userId={currentUser.id} />
        </div>
      )}

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-40" onClick={() => setIsMobileMenuOpen(false)}>
          <div className="fixed top-16 left-0 right-0 bottom-0 bg-white overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <nav className="p-3 space-y-1">
                              {menuSections.map((section) => {
                                const SectionIcon = section.icon;
                                const isExpanded = expandedSections[section.id];

                                return (
                                  <div key={section.id} className="mb-1">
                                    <button
                                      onClick={() => toggleSection(section.id)}
                                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100"
                                    >
                                      <div className="flex items-center gap-2">
                                        <SectionIcon className="w-4 h-4" />
                                        <span className="text-xs font-semibold uppercase">{section.title}</span>
                                      </div>
                                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                    </button>

                                    {isExpanded && (
                                      <div className="pl-2 space-y-0.5 mt-1">
                                        {section.items.map((item) => {
                                          const Icon = item.icon;
                                          const isActive = currentPageName === getPageNameFromPath(item.url);

                                          return (
                                            <Link
                                              key={item.title}
                                              to={item.url}
                                              onClick={() => setIsMobileMenuOpen(false)}
                                              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                                                isActive ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm' : 'text-gray-700 hover:bg-orange-50 hover:text-orange-600'
                                              }`}
                                            >
                                              <Icon className="w-4 h-4" />
                                              <span className="text-sm">{item.title}</span>
                                            </Link>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </nav>

            {currentUser && (
              <div className="border-t border-gray-200 p-4">
                <div className="mb-4 rounded-2xl border border-gray-200 bg-gray-50 p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">Unidade ativa</p>
                  {showUnitSelector ? (
                    <select
                      value={activeUnitId}
                      onChange={(event) => handleUnitChange(event.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                    >
                      {availableUnits.map((unit) => (
                        <option key={unit.id} value={unit.id}>{unit.nome_fantasia}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
                      {activeUnitName}
                    </div>
                  )}
                </div>
                <div className="mb-3">
                  <p className="text-sm font-medium text-gray-900">{currentUser.full_name}</p>
                  <p className="text-xs text-gray-600">{currentUser.email}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  className="w-full border-orange-300 text-orange-600 hover:bg-orange-50"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sair
                </Button>
                </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 md:ml-64 mt-16 md:mt-0">
        {children}
      </main>
    </div>
  );
}
