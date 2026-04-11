import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Layers3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ACTIVE_UNIT_EVENT, getStoredUnitSelection, setStoredUnitSelection } from "@/lib/unit-context";
import { getUnitPagePolicy } from "@/lib/unit-page-policy";

function InfoBanner({ title, description, tone = "blue" }) {
  const toneClass = tone === "amber"
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : "border-blue-200 bg-blue-50 text-blue-800";

  return (
    <div className={`mb-4 rounded-2xl border px-4 py-3 ${toneClass}`}>
      <div className="flex items-start gap-3">
        {tone === "amber" ? <AlertTriangle className="mt-0.5 h-5 w-5" /> : <Layers3 className="mt-0.5 h-5 w-5" />}
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-sm">{description}</p>
        </div>
      </div>
    </div>
  );
}

export default function UnitModeGuard({ pageName, children }) {
  const [selection, setSelection] = useState(() => getStoredUnitSelection());

  useEffect(() => {
    const handleSelectionChanged = (event) => {
      setSelection(event?.detail || getStoredUnitSelection());
    };

    window.addEventListener(ACTIVE_UNIT_EVENT, handleSelectionChanged);
    return () => window.removeEventListener(ACTIVE_UNIT_EVENT, handleSelectionChanged);
  }, []);

  const policy = useMemo(() => getUnitPagePolicy(pageName), [pageName]);
  const isMergedMode = (selection?.selectedUnitIds || []).length > 1;

  const exitMergedMode = () => {
    const primaryUnitId = selection?.primaryUnitId || "";
    if (!primaryUnitId) return;

    setStoredUnitSelection({
      primaryUnitId,
      selectedUnitIds: [primaryUnitId],
    });
    window.location.reload();
  };

  if (!isMergedMode) {
    return children;
  }

  if (policy.mergedMode === "single_only") {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-gray-50 p-3 sm:p-6">
        <div className="mx-auto max-w-3xl">
          <Card className="border-amber-200 bg-white">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-6 w-6 text-amber-600" />
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">{policy.label}</h1>
                  <p className="mt-2 text-sm text-gray-700">{policy.description}</p>
                  <p className="mt-2 text-sm text-gray-600">
                    A visão unificada continua ativa para telas analíticas, mas esta página exige uma única unidade para preservar o isolamento operacional.
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={exitMergedMode} className="bg-blue-600 text-white hover:bg-blue-700">
                  Acessar apenas a unidade atual
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (policy.mergedMode === "contextual") {
    return (
      <>
        <InfoBanner title="Visão unificada ativa" description={policy.description} />
        {children}
      </>
    );
  }

  if (policy.mergedMode === "read_only") {
    return (
      <>
        <InfoBanner
          title="Visão unificada ativa"
          description={`${policy.description} Qualquer tentativa de criação, edição ou exclusão seguirá bloqueada enquanto mais de uma unidade estiver selecionada.`}
        />
        {children}
      </>
    );
  }

  return children;
}
