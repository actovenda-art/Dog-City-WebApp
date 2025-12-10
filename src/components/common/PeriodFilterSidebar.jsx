import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { subDays, format, parse, differenceInYears } from "date-fns";

const PERIODOS_RAPIDOS = [
  { label: "7 dias", value: "7dias", days: 7 },
  { label: "15 dias", value: "15dias", days: 15 },
  { label: "30 dias", value: "30dias", days: 30 },
  { label: "90 dias", value: "90dias", days: 90 }
];

export default function PeriodFilterSidebar({ 
  isOpen, 
  onClose, 
  onApplyFilter,
  currentFilter 
}) {
  const [selectedPeriodo, setSelectedPeriodo] = useState(null);
  const [dataInicial, setDataInicial] = useState("");
  const [dataFinal, setDataFinal] = useState("");
  const [ordenacao, setOrdenacao] = useState("desc");
  const [error, setError] = useState("");

  useEffect(() => {
    if (currentFilter) {
      setDataInicial(currentFilter.dataInicial || "");
      setDataFinal(currentFilter.dataFinal || "");
      setOrdenacao(currentFilter.ordenacao || "desc");
      setSelectedPeriodo(currentFilter.periodoRapido || null);
    }
  }, [currentFilter]);

  const handlePeriodoRapido = (periodo) => {
    const hoje = new Date();
    const dataInicio = subDays(hoje, periodo.days);
    
    setSelectedPeriodo(periodo.value);
    setDataInicial(format(dataInicio, "yyyy-MM-dd"));
    setDataFinal(format(hoje, "yyyy-MM-dd"));
    setError("");
    
    onApplyFilter({
      periodoRapido: periodo.value,
      dataInicial: format(dataInicio, "yyyy-MM-dd"),
      dataFinal: format(hoje, "yyyy-MM-dd"),
      ordenacao
    });
  };

  const validateDates = () => {
    if (!dataInicial || !dataFinal) {
      setError("Preencha ambas as datas");
      return false;
    }

    const inicio = new Date(dataInicial);
    const fim = new Date(dataFinal);

    if (inicio > fim) {
      setError("Data inicial não pode ser posterior à data final");
      return false;
    }

    const diffYears = differenceInYears(fim, inicio);
    if (diffYears > 2) {
      setError("O período não pode ultrapassar 2 anos");
      return false;
    }

    setError("");
    return true;
  };

  const handleApplyCustomPeriod = () => {
    if (validateDates()) {
      setSelectedPeriodo(null);
      onApplyFilter({
        periodoRapido: null,
        dataInicial,
        dataFinal,
        ordenacao
      });
    }
  };

  const handleOrdenacaoChange = (value) => {
    setOrdenacao(value);
    onApplyFilter({
      periodoRapido: selectedPeriodo,
      dataInicial,
      dataFinal,
      ordenacao: value
    });
  };

  return (
    <>
      {/* Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="fixed top-0 right-0 h-full w-[350px] bg-white shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Período</h2>
              <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Últimos períodos */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Últimos períodos</h3>
                <div className="space-y-2">
                  {PERIODOS_RAPIDOS.map((periodo) => (
                    <button
                      key={periodo.value}
                      onClick={() => handlePeriodoRapido(periodo)}
                      className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                        selectedPeriodo === periodo.value
                          ? "border-blue-600 bg-blue-50"
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <span className={`text-sm ${
                        selectedPeriodo === periodo.value ? "text-blue-600 font-medium" : "text-gray-700"
                      }`}>
                        {periodo.label}
                      </span>
                      {selectedPeriodo === periodo.value && (
                        <Check className="w-4 h-4 text-blue-600" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Período específico */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Período específico</h3>
                <p className="text-xs text-gray-500 mb-3">
                  Consulte com limite máximo de 2 anos entre a data inicial e a data final.
                </p>
                
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-gray-700">Data inicial</Label>
                    <Input
                      type="date"
                      value={dataInicial}
                      onChange={(e) => {
                        setDataInicial(e.target.value);
                        setSelectedPeriodo(null);
                        setError("");
                      }}
                      className="mt-1"
                    />
                  </div>
                  
                  <div>
                    <Label className="text-xs text-gray-700">Data final</Label>
                    <Input
                      type="date"
                      value={dataFinal}
                      onChange={(e) => {
                        setDataFinal(e.target.value);
                        setSelectedPeriodo(null);
                        setError("");
                      }}
                      className="mt-1"
                    />
                  </div>

                  {error && (
                    <p className="text-xs text-red-600">{error}</p>
                  )}

                  <Button
                    onClick={handleApplyCustomPeriod}
                    disabled={!dataInicial || !dataFinal}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Aplicar filtro
                  </Button>
                </div>
              </div>

              {/* Ordenar transações */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Ordenar transações</h3>
                <p className="text-xs text-gray-500 mb-3">
                  Escolha entre a ordenação decrescente, das datas mais recentes para as mais antigas, 
                  ou crescente, das mais antigas para as mais recentes.
                </p>
                
                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 p-3 rounded-lg border border-gray-200 transition-colors">
                    <input
                      type="radio"
                      name="ordenacao"
                      checked={ordenacao === "desc"}
                      onChange={() => handleOrdenacaoChange("desc")}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Decrescente (mais recentes primeiro)</span>
                  </label>
                  
                  <label className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 p-3 rounded-lg border border-gray-200 transition-colors">
                    <input
                      type="radio"
                      name="ordenacao"
                      checked={ordenacao === "asc"}
                      onChange={() => handleOrdenacaoChange("asc")}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Crescente (mais antigas primeiro)</span>
                  </label>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}