
import React, { useState, useEffect } from "react";
import { User } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
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
  Truck
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import LoadingScreen from "@/components/layout/LoadingScreen";
import NotificationBell from "@/components/layout/NotificationBell";

export default function Layout({ children, currentPageName }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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

  const loadUser = async () => {
    try {
      const user = await User.me();
      setCurrentUser(user);
    } catch (error) {
      console.error("Erro ao carregar usuário:", error);
    }
    setIsLoading(false);
  };

  const handleLogout = async () => {
    await User.logout();
    window.location.reload();
  };

  const handleLoadingComplete = () => {
    setShowLoadingScreen(false);
  };

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
            { title: "Relatórios Cães", url: createPageUrl("RelatoriosCaes"), icon: BarChart3 },
          ]
        },
        {
          id: "sistema",
          title: "Sistema",
          icon: Settings,
          items: [
            { title: "Gestão de Usuários", url: createPageUrl("Dev_Dashboard"), icon: Shield },
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
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d30bcc5ca43f0f9b7df581/b25f6333e_Capturadetela2025-09-24192240.png"
              alt="Dog City Brasil"
              className="h-10 w-10"
            />
            <div>
              <h1 className="text-lg font-bold text-gray-900">Dog City Brasil</h1>
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
                                      const isActive = currentPageName === item.url.split('?')[0].split('/').pop();

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
          <div className="p-4 border-t border-gray-200">
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
          <div className="flex items-center gap-3">
            <img 
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d30bcc5ca43f0f9b7df581/b25f6333e_Capturadetela2025-09-24192240.png"
              alt="Dog City Brasil"
              className="h-8 w-8"
            />
            <div>
              <h1 className="text-sm font-bold text-gray-900">Dog City Brasil</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {currentUser && <NotificationBell userId={currentUser.id} />}
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
                                          const isActive = currentPageName === item.url.split('?')[0].split('/').pop();

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
              <div className="p-4 border-t border-gray-200">
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
