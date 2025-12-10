import React, { useState, useEffect, useRef } from "react";
import { Notificacao } from "@/api/entities";
import { Bell, Check, FileText, ArrowRight, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";

export default function NotificationBell({ userId }) {
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (userId) loadNotifications();
  }, [userId]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadNotifications = async () => {
    setIsLoading(true);
    try {
      const data = await Notificacao.filter({ user_id: userId }, "-created_date", 20);
      setNotifications(data);
    } catch (error) {
      console.error("Erro ao carregar notificações:", error);
    }
    setIsLoading(false);
  };

  const markAsRead = async (notif) => {
    if (notif.lida) return;
    try {
      await Notificacao.update(notif.id, { lida: true });
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, lida: true } : n));
    } catch (error) {
      console.error("Erro ao marcar como lida:", error);
    }
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter(n => !n.lida);
    try {
      await Promise.all(unread.map(n => Notificacao.update(n.id, { lida: true })));
      setNotifications(prev => prev.map(n => ({ ...n, lida: true })));
    } catch (error) {
      console.error("Erro ao marcar todas como lidas:", error);
    }
  };

  const unreadCount = notifications.filter(n => !n.lida).length;

  const getNotificationIcon = (tipo) => {
    switch (tipo) {
      case "tarefa_atribuida":
      case "tarefa_atualizada":
      case "tarefa_movida":
        return FileText;
      default:
        return Bell;
    }
  };

  const formatTime = (date) => {
    if (!date) return "";
    const d = new Date(date);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Agora";
    if (diffMins < 60) return `${diffMins}min`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return format(d, "dd/MM", { locale: ptBR });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl hover:bg-slate-100 transition-colors"
      >
        <Bell className="w-5 h-5 text-slate-600" />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-gradient-to-r from-red-500 to-rose-500 text-white text-xs font-bold rounded-full flex items-center justify-center shadow-lg"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </motion.span>
        )}
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50"
          >
            {/* Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Notificações</h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                  >
                    <Check className="w-3 h-3" />
                    Marcar todas como lidas
                  </button>
                )}
                <button
                  onClick={loadNotifications}
                  className="p-1 rounded-lg hover:bg-slate-100 transition-colors"
                  disabled={isLoading}
                >
                  <RefreshCw className={`w-4 h-4 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Notifications List */}
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-12 text-center">
                  <Bell className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">Nenhuma notificação</p>
                </div>
              ) : (
                notifications.map((notif) => {
                  const Icon = getNotificationIcon(notif.tipo);
                  return (
                    <Link
                      key={notif.id}
                      to={notif.link || createPageUrl("PedidosInternos")}
                      onClick={() => { markAsRead(notif); setIsOpen(false); }}
                      className={`flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-50 ${
                        !notif.lida ? 'bg-blue-50/50' : ''
                      }`}
                    >
                      <div className={`mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        !notif.lida 
                          ? 'bg-gradient-to-br from-blue-500 to-indigo-600' 
                          : 'bg-slate-100'
                      }`}>
                        <Icon className={`w-4 h-4 ${!notif.lida ? 'text-white' : 'text-slate-500'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate ${!notif.lida ? 'font-semibold text-slate-800' : 'text-slate-700'}`}>
                          {notif.titulo}
                        </p>
                        {notif.mensagem && (
                          <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{notif.mensagem}</p>
                        )}
                        <p className="text-xs text-slate-400 mt-1">{formatTime(notif.created_date)}</p>
                      </div>
                      {!notif.lida && (
                        <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0"></div>
                      )}
                    </Link>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">
                <Link
                  to={createPageUrl("PedidosInternos")}
                  onClick={() => setIsOpen(false)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center justify-center gap-1"
                >
                  Ver todas as tarefas
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}