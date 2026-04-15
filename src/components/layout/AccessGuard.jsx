import React from "react";
import { ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { hasPageAccess } from "@/lib/access-control";

export default function AccessGuard({ pageName, currentUser, children }) {
  const canAccess = hasPageAccess(currentUser, pageName);

  if (canAccess) {
    return children;
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50 p-3 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <Card className="border-rose-200 bg-white">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-6 w-6 text-rose-600" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Acesso não autorizado</h1>
                <p className="mt-2 text-sm text-gray-700">
                  Seu perfil de acesso não permite abrir esta página.
                </p>
                <p className="mt-2 text-sm text-gray-600">
                  Se você precisa desta área, ajuste o tipo de acesso do usuário na Gestão de Usuários.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
