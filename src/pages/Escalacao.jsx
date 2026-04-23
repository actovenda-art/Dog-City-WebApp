import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Camera, Clock3, Coffee, Plus, ShieldCheck, Users } from "lucide-react";

import { ServiceProvider, ServiceProviderSchedule, User } from "@/api/entities";
import { CreateFileSignedUrl, UploadPrivateFile } from "@/api/integrations";
import PageSubTabs from "@/components/common/PageSubTabs";
import SearchFiltersToolbar from "@/components/common/SearchFiltersToolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { TimePickerInput } from "@/components/common/DateTimeInputs";
import { isValidCpfChecksum, normalizeCpfDigits } from "@/lib/cpf-validation";
import { isImagePreviewable, openImageViewer } from "@/utils";

const ROLE_OPTIONS = [
  { value: "monitor", label: "Monitor" },
  { value: "banhista", label: "Banhista" },
  { value: "tosador", label: "Tosador" },
  { value: "banhista_tosador", label: "Banhista & Tosador" },
  { value: "motorista", label: "Motorista" },
  { value: "representante_comercial", label: "Representante comercial" },
];

const WEEKDAY_OPTIONS = [
  { value: 1, label: "Segunda", shortLabel: "Seg" },
  { value: 2, label: "Terça", shortLabel: "Ter" },
  { value: 3, label: "Quarta", shortLabel: "Qua" },
  { value: 4, label: "Quinta", shortLabel: "Qui" },
  { value: 5, label: "Sexta", shortLabel: "Sex" },
  { value: 6, label: "Sábado", shortLabel: "Sáb" },
  { value: 0, label: "Domingo", shortLabel: "Dom" },
];

const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5];

const COVERAGE_FILTERS = [
  { value: "monitor", label: "Monitores", roles: ["monitor"] },
  { value: "banho_tosa", label: "Banhistas e tosadores", roles: ["banhista", "tosador", "banhista_tosador"] },
  { value: "motorista", label: "Motorista", roles: ["motorista"] },
  { value: "comercial", label: "Representante comercial", roles: ["comercial", "representante_comercial"] },
];

const EMPTY_PROVIDER_FORM = {
  nome: "",
  cpf: "",
  selfie_url: "",
};

const EMPTY_SCHEDULE_FORM = {
  serviceprovider_id: "",
  funcao: "monitor",
  weekdays: DEFAULT_WEEKDAYS,
  horario_entrada: "",
  horario_saida: "",
  tem_almoco: false,
  almoco_saida: "",
  almoco_volta: "",
  automatico: false,
};

function safeLoad(loader, fallback = []) {
  return loader().catch((error) => {
    console.error("Erro ao carregar escalação:", error);
    return fallback;
  });
}

function getProviderName(provider) {
  return provider?.nome || provider?.full_name || provider?.nome_completo || "Funcionário";
}

function formatCpf(value) {
  const digits = normalizeCpfDigits(value);
  if (digits.length !== 11) return value || "-";
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function formatTimeRange(startTime, endTime) {
  if (!startTime && !endTime) return "Automático";
  if (!startTime || !endTime) return startTime || endTime || "-";
  return `${startTime} às ${endTime}`;
}

function getLunchLabel(item) {
  if (!item?.almoco_saida && !item?.almoco_volta) return "Sem almoço";
  if (!item?.almoco_saida || !item?.almoco_volta) return "Almoço incompleto";
  return `${item.almoco_saida} às ${item.almoco_volta}`;
}

function getRoleLabel(value) {
  if (value === "comercial") return "Representante comercial";
  return ROLE_OPTIONS.find((option) => option.value === value)?.label || value || "-";
}

function normalizeWeekdays(value) {
  const source = Array.isArray(value)
    ? value
    : (typeof value === "string" && value.trim()
      ? (() => {
          try {
            return JSON.parse(value);
          } catch {
            return [];
          }
        })()
      : []);

  const parsed = [...new Set(source.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 0 && item <= 6))];
  return parsed.sort((left, right) => {
    const normalizedLeft = left === 0 ? 7 : left;
    const normalizedRight = right === 0 ? 7 : right;
    return normalizedLeft - normalizedRight;
  });
}

function getWeekdayLabel(value, short = false) {
  const option = WEEKDAY_OPTIONS.find((item) => item.value === value);
  return short ? (option?.shortLabel || "-") : (option?.label || "-");
}

function formatWeekdayList(values) {
  const weekdays = normalizeWeekdays(values);
  return weekdays.length > 0 ? weekdays.map((item) => getWeekdayLabel(item, true)).join(" • ") : "Seg • Ter • Qua • Qui • Sex";
}

function toggleWeekdaySelection(currentValues, weekday) {
  const normalized = normalizeWeekdays(currentValues);
  return normalized.includes(weekday)
    ? normalized.filter((item) => item !== weekday)
    : normalizeWeekdays([...normalized, weekday]);
}

export default function Escalacao() {
  const [activeTab, setActiveTab] = useState("funcionarios");
  const [coverageFilter, setCoverageFilter] = useState("monitor");
  const [providers, setProviders] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showProviderDialog, setShowProviderDialog] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [providerForm, setProviderForm] = useState(EMPTY_PROVIDER_FORM);
  const [scheduleForm, setScheduleForm] = useState(EMPTY_SCHEDULE_FORM);
  const [editingProvider, setEditingProvider] = useState(null);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [loadWarnings, setLoadWarnings] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const providerSelfieInputRef = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    const warnings = [];

    const [providersData, schedulesData, me] = await Promise.all([
      safeLoad(async () => {
        try {
          return ServiceProvider.listAll ? await ServiceProvider.listAll("nome", 1000, 5000) : await ServiceProvider.list("nome", 1000);
        } catch (error) {
          warnings.push("Funcionários: execute o SQL de escalação antes de usar esta página.");
          throw error;
        }
      }),
      safeLoad(async () => {
        try {
          return ServiceProviderSchedule.listAll
            ? await ServiceProviderSchedule.listAll("-created_date", 1000, 5000)
            : await ServiceProviderSchedule.list("-created_date", 1000);
        } catch (error) {
          warnings.push("Horários: execute o SQL de escalação antes de usar esta página.");
          throw error;
        }
      }),
      User.me().catch(() => null),
    ]);

    setProviders((providersData || []).filter((item) => item?.ativo !== false));
    setSchedules((schedulesData || []).filter((item) => item?.ativo !== false));
    setCurrentUser(me || null);
    setLoadWarnings(warnings);
    setIsLoading(false);
  }

  function resetProviderDialog() {
    setEditingProvider(null);
    setProviderForm(EMPTY_PROVIDER_FORM);
    setShowProviderDialog(false);
  }

  function resetScheduleDialog() {
    setEditingSchedule(null);
    setScheduleForm(EMPTY_SCHEDULE_FORM);
    setShowScheduleDialog(false);
  }

  const providerById = useMemo(
    () => Object.fromEntries(providers.map((provider) => [provider.id, provider])),
    [providers],
  );

  const scheduleCountByProviderId = useMemo(() => {
    const counts = new Map();
    schedules.forEach((item) => {
      if (!item?.serviceprovider_id) return;
      counts.set(item.serviceprovider_id, (counts.get(item.serviceprovider_id) || 0) + 1);
    });
    return counts;
  }, [schedules]);

  const filteredProviders = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) return providers;

    return providers.filter((provider) => {
      const name = getProviderName(provider).toLowerCase();
      const cpf = normalizeCpfDigits(provider?.cpf);
      return name.includes(normalizedSearch) || cpf.includes(normalizedSearch.replace(/\D/g, ""));
    });
  }, [providers, searchTerm]);

  const filteredSchedules = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) return schedules;

    return schedules.filter((item) => {
      const providerName = getProviderName(providerById[item?.serviceprovider_id]).toLowerCase();
      const role = getRoleLabel(item?.funcao).toLowerCase();
      return providerName.includes(normalizedSearch) || role.includes(normalizedSearch);
    });
  }, [providerById, schedules, searchTerm]);

  const automaticCount = useMemo(
    () => schedules.filter((item) => item?.automatico).length,
    [schedules],
  );

  const coverageScheduleCount = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return schedules.filter((schedule) => {
      const normalizedRole = schedule?.funcao === "comercial" ? "representante_comercial" : schedule?.funcao;
      if (!coverageRoleValues.includes(normalizedRole)) return false;

      const provider = providerById[schedule?.serviceprovider_id];
      if (!provider) return false;

      if (!normalizedSearch) return true;

      const providerName = getProviderName(provider).toLowerCase();
      return providerName.includes(normalizedSearch) || getRoleLabel(schedule?.funcao).toLowerCase().includes(normalizedSearch);
    }).length;
  }, [coverageRoleValues, providerById, schedules, searchTerm]);

  function openProviderDialog(provider = null) {
    setEditingProvider(provider);
    setProviderForm({
      nome: provider?.nome || "",
      cpf: formatCpf(provider?.cpf || ""),
      selfie_url: provider?.selfie_url || "",
    });
    setShowProviderDialog(true);
  }

  async function uploadProviderSelfie(file) {
    if (!file) return;
    try {
      setIsSaving(true);
      const empresaId = currentUser?.empresa_id || currentUser?.active_unit_id || "empresa-default";
      const safeName = `${Date.now()}_${(file.name || "selfie").replace(/\s+/g, "_")}`;
      const path = `${empresaId}/escalacao/funcionarios/${safeName}`;
      const result = await UploadPrivateFile({ file, path });
      const storedPath = result?.file_key || result?.path || "";
      if (!storedPath) {
        alert("Não foi possível enviar a selfie.");
        return;
      }
      setProviderForm((current) => ({ ...current, selfie_url: storedPath }));
    } catch (error) {
      console.error("Erro ao enviar selfie do funcionário:", error);
      alert("Não foi possível enviar a selfie do funcionário.");
    }
    setIsSaving(false);
  }

  async function openSelfiePreview(path, title = "Selfie do funcionário") {
    if (!path) return;
    try {
      const signed = await CreateFileSignedUrl({ path, expires: 3600 });
      const url = signed?.signedUrl || signed?.url;
      if (!url) return;
      if (isImagePreviewable(path) || isImagePreviewable(url)) {
        openImageViewer(url, title);
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      alert("Não foi possível abrir a selfie.");
    }
  }

  function openScheduleDialog(schedule = null) {
    setEditingSchedule(schedule);
    setScheduleForm({
      serviceprovider_id: schedule?.serviceprovider_id || "",
      funcao: schedule?.funcao || "monitor",
      weekdays: normalizeWeekdays(schedule?.weekdays).length > 0 ? normalizeWeekdays(schedule?.weekdays) : DEFAULT_WEEKDAYS,
      horario_entrada: schedule?.horario_entrada || "",
      horario_saida: schedule?.horario_saida || "",
      tem_almoco: Boolean(schedule?.almoco_saida || schedule?.almoco_volta),
      almoco_saida: schedule?.almoco_saida || "",
      almoco_volta: schedule?.almoco_volta || "",
      automatico: Boolean(schedule?.automatico),
    });
    setShowScheduleDialog(true);
  }

  async function handleSaveProvider() {
    const nome = providerForm.nome.trim();
    const cpf = normalizeCpfDigits(providerForm.cpf);

    if (!nome) {
      alert("Informe o nome do funcionário.");
      return;
    }

    if (!isValidCpfChecksum(cpf)) {
      alert("Informe um CPF válido.");
      return;
    }

    if (!providerForm.selfie_url) {
      alert("Envie a selfie do funcionário.");
      return;
    }

    const duplicatedProvider = providers.find((item) =>
      item.id !== editingProvider?.id
      && normalizeCpfDigits(item?.cpf) === cpf
    );
    if (duplicatedProvider) {
      alert("Já existe um funcionário cadastrado com este CPF.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        nome,
        cpf,
        selfie_url: providerForm.selfie_url || "",
        ativo: true,
      };

      if (editingProvider?.id) {
        await ServiceProvider.update(editingProvider.id, payload);
      } else {
        await ServiceProvider.create(payload);
      }

      await loadData();
      resetProviderDialog();
    } catch (error) {
      console.error("Erro ao salvar funcionário:", error);
      alert(error?.message || "Não foi possível salvar o funcionário.");
    }
    setIsSaving(false);
  }

  async function handleDeleteProvider(provider) {
    const providerSchedules = schedules.filter((item) => item.serviceprovider_id === provider.id);
    if (providerSchedules.length > 0) {
      alert("Exclua os horários deste funcionário antes de removê-lo.");
      return;
    }

    const confirmed = window.confirm(`Excluir ${getProviderName(provider)} da escalação?`);
    if (!confirmed) return;

    setIsSaving(true);
    try {
      await ServiceProvider.delete(provider.id);
      await loadData();
    } catch (error) {
      console.error("Erro ao excluir funcionário:", error);
      alert(error?.message || "Não foi possível excluir o funcionário.");
    }
    setIsSaving(false);
  }

  async function handleSaveSchedule() {
    if (!scheduleForm.serviceprovider_id) {
      alert("Selecione o funcionário.");
      return;
    }

    if (!scheduleForm.funcao) {
      alert("Selecione a função.");
      return;
    }

    if (normalizeWeekdays(scheduleForm.weekdays).length === 0) {
      alert("Selecione pelo menos um dia da semana.");
      return;
    }

    if (!scheduleForm.automatico && (!scheduleForm.horario_entrada || !scheduleForm.horario_saida)) {
      alert("Informe o horário de entrada e saída.");
      return;
    }

    if (scheduleForm.tem_almoco && (!scheduleForm.almoco_saida || !scheduleForm.almoco_volta)) {
      alert("Informe os horários de saída e volta do almoço.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        serviceprovider_id: scheduleForm.serviceprovider_id,
        funcao: scheduleForm.funcao,
        weekdays: normalizeWeekdays(scheduleForm.weekdays),
        horario_entrada: scheduleForm.horario_entrada || null,
        horario_saida: scheduleForm.horario_saida || null,
        almoco_saida: scheduleForm.tem_almoco ? (scheduleForm.almoco_saida || null) : null,
        almoco_volta: scheduleForm.tem_almoco ? (scheduleForm.almoco_volta || null) : null,
        automatico: Boolean(scheduleForm.automatico),
        ativo: true,
      };

      if (editingSchedule?.id) {
        await ServiceProviderSchedule.update(editingSchedule.id, payload);
      } else {
        await ServiceProviderSchedule.create(payload);
      }

      await loadData();
      resetScheduleDialog();
    } catch (error) {
      console.error("Erro ao salvar horário:", error);
      alert(error?.message || "Não foi possível salvar o horário.");
    }
    setIsSaving(false);
  }

  const coverageRoleValues = useMemo(
    () => COVERAGE_FILTERS.find((item) => item.value === coverageFilter)?.roles || [],
    [coverageFilter],
  );

  const coverageByWeekday = useMemo(() => {
    const entries = new Map(WEEKDAY_OPTIONS.map((weekday) => [weekday.value, []]));
    const normalizedSearch = searchTerm.trim().toLowerCase();

    schedules.forEach((schedule) => {
      const normalizedRole = schedule?.funcao === "comercial" ? "representante_comercial" : schedule?.funcao;
      if (!coverageRoleValues.includes(normalizedRole)) return;

      const provider = providerById[schedule?.serviceprovider_id];
      if (!provider) return;

      const providerName = getProviderName(provider).toLowerCase();
      if (normalizedSearch && !providerName.includes(normalizedSearch) && !getRoleLabel(schedule?.funcao).toLowerCase().includes(normalizedSearch)) {
        return;
      }

      const weekdays = normalizeWeekdays(schedule?.weekdays).length > 0 ? normalizeWeekdays(schedule?.weekdays) : DEFAULT_WEEKDAYS;
      weekdays.forEach((weekday) => {
        const current = entries.get(weekday) || [];
        current.push({
          ...schedule,
          provider,
        });
        current.sort((left, right) => {
          const leftTime = left.horario_entrada || "99:99";
          const rightTime = right.horario_entrada || "99:99";
          if (leftTime !== rightTime) return leftTime.localeCompare(rightTime);
          return getProviderName(left.provider).localeCompare(getProviderName(right.provider));
        });
        entries.set(weekday, current);
      });
    });

    return entries;
  }, [coverageRoleValues, providerById, schedules, searchTerm]);

  async function handleDeleteSchedule(schedule) {
    const confirmed = window.confirm("Excluir este horário?");
    if (!confirmed) return;

    setIsSaving(true);
    try {
      await ServiceProviderSchedule.delete(schedule.id);
      await loadData();
    } catch (error) {
      console.error("Erro ao excluir horário:", error);
      alert(error?.message || "Não foi possível excluir o horário.");
    }
    setIsSaving(false);
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-b-4 border-blue-600" />
          <p className="text-sm text-gray-600">Carregando escalação...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-blue-700">
              <CalendarClock className="h-3.5 w-3.5" />
              Gerência
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Escalação</h1>
              <p className="mt-1 text-sm text-gray-600">
                Cadastre funcionários e organize os horários da unidade ativa.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card className="border-blue-100 shadow-sm">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-2xl bg-blue-50 p-3 text-blue-600">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Funcionários</p>
                  <p className="text-xl font-bold text-gray-900">{providers.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-emerald-100 shadow-sm">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600">
                  <Clock3 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Horários ativos</p>
                  <p className="text-xl font-bold text-gray-900">{schedules.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-amber-100 shadow-sm">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-2xl bg-amber-50 p-3 text-amber-600">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Automáticos</p>
                  <p className="text-xl font-bold text-gray-900">{automaticCount}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {loadWarnings.length > 0 ? (
          <Card className="border-amber-200 bg-amber-50 shadow-sm">
            <CardContent className="space-y-1 p-4 text-sm text-amber-900">
              {loadWarnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <PageSubTabs
            className="max-w-2xl"
            items={[
              { value: "funcionarios", label: `Funcionários (${providers.length})` },
              { value: "horarios", label: `Horários (${schedules.length})` },
              { value: "cobertura", label: `Calendário (${coverageScheduleCount})` },
            ]}
          />

          <SearchFiltersToolbar
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            searchPlaceholder={activeTab === "funcionarios"
              ? "Buscar por nome ou CPF..."
              : activeTab === "horarios"
                ? "Buscar por funcionário ou função..."
                : "Buscar por funcionário ou função na cobertura..."}
            rightContent={activeTab === "cobertura" ? null : (
              <Button
                onClick={() => {
                  if (activeTab === "funcionarios") openProviderDialog();
                  else openScheduleDialog();
                }}
                className="h-11 rounded-full bg-blue-600 px-5 text-white hover:bg-blue-700"
                disabled={activeTab === "horarios" && providers.length === 0}
              >
                <Plus className="mr-2 h-4 w-4" />
                {activeTab === "funcionarios" ? "Novo funcionário" : "Novo horário"}
              </Button>
            )}
          />

          <TabsContent value="funcionarios" className="mt-0">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-0">
                {filteredProviders.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>CPF</TableHead>
                        <TableHead>Horários</TableHead>
                        <TableHead className="w-[180px] text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProviders.map((provider) => (
                        <TableRow key={provider.id}>
                          <TableCell className="font-medium text-gray-900">{getProviderName(provider)}</TableCell>
                          <TableCell className="text-gray-600">{formatCpf(provider.cpf)}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{scheduleCountByProviderId.get(provider.id) || 0} cadastrado(s)</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => openProviderDialog(provider)}>
                                Editar
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => handleDeleteProvider(provider)}>
                                Excluir
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="px-6 py-14 text-center">
                    <p className="text-sm text-gray-500">Nenhum funcionário encontrado.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="horarios" className="mt-0">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-0">
                {filteredSchedules.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Funcionário</TableHead>
                        <TableHead>Função</TableHead>
                        <TableHead>Dias</TableHead>
                        <TableHead>Jornada</TableHead>
                        <TableHead>Almoço</TableHead>
                        <TableHead>Modo</TableHead>
                        <TableHead className="w-[180px] text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSchedules.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium text-gray-900">{getProviderName(providerById[item.serviceprovider_id])}</TableCell>
                          <TableCell>{getRoleLabel(item.funcao)}</TableCell>
                          <TableCell>{formatWeekdayList(item.weekdays)}</TableCell>
                          <TableCell>{formatTimeRange(item.horario_entrada, item.horario_saida)}</TableCell>
                          <TableCell>{getLunchLabel(item)}</TableCell>
                          <TableCell>
                            {item.automatico ? (
                              <Badge className="bg-amber-100 text-amber-700">Automático</Badge>
                            ) : (
                              <Badge className="bg-emerald-100 text-emerald-700">Fiscaliza ponto</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => openScheduleDialog(item)}>
                                Editar
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => handleDeleteSchedule(item)}>
                                Excluir
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="px-6 py-14 text-center">
                    <p className="text-sm text-gray-500">Nenhum horário cadastrado.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cobertura" className="mt-0 space-y-4">
            <Tabs value={coverageFilter} onValueChange={setCoverageFilter} className="space-y-4">
              <PageSubTabs
                className="max-w-4xl"
                items={COVERAGE_FILTERS.map((item) => ({ value: item.value, label: item.label }))}
              />

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
                {WEEKDAY_OPTIONS.map((weekday) => {
                  const entries = coverageByWeekday.get(weekday.value) || [];

                  return (
                    <Card key={weekday.value} className="border-0 shadow-sm">
                      <CardContent className="flex h-full flex-col p-0">
                        <div className="border-b border-gray-100 px-4 py-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{weekday.label}</p>
                              <p className="mt-1 text-xs text-gray-500">{entries.length} cobertura(s)</p>
                            </div>
                            <Badge variant="outline">{weekday.shortLabel}</Badge>
                          </div>
                        </div>

                        <div className="flex-1 space-y-3 p-4">
                          {entries.length > 0 ? entries.map((item) => (
                            <div key={`${weekday.value}-${item.id}`} className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-medium text-gray-900">{getProviderName(item.provider)}</p>
                                  <p className="mt-1 text-xs text-gray-500">{getRoleLabel(item.funcao)}</p>
                                </div>
                                <Badge className={item.automatico ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}>
                                  {item.automatico ? "Automático" : "Fiscaliza"}
                                </Badge>
                              </div>
                              <div className="mt-3 space-y-1 text-sm text-gray-600">
                                <p>{formatTimeRange(item.horario_entrada, item.horario_saida)}</p>
                                <p>{getLunchLabel(item)}</p>
                              </div>
                            </div>
                          )) : (
                            <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
                              Nenhuma cobertura cadastrada.
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </Tabs>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showProviderDialog} onOpenChange={(open) => !open && resetProviderDialog()}>
        <DialogContent className="w-[95vw] max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{editingProvider ? "Editar funcionário" : "Novo funcionário"}</DialogTitle>
            <DialogDescription>
              Cadastre nome e CPF para incluir o funcionário na escala da unidade.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={providerForm.nome}
                onChange={(event) => setProviderForm((current) => ({ ...current, nome: event.target.value }))}
                placeholder="Nome completo"
              />
            </div>
            <div className="space-y-2">
              <Label>CPF</Label>
              <Input
                value={providerForm.cpf}
                onChange={(event) => setProviderForm((current) => ({ ...current, cpf: event.target.value }))}
                placeholder="000.000.000-00"
              />
            </div>
            <div className="space-y-2">
              <Label>Selfie do funcionário</Label>
              <input
                ref={providerSelfieInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => uploadProviderSelfie(event.target.files?.[0])}
              />
              <Button type="button" variant="outline" onClick={() => providerSelfieInputRef.current?.click()}>
                <Camera className="mr-2 h-4 w-4" />
                {providerForm.selfie_url ? "Trocar selfie" : "Enviar selfie"}
              </Button>
              {providerForm.selfie_url ? (
                <button
                  type="button"
                  onClick={() => openSelfiePreview(providerForm.selfie_url)}
                  className="block text-sm text-blue-600"
                >
                  Ver selfie enviada
                </button>
              ) : (
                <p className="text-sm text-gray-500">A selfie é obrigatória para cadastrar o funcionário.</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetProviderDialog}>Cancelar</Button>
            <Button onClick={handleSaveProvider} disabled={isSaving} className="bg-blue-600 text-white hover:bg-blue-700">
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showScheduleDialog} onOpenChange={(open) => !open && resetScheduleDialog()}>
        <DialogContent className="w-[95vw] max-w-[760px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSchedule ? "Editar horário" : "Novo horário"}</DialogTitle>
            <DialogDescription>
              Selecione o funcionário, a função e configure a jornada da escala.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label>Funcionário</Label>
              <Select
                value={scheduleForm.serviceprovider_id}
                onValueChange={(value) => setScheduleForm((current) => ({ ...current, serviceprovider_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um funcionário" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {getProviderName(provider)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Função</Label>
              <Select
                value={scheduleForm.funcao}
                onValueChange={(value) => setScheduleForm((current) => ({ ...current, funcao: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a função" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
              <div>
                <p className="font-medium text-gray-900">Dias cobertos</p>
                <p className="mt-1 text-sm text-gray-600">
                  Selecione em quais dias da semana este horário deve aparecer no calendário da escala.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {WEEKDAY_OPTIONS.map((weekday) => {
                  const isChecked = normalizeWeekdays(scheduleForm.weekdays).includes(weekday.value);

                  return (
                    <label
                      key={weekday.value}
                      className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition-colors ${isChecked ? "border-blue-300 bg-blue-50" : "border-gray-200 bg-gray-50 hover:border-gray-300"}`}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => setScheduleForm((current) => ({
                          ...current,
                          weekdays: toggleWeekdaySelection(current.weekdays, weekday.value),
                        }))}
                      />
                      <div>
                        <p className="font-medium text-gray-900">{weekday.label}</p>
                        <p className={`text-xs ${isChecked ? "text-blue-700" : "text-gray-500"}`}>{weekday.shortLabel}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-gray-900">Automático</p>
                  <p className="mt-1 text-sm text-gray-600">
                    Quando ativado, o sistema não fiscaliza o horário de ponto deste funcionário.
                  </p>
                </div>
                <Switch
                  checked={scheduleForm.automatico}
                  onCheckedChange={(checked) => setScheduleForm((current) => ({ ...current, automatico: checked }))}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Horário de entrada</Label>
                <TimePickerInput
                  value={scheduleForm.horario_entrada}
                  onChange={(value) => setScheduleForm((current) => ({ ...current, horario_entrada: value }))}
                  placeholder="Selecione"
                />
              </div>
              <div className="space-y-2">
                <Label>Horário de saída</Label>
                <TimePickerInput
                  value={scheduleForm.horario_saida}
                  onChange={(value) => setScheduleForm((current) => ({ ...current, horario_saida: value }))}
                  placeholder="Selecione"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-amber-50 p-2 text-amber-600">
                    <Coffee className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Horário de almoço</p>
                    <p className="mt-1 text-sm text-gray-600">
                      Ative apenas quando houver saída e volta do almoço nesta jornada.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={scheduleForm.tem_almoco}
                  onCheckedChange={(checked) => setScheduleForm((current) => ({
                    ...current,
                    tem_almoco: checked,
                    ...(checked ? {} : { almoco_saida: "", almoco_volta: "" }),
                  }))}
                />
              </div>

              {scheduleForm.tem_almoco ? (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Saída do almoço</Label>
                    <TimePickerInput
                      value={scheduleForm.almoco_saida}
                      onChange={(value) => setScheduleForm((current) => ({ ...current, almoco_saida: value }))}
                      placeholder="Selecione"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Volta do almoço</Label>
                    <TimePickerInput
                      value={scheduleForm.almoco_volta}
                      onChange={(value) => setScheduleForm((current) => ({ ...current, almoco_volta: value }))}
                      placeholder="Selecione"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetScheduleDialog}>Cancelar</Button>
            <Button onClick={handleSaveSchedule} disabled={isSaving} className="bg-blue-600 text-white hover:bg-blue-700">
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
