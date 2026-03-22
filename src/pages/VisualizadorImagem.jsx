import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, ImageOff } from "lucide-react";
import { getImageViewerPayload } from "@/utils";

export default function VisualizadorImagem() {
  const location = useLocation();
  const navigate = useNavigate();
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const imageKey = params.get("imageKey");
    setPayload(getImageViewerPayload(imageKey));
  }, [location.search]);

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/");
  };

  if (!payload?.src) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <ImageOff className="w-12 h-12 mx-auto text-slate-400" />
          <h1 className="text-2xl font-semibold">Imagem indisponível</h1>
          <p className="text-sm text-slate-300">A visualização não foi encontrada ou expirou.</p>
          <Button variant="outline" onClick={handleBack} className="border-slate-600 bg-transparent text-white hover:bg-slate-800">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-800">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Visualização</p>
          <h1 className="text-lg sm:text-xl font-semibold">{payload.title || "Imagem"}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleBack} className="border-slate-600 bg-transparent text-white hover:bg-slate-800">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
          <Button asChild className="bg-orange-500 hover:bg-orange-600 text-white">
            <a href={payload.src} target="_blank" rel="noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" />
              Abrir original
            </a>
          </Button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <img
          src={payload.src}
          alt={payload.title || "Imagem"}
          className="max-w-full max-h-[calc(100vh-140px)] object-contain rounded-xl shadow-2xl bg-white/5"
        />
      </div>
    </div>
  );
}
