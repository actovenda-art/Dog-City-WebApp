import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Bell,
  BellRing,
  Check,
  ClipboardList,
  FileText,
  RefreshCw,
} from "lucide-react";
import { Appointment, Notificacao } from "@/api/entities";
import { getAppointmentMeta, getManualAppointmentClassificationMessage } from "@/lib/attendance";
import { getNotificationDepartment } from "@/lib/access-control";
import { createPageUrl } from "@/utils";

const PENDING_TYPES = new Set([
  "agendamento_sem_presenca",
  "agendamento_manual_pendente",
]);

const REMINDER_TYPES = new Set([
  "lembrete_checkin",
]);

const COMMUNICATION_SCOPES = {
  comunicado_geral: "geral",
  comunicado_operacional: "operacao",
  comunicado_comercial: "comercial",
};

function parseNotificationPayload(notification) {
  if (!notification?.payload) return {};
  if (typeof notification.payload === "object") return notification.payload;
  try {
    return JSON.parse(notification.payload);
  } catch {
    return {};
  }
}

function isRead(notification) {
  return notification?.lida ?? notification?.lido ?? false;
}

function isPendingNotification(notification) {
  return PENDING_TYPES.has(notification?.tipo);
}

function isReminderNotification(notification) {
  return REMINDER_TYPES.has(notification?.tipo);
}

function getCommunicationScope(notification) {
  const explicitScope = COMMUNICATION_SCOPES[notification?.tipo];
  if (explicitScope) return explicitScope;

  const payload = notification?.parsedPayload || parseNotificationPayload(notification);
  const rawScope = String(
    payload?.communication_scope || payload?.comunicado_tipo || payload?.comunicado_setor || ""
  )
    .trim()
    .toLowerCase();

  if (["geral", "general"].includes(rawScope)) return "geral";
  if (["operacao", "operacional"].includes(rawScope)) return "operacao";
  if (["comercial"].includes(rawScope)) return "comercial";
  return null;
}

function isCommunicationNotification(notification) {
  return Boolean(getCommunicationScope(notification));
}

function getDepartmentLabel(department) {
  if (department === "operacional") return "Operacional";
  if (department === "comercial") return "Comercial";
  return "Gerencial";
}

function shouldShowPendingForDepartment(notification, department) {
  if (!isPendingNotification(notification)) return false;
  return department === "comercial" || department === "gerencial";
}

function shouldShowNoticeForDepartment(notification, department) {
  if (isReminderNotification(notification)) {
    return department === "comercial" || department === "gerencial";
  }

  if (isCommunicationNotification(notification)) {
    const scope = getCommunicationScope(notification);

    if (department === "gerencial") {
      return ["geral", "operacao", "comercial"].includes(scope);
    }

    if (department === "operacional") {
      return ["geral", "operacao"].includes(scope);
    }
  }

  return false;
}

function resolveNotificationLink(notification) {
  if (notification?.link) return notification.link;

  switch (notification?.tipo) {
    case "agendamento_sem_presenca":
    case "agendamento_manual_pendente":
      return createPageUrl("Agendamentos");
    case "lembrete_checkin":
      return createPageUrl("Registrador");
    case "comunicado_geral":
    case "comunicado_operacional":
    case "comunicado_comercial":
      return "#";
    default:
      return "#";
  }
}

function getNotificationIcon(type) {
  switch (type) {
    case "agendamento_sem_presenca":
      return AlertTriangle;
    case "agendamento_manual_pendente":
      return ClipboardList;
    case "lembrete_checkin":
      return BellRing;
    case "comunicado_geral":
    case "comunicado_operacional":
    case "comunicado_comercial":
      return FileText;
    default:
      return Bell;
  }
}

function getNotificationBadge(notification) {
  if (isPendingNotification(notification)) {
    return {
      label: "Pendência",
      className: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }

  if (isCommunicationNotification(notification)) {
    return {
      label: "Comunicado",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  return {
    label: "Aviso",
    className: "border-blue-200 bg-blue-50 text-blue-700",
  };
}

function getNotificationIconTone(notification) {
  if (isPendingNotification(notification)) {
    return {
      active: "bg-gradient-to-br from-rose-500 to-red-600 text-white",
      idle: "bg-rose-100 text-rose-600",
    };
  }

  if (isCommunicationNotification(notification)) {
    return {
      active: "bg-gradient-to-br from-amber-500 to-orange-600 text-white",
      idle: "bg-amber-100 text-amber-600",
    };
  }

  if (isReminderNotification(notification)) {
    return {
      active: "bg-gradient-to-br from-blue-500 to-indigo-600 text-white",
      idle: "bg-blue-100 text-blue-600",
    };
  }

  return {
    active: "bg-gradient-to-br from-slate-500 to-slate-700 text-white",
    idle: "bg-slate-100 text-slate-500",
  };
}

function formatRelativeTime(date) {
  if (!date) return "";
  const currentDate = new Date();
  const parsedDate = new Date(date);
  const diffMs = currentDate - parsedDate;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Agora";
  if (diffMins < 60) return `${diffMins} min`;
  if (diffHours < 24) return `${diffHours} h`;
  if (diffDays < 7) return `${diffDays} d`;
  return format(parsedDate, "dd/MM", { locale: ptBR });
}

function getDisplayCopy(notification, appointmentsById = {}) {
  const payload = notification?.parsedPayload || parseNotificationPayload(notification);
  const appointment = appointmentsById[payload?.appointment_id];

  if (notification?.tipo === "agendamento_manual_pendente") {
    return {
      title: "Agendamento manual",
      message: getManualAppointmentClassificationMessage(appointment),
    };
  }

  return {
    title: notification?.titulo,
    message: notification?.mensagem,
  };
}

function NotificationSection({ title, items, onOpenItem, pendingContextLoaded }) {
  if (items.length === 0) return null;

  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <div className="sticky top-0 z-10 bg-white px-4 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
          {title}
        </p>
        {title === "Pendências do departamento" && !pendingContextLoaded ? (
          <p className="mt-1 text-xs text-slate-400">Conferindo pendências em aberto...</p>
        ) : null}
      </div>

      <div>
        {items.map((notification) => {
          const Icon = getNotificationIcon(notification?.tipo);
          const tones = getNotificationIconTone(notification);
          const badge = getNotificationBadge(notification);
          const read = isRead(notification);

          return (
            <Link
              key={notification.id}
              to={resolveNotificationLink(notification)}
              onClick={() => onOpenItem(notification)}
              className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50 ${
                !read && !isPendingNotification(notification) ? "bg-blue-50/40" : ""
              }`}
            >
              <div
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${
                  !read || isPendingNotification(notification) ? tones.active : tones.idle
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={`truncate text-sm ${!read ? "font-semibold text-slate-800" : "text-slate-700"}`}>
                    {notification.displayTitle}
                  </p>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>

                {notification.displayMessage ? (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{notification.displayMessage}</p>
                ) : null}

                <p className="mt-1 text-xs text-slate-400">{formatRelativeTime(notification.created_date)}</p>
              </div>

              {!read && !isPendingNotification(notification) ? (
                <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function NotificationBell({ userId, user = null }) {
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPendingContext, setIsLoadingPendingContext] = useState(false);
  const [pendingContextLoaded, setPendingContextLoaded] = useState(false);
  const [appointmentsById, setAppointmentsById] = useState({});
  const dropdownRef = useRef(null);
  const department = useMemo(() => getNotificationDepartment(user), [user]);

  useEffect(() => {
    if (userId) {
      loadNotifications();
    }
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

  useEffect(() => {
    if (!isOpen || pendingContextLoaded) return;
    if (!notifications.some((notification) => isPendingNotification(notification))) {
      setPendingContextLoaded(true);
      return;
    }

    loadPendingContext();
  }, [isOpen, notifications, pendingContextLoaded]);

  const loadNotifications = async () => {
    setIsLoading(true);
    try {
      const data = await Notificacao.filter({ user_id: userId }, "-created_date", 20);
      setNotifications(data || []);
      setPendingContextLoaded(false);
      setAppointmentsById({});
    } catch (error) {
      console.error("Erro ao carregar notificações:", error);
    }
    setIsLoading(false);
  };

  const loadPendingContext = async () => {
    setIsLoadingPendingContext(true);
    try {
      const appointments = await Appointment.listAll("-created_date", 1000, 5000);
      setAppointmentsById(
        Object.fromEntries((appointments || []).map((appointment) => [appointment.id, appointment]))
      );
    } catch (error) {
      console.error("Erro ao conferir pendências do sino:", error);
    } finally {
      setPendingContextLoaded(true);
      setIsLoadingPendingContext(false);
    }
  };

  const notificationsWithDisplay = useMemo(
    () =>
      notifications.map((notification) => {
        const parsedPayload = parseNotificationPayload(notification);
        const displayCopy = getDisplayCopy({ ...notification, parsedPayload }, appointmentsById);
        return {
          ...notification,
          parsedPayload,
          displayTitle: displayCopy.title,
          displayMessage: displayCopy.message,
        };
      }),
    [notifications, appointmentsById]
  );

  const isPendingStillActive = (notification) => {
    if (!isPendingNotification(notification)) return false;
    if (!pendingContextLoaded) return true;

    const appointmentId = notification?.parsedPayload?.appointment_id;
    const appointment = appointmentsById[appointmentId];
    if (!appointment) return false;

    const metadata = getAppointmentMeta(appointment);
    if (notification.tipo === "agendamento_sem_presenca") {
      return metadata.absence_review_pending === true;
    }

    if (notification.tipo === "agendamento_manual_pendente") {
      return appointment.source_type === "manual_registrador"
        && (appointment.charge_type === "pendente_comercial" || metadata.commercial_review_pending === true);
    }

    return false;
  };

  const activePendingNotifications = useMemo(
    () =>
      notificationsWithDisplay.filter((notification) =>
        shouldShowPendingForDepartment(notification, department) && isPendingStillActive(notification)
      ),
    [department, notificationsWithDisplay, pendingContextLoaded, appointmentsById]
  );

  const hiddenStalePendingIds = useMemo(
    () =>
      new Set(
        notificationsWithDisplay
          .filter((notification) => isPendingNotification(notification) && pendingContextLoaded && !isPendingStillActive(notification))
          .map((notification) => notification.id)
      ),
    [notificationsWithDisplay, pendingContextLoaded, appointmentsById]
  );

  const visibleNoticeNotifications = useMemo(
    () =>
      notificationsWithDisplay.filter((notification) =>
        !hiddenStalePendingIds.has(notification.id)
        && !isPendingNotification(notification)
        && shouldShowNoticeForDepartment(notification, department)
      ),
    [department, hiddenStalePendingIds, notificationsWithDisplay]
  );

  const unreadNoticeCount = visibleNoticeNotifications.filter((notification) => !isRead(notification)).length;
  const badgeCount = activePendingNotifications.length + unreadNoticeCount;
  const hasAnyItems = activePendingNotifications.length > 0 || visibleNoticeNotifications.length > 0;

  const markAsRead = async (notification) => {
    if (isRead(notification)) return;
    try {
      await Notificacao.update(notification.id, { lido: true });
      setNotifications((current) =>
        current.map((item) => (item.id === notification.id ? { ...item, lido: true, lida: true } : item))
      );
    } catch (error) {
      console.error("Erro ao marcar notificação como lida:", error);
    }
  };

  const markAllAsRead = async () => {
    const unread = visibleNoticeNotifications.filter((notification) => !isRead(notification));
    try {
      await Promise.all(unread.map((notification) => Notificacao.update(notification.id, { lido: true })));
      setNotifications((current) => current.map((item) => ({ ...item, lido: true, lida: true })));
    } catch (error) {
      console.error("Erro ao marcar avisos como lidos:", error);
    }
  };

  const handleOpenItem = (notification) => {
    markAsRead(notification);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="relative rounded-xl p-2 transition-colors hover:bg-slate-100"
      >
        <Bell className="h-5 w-5 text-slate-600" />
        {badgeCount > 0 ? (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-r from-red-500 to-rose-500 text-xs font-bold text-white shadow-lg"
          >
            {badgeCount > 9 ? "9+" : badgeCount}
          </motion.span>
        ) : null}
      </button>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:w-96"
          >
            <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-3">
              <div>
                <h3 className="font-semibold text-slate-800">Pendências e avisos</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Sino do departamento {getDepartmentLabel(department)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {unreadNoticeCount > 0 ? (
                  <button
                    type="button"
                    onClick={markAllAsRead}
                    className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    <Check className="h-3 w-3" />
                    Marcar avisos como lidos
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={loadNotifications}
                  className="rounded-lg p-1 transition-colors hover:bg-slate-100"
                  disabled={isLoading || isLoadingPendingContext}
                >
                  <RefreshCw className={`h-4 w-4 text-slate-500 ${(isLoading || isLoadingPendingContext) ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            <div className="max-h-[28rem] overflow-y-auto">
              {!hasAnyItems ? (
                <div className="py-12 text-center">
                  <Bell className="mx-auto mb-3 h-10 w-10 text-slate-200" />
                  <p className="text-sm text-slate-400">Nenhuma pendência ou aviso</p>
                </div>
              ) : (
                <>
                  <NotificationSection
                    title="Pendências do departamento"
                    items={activePendingNotifications}
                    onOpenItem={handleOpenItem}
                    pendingContextLoaded={pendingContextLoaded}
                  />
                  <NotificationSection
                    title="Avisos do departamento"
                    items={visibleNoticeNotifications}
                    onOpenItem={handleOpenItem}
                    pendingContextLoaded={pendingContextLoaded}
                  />
                </>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
