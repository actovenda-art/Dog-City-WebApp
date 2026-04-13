import React from "react";
import { Navigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function HistoricoOrcamentos() {
  return <Navigate to={createPageUrl("Orcamentos")} replace />;
}
