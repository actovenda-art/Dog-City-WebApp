import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { User } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createPageUrl } from "@/utils";
import { AlertTriangle, LoaderCircle } from "lucide-react";

function getSafeNextPath(search) {
  const params = new URLSearchParams(search);
  const next = params.get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return createPageUrl("Dev_Dashboard");
  }
  return next;
}

export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const nextPath = useMemo(() => getSafeNextPath(location.search), [location.search]);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function completeLogin() {
      try {
        await User.exchangeCodeForSession?.(window.location.href);
        const currentUser = await User.me();

        if (!currentUser) {
          throw new Error("A sessao nao foi criada corretamente.");
        }

        if (isMounted) {
          navigate(nextPath, { replace: true });
        }
      } catch (error) {
        console.error("Erro ao concluir login Google:", error);
        if (isMounted) {
          setErrorMessage(error?.message || "Nao foi possivel concluir o login com Google.");
        }
      }
    }

    completeLogin();

    return () => {
      isMounted = false;
    };
  }, [navigate, nextPath]);

  if (!errorMessage) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-slate-800 bg-slate-900 text-white">
          <CardContent className="p-8 text-center">
            <LoaderCircle className="w-10 h-10 mx-auto animate-spin text-orange-400" />
            <h1 className="mt-4 text-2xl font-semibold">Concluindo login</h1>
            <p className="mt-2 text-sm text-slate-300">
              Estamos validando sua sessao no Supabase e carregando o ambiente.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-red-900 bg-slate-900 text-white">
        <CardContent className="p-8">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />
            <div>
              <h1 className="text-xl font-semibold">Falha no login</h1>
              <p className="mt-2 text-sm text-slate-300">{errorMessage}</p>
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <Button asChild className="bg-orange-500 hover:bg-orange-600 text-white">
              <Link to={`${createPageUrl("Login")}?next=${encodeURIComponent(nextPath)}`}>Tentar novamente</Link>
            </Button>
            <Button asChild variant="outline" className="border-slate-700 bg-transparent text-white hover:bg-slate-800">
              <Link to={createPageUrl("Login")}>Voltar ao login</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
