import React, { useEffect, useMemo, useState } from "react";
import { AppAsset, Empresa, User } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Link, Outlet } from "react-router-dom";
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
  Users,
  Wallet,
  Building2,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import LoadingScreen from "@/components/layout/LoadingScreen";
import NotificationBell from "@/components/layout/NotificationBell";
import { hasPageAccess, isOperationalProfile } from "@/lib/access-control";
import { isPageBlockedInMergedMode } from "@/lib/unit-page-policy";
import {
  ACTIVE_UNIT_EVENT,
  getStoredUnitSelection,
  getUnitDisplayName,
  resolveDogCityUnit,
  setStoredUnitSelection,
} from "@/lib/unit-context";

function getUserNickname(user) {
  const nickname = user?.contact_nickname || user?.display_name || user?.nickname || "";
  if (nickname) return nickname;
  if (user?.full_name) return user.full_name.split(" ")[0];
  return user?.email?.split("@")?.[0] || "Usuário";
}

function getUnitLogo(unit, unitLogoMap = {}) {
  return unit?.metadata?.logo_url || unitLogoMap[unit?.id] || "";
}

export default function Layout({ children, currentPageName, initialUser = null }) {
  const [currentUser, setCurrentUser] = useState(initialUser);
  const [availableUnits, setAvailableUnits] = useState([]);
  const [unitLogoMap, setUnitLogoMap] = useState({});
  const [activeUnitId, setActiveUnitId] = useState("");
  const [selectedUnitIds, setSelectedUnitIds] = useState([]);
  const [isLoading, setIsLoading] = useState(!initialUser);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAccessPanelOpen, setIsAccessPanelOpen] = useState(false);
  const [isUnitPickerOpen, setIsUnitPickerOpen] = useState(false);
  const brandTitleClass = "font-brand text-gray-900";
  const showUnitSelector = availableUnits.length > 1;
  const isUnitUnionActive = selectedUnitIds.length > 1;
  const [expandedSections, setExpandedSections] = useState({
    operacional: false,
    financeiro: false,
    comercial: false,
    relatorios: false,
    sistema: false,
  });

  const isOperationalUser = isOperationalProfile(currentUser);

  const toggleSection = (section) => {
    if (isOperationalUser && section === "operacional") return;
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  useEffect(() => {
    loadUser();
  }, [initialUser?.id]);

  useEffect(() => {
    if (!initialUser) return;

    setCurrentUser((current) => current ? { ...current, ...initialUser } : initialUser);
    setIsLoading(false);
  }, [initialUser]);

  useEffect(() => {
    const handleUnitChanged = (event) => {
      const nextSelection = event?.detail || getStoredUnitSelection();
      const nextUnitId = nextSelection?.primaryUnitId || "";

      setActiveUnitId(nextUnitId);
      setSelectedUnitIds(Array.isArray(nextSelection?.selectedUnitIds) ? nextSelection.selectedUnitIds : []);
      setCurrentUser((current) => current ? {
        ...current,
        active_unit_id: nextUnitId,
        empresa_id: nextUnitId,
        selected_unit_ids: Array.isArray(nextSelection?.selectedUnitIds) ? nextSelection.selectedUnitIds : [],
        unit_selection_mode: nextSelection?.mode || "single",
      } : current);
    };

    window.addEventListener(ACTIVE_UNIT_EVENT, handleUnitChanged);
    return () => window.removeEventListener(ACTIVE_UNIT_EVENT, handleUnitChanged);
  }, []);

  const loadUser = async () => {
    try {
      const user = initialUser || await User.me();
      let resolvedUser = user;

      if (user) {
        const [unitRows, assetRows] = await Promise.all([
          Empresa.list("-created_date", 200),
          AppAsset.list("-created_date", 500).catch(() => []),
        ]);
        const allowedUnitIds = Array.isArray(user.allowed_unit_ids) && user.allowed_unit_ids.length > 0
          ? user.allowed_unit_ids
          : [user.empresa_id].filter(Boolean);
        const storedSelection = getStoredUnitSelection();
        const scopedUnits = (unitRows || []).filter((item) => allowedUnitIds.length === 0 || allowedUnitIds.includes(item.id));
        const scopedLogoMap = (assetRows || [])
          .filter((item) => item?.ativo !== false && item?.key === "branding.logo.primary" && item?.empresa_id)
          .reduce((accumulator, item) => {
            if (!allowedUnitIds.length || allowedUnitIds.includes(item.empresa_id)) {
              accumulator[item.empresa_id] = item.public_url || item.url || "";
            }
            return accumulator;
          }, {});
        const resolvedUnitId = (storedSelection.primaryUnitId && scopedUnits.some((item) => item.id === storedSelection.primaryUnitId))
          ? storedSelection.primaryUnitId
          : (resolveDogCityUnit(scopedUnits)?.id || scopedUnits?.[0]?.id || user.empresa_id || "");
        const resolvedSelectedUnitIds = (Array.isArray(user.selected_unit_ids) && user.selected_unit_ids.length > 0
          ? user.selected_unit_ids
          : storedSelection.selectedUnitIds
        ).filter((unitId) => scopedUnits.some((unit) => unit.id === unitId));
        const normalizedSelectedUnitIds = [...new Set([
          resolvedUnitId,
          ...(resolvedSelectedUnitIds.length > 0 ? resolvedSelectedUnitIds : [resolvedUnitId]),
        ].filter(Boolean))];

        if (resolvedUnitId) {
          setStoredUnitSelection({
            primaryUnitId: resolvedUnitId,
            selectedUnitIds: normalizedSelectedUnitIds,
          });
        }

        setAvailableUnits(scopedUnits);
        setUnitLogoMap(scopedLogoMap);
        setActiveUnitId(resolvedUnitId);
        setSelectedUnitIds(normalizedSelectedUnitIds);
        resolvedUser = {
          ...user,
          allowed_unit_ids: allowedUnitIds,
          active_unit_id: resolvedUnitId || null,
          selected_unit_ids: normalizedSelectedUnitIds,
          unit_selection_mode: normalizedSelectedUnitIds.length > 1 ? "merged" : "single",
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

  const handleUnitChange = (unitId) => {
    if (!unitId) return;

    setStoredUnitSelection({
      primaryUnitId: unitId,
      selectedUnitIds: [unitId],
    });

    setActiveUnitId(unitId);
    setSelectedUnitIds([unitId]);
    setCurrentUser((current) => current ? {
      ...current,
      active_unit_id: unitId,
      empresa_id: unitId,
      selected_unit_ids: [unitId],
      unit_selection_mode: "single",
    } : current);
    setIsUnitPickerOpen(false);
    setIsAccessPanelOpen(false);
    setIsMobileMenuOpen(false);
  };

  const activeUnit = availableUnits.find((unit) => unit.id === activeUnitId) || null;
  const activeUnitName = activeUnit?.nome_fantasia || getUnitDisplayName(activeUnit);
  const activeUnitLogo = getUnitLogo(activeUnit, unitLogoMap);
  const selectedUnits = useMemo(
    () => availableUnits.filter((unit) => selectedUnitIds.includes(unit.id)),
    [availableUnits, selectedUnitIds],
  );
  const userNickname = getUserNickname(currentUser);

  const menuSections = [
    {
      id: "operacional",
      title: "Operacional",
      icon: Dog,
      items: [
        { title: "Registrador", url: createPageUrl("Registrador"), icon: ClipboardCheck },
        { title: "Agendamentos", url: createPageUrl("Agendamentos"), icon: Calendar },
      ],
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
      ],
    },
    {
      id: "comercial",
      title: "Comercial",
      icon: FileText,
      items: [
        { title: "Orçamentos", url: createPageUrl("Orcamentos"), icon: FileText },
        { title: "Cadastro", url: createPageUrl("Cadastro"), icon: UserPlus },
        { title: "Perfis", url: createPageUrl("Perfis"), icon: Users },
        { title: "Planos Recorrentes", url: createPageUrl("PlanosConfig"), icon: CreditCard },
      ],
    },
    {
      id: "relatorios",
      title: "Gerência",
      icon: BarChart3,
      items: [
        { title: "Cockpit", url: createPageUrl("Cockpit"), icon: PieChart },
        { title: "Controle Gerencial", url: createPageUrl("ControleGerencial"), icon: BarChart3 },
        { title: "Relatórios Cães", url: createPageUrl("RelatoriosCaes"), icon: BarChart3 },
      ],
    },
    {
      id: "sistema",
      title: "Configurações",
      icon: Settings,
      items: [
        { title: "Gestão de Usuários", url: createPageUrl("Dev_Dashboard"), icon: Shield },
        { title: "Administração", url: createPageUrl("AdministracaoSistema"), icon: Building2 },
        { title: "Preços e descontos", url: createPageUrl("ConfiguracoesPrecos"), icon: Settings },
        { title: "Backup", url: createPageUrl("Backup"), icon: Database },
        { title: "Tarefas", url: createPageUrl("PedidosInternos"), icon: FileText },
        {
          title: "Integrações",
          url: createPageUrl("ConfigurarIntegracoes"),
          icon: Settings,
          disabled: isUnitUnionActive,
        },
      ],
    },
  ];

  const visibleMenuSections = useMemo(
    () => menuSections
      .filter((section) => !isOperationalUser || section.id === "operacional")
      .map((section) => ({
        ...section,
        items: section.items
          .filter((item) => hasPageAccess(currentUser, getPageNameFromPath(item.url)))
          .map((item) => ({
            ...item,
            title: getPageNameFromPath(item.url) === "ConfiguracoesPrecos"
              ? "Preços e descontos"
              : item.title,
          })),
      }))
      .filter((section) => section.items.length > 0),
    [currentUser, isOperationalUser, isUnitUnionActive],
  );

  useEffect(() => {
    if (isOperationalUser) {
      setExpandedSections((prev) => ({ ...prev, operacional: true }));
      return;
    }

    const activeSection = menuSections.find((section) =>
      section.items.some((item) => getPageNameFromPath(item.url) === currentPageName)
    );

    if (activeSection) {
      setExpandedSections((prev) => ({ ...prev, [activeSection.id]: true }));
    }
  }, [currentPageName, isOperationalUser]);

  const renderAccessPanel = ({ mobile = false } = {}) => (
    <div className={mobile ? "border-t border-gray-200 p-4" : "border-t border-gray-200 p-4"}>
      <button
        type="button"
        onClick={() => setIsAccessPanelOpen((current) => !current)}
        className="flex w-full items-center gap-3 rounded-xl bg-gray-50 px-3 py-3 text-left transition hover:bg-gray-100"
      >
        <span className="h-px flex-1 bg-gray-200" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.32em] text-gray-500">Acessos</span>
        <ChevronDown className={`h-4 w-4 text-gray-500 transition ${isAccessPanelOpen ? "rotate-180" : ""}`} />
        <span className="h-px flex-1 bg-gray-200" />
      </button>

      <AnimatePresence initial={false}>
        {isAccessPanelOpen && currentUser ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 pt-3">
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">Unidade em acesso</p>
                    <p className="mt-2 truncate text-sm font-semibold text-gray-900">{activeUnitName}</p>
                    {isUnitUnionActive ? (
                      <p className="mt-1 text-xs text-blue-600">
                        Visão unificada ativa com {selectedUnitIds.length} unidades selecionadas.
                      </p>
                    ) : null}
                  </div>
                  {showUnitSelector ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => setIsUnitPickerOpen((current) => !current)}>
                      Alterar
                    </Button>
                  ) : null}
                </div>

                <AnimatePresence initial={false}>
                  {isUnitPickerOpen && showUnitSelector ? (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 space-y-2">
                        {availableUnits.map((unit) => {
                          const isCurrent = unit.id === activeUnitId;
                          return (
                            <button
                              key={unit.id}
                              type="button"
                              onClick={() => handleUnitChange(unit.id)}
                              className={isCurrent
                                ? "flex w-full items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-left"
                                : "flex w-full items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-left transition hover:border-gray-300 hover:bg-white"}
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-gray-900">{unit.nome_fantasia}</p>
                                <p className="truncate text-xs text-gray-500">{unit.razao_social || "Unidade Dog City Brasil"}</p>
                              </div>
                              {isCurrent ? (
                                <span className="rounded-full bg-blue-100 px-2 py-1 text-[11px] font-semibold text-blue-700">Atual</span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">Conta conectada</p>
                <p className="mt-2 text-sm font-semibold text-gray-900">{userNickname}</p>
                <p className="mt-1 text-xs text-gray-500">{currentUser.full_name || "Nome não informado"}</p>
                <p className="mt-1 truncate text-xs text-gray-500">{currentUser.email}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  className="mt-4 w-full border-orange-300 text-orange-600 hover:bg-orange-50"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </Button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );

  const renderMenuSections = ({ mobile = false } = {}) => (
    <nav className={mobile ? "p-3 space-y-1" : "flex-1 overflow-y-auto p-3 space-y-1"}>
      {visibleMenuSections.map((section) => {
        const SectionIcon = section.icon;
        const isPinnedOperationalSection = isOperationalUser && section.id === "operacional";
        const isExpanded = isPinnedOperationalSection ? true : expandedSections[section.id];

        return (
          <div key={section.id} className="mb-1">
            {isPinnedOperationalSection ? (
              <div className="flex w-full items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-blue-700">
                <SectionIcon className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">{section.title}</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-gray-600 transition-colors hover:bg-gray-100"
              >
                <div className="flex items-center gap-2">
                  <SectionIcon className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">{section.title}</span>
                </div>
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            )}

            <AnimatePresence initial={false}>
              {isExpanded ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="mt-1 space-y-0.5 pl-2">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = currentPageName === getPageNameFromPath(item.url);
                      const itemPageName = getPageNameFromPath(item.url);
                      const isPolicyBlocked = isUnitUnionActive && isPageBlockedInMergedMode(itemPageName);
                      const isDisabled = Boolean(item.disabled || isPolicyBlocked);
                      const baseClass = isActive
                        ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm"
                        : "text-gray-700 hover:bg-orange-50 hover:text-orange-600";

                      if (isDisabled) {
                        return (
                          <div
                            key={item.title}
                            className="flex cursor-not-allowed items-center gap-3 rounded-lg border border-dashed border-amber-200 bg-amber-50 px-3 py-2 text-amber-700"
                            title={item.disabled
                              ? "Integrações ficam bloqueadas com unidades unificadas."
                              : "Esta tela opera apenas com uma unidade por vez."}
                          >
                            <Icon className="h-4 w-4" />
                            <div className="min-w-0">
                              <span className="block text-sm font-medium">{item.title}</span>
                              <span className="block text-[11px]">
                                {item.disabled ? "Bloqueado na visão unificada" : "Exige unidade única"}
                              </span>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <Link
                          key={item.title}
                          to={item.url}
                          onClick={() => {
                            if (mobile) setIsMobileMenuOpen(false);
                          }}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${baseClass}`}
                        >
                          <Icon className="h-4 w-4" />
                          <span className="text-sm">{item.title}</span>
                        </Link>
                      );
                    })}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </nav>
  );

  if (isLoading && !currentUser) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      <aside className="hidden md:flex md:fixed md:h-screen md:w-64 md:flex-col border-r border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-6">
          <div className="flex items-center gap-3">
            {activeUnitLogo ? (
              <img
                src={activeUnitLogo}
                alt={activeUnitName}
                className="h-12 w-12 rounded-2xl border border-gray-100 bg-white p-1 object-contain shadow-sm"
              />
            ) : (
              <div className="h-12 w-12 rounded-2xl border border-gray-100 bg-white shadow-sm" />
            )}
            <div className="min-w-0">
              <h1 className={`${brandTitleClass} truncate text-2xl leading-none`}>{activeUnitName}</h1>
              <p className="mt-1 truncate text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">Dog City Brasil</p>
              {isUnitUnionActive ? (
                <p className="mt-2 truncate text-xs text-blue-600">
                  {selectedUnits.map((unit) => unit.nome_fantasia).join(" + ")}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {renderMenuSections()}

        {currentUser ? renderAccessPanel() : null}
      </aside>

      <div className="fixed left-0 right-0 top-0 z-50 border-b border-gray-200 bg-white md:hidden">
        <div className="flex items-center justify-between p-4">
          <div className="min-w-0">
            <h1 className={`${brandTitleClass} truncate text-xl leading-none`}>{activeUnitName}</h1>
            <p className="mt-1 truncate text-xs uppercase tracking-[0.2em] text-gray-400">Dog City Brasil</p>
          </div>
          <div className="flex items-center gap-2">
            {currentUser ? <NotificationBell userId={currentUser.id} /> : null}
            {activeUnitLogo ? (
              <img
                src={activeUnitLogo}
                alt={activeUnitName}
                className="h-8 w-8 rounded-full object-contain"
              />
            ) : (
              <div className="h-8 w-8 rounded-full border border-gray-200 bg-white" />
            )}
            <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen((current) => !current)}>
              {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>
      </div>

      {currentUser ? (
        <div className="fixed right-6 top-4 z-50 hidden md:block">
          <NotificationBell userId={currentUser.id} />
        </div>
      ) : null}

      {isMobileMenuOpen ? (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setIsMobileMenuOpen(false)}>
          <div className="fixed bottom-0 left-0 right-0 top-16 overflow-y-auto bg-white" onClick={(event) => event.stopPropagation()}>
            {renderMenuSections({ mobile: true })}
            {currentUser ? renderAccessPanel({ mobile: true }) : null}
          </div>
        </div>
      ) : null}

      <main className="mt-16 flex-1 md:ml-64 md:mt-0">
        {children || <Outlet />}
      </main>
    </div>
  );
}
