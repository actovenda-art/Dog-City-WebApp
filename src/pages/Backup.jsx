import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Dog, Calendar, Database } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function Backup() {
  const [notifyOpen, setNotifyOpen] = React.useState(false);
  const [notifyTitle, setNotifyTitle] = React.useState("");
  const [notifyMessage, setNotifyMessage] = React.useState("");

  const handleExportDogs = () => {
    console.log("Exportando informações dos cães...");
    setNotifyTitle("Exportação de Cães");
    setNotifyMessage("A exportação de informações dos cães será implementada em breve.");
    setNotifyOpen(true);
  };

  const handleExportSchedules = () => {
    console.log("Exportando informações de agendamentos...");
    setNotifyTitle("Exportação de Agendamentos");
    setNotifyMessage("A exportação de informações de agendamentos será implementada em breve.");
    setNotifyOpen(true);
  };

  const handleExportAll = () => {
    console.log("Exportando todas as informações...");
    setNotifyTitle("Exportação Completa");
    setNotifyMessage("A exportação completa de todos os dados será implementada em breve.");
    setNotifyOpen(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center gap-3 mb-2">
            <img 
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d30bcc5ca43f0f9b7df581/b25f6333e_Capturadetela2025-09-24192240.png"
              alt="Dog City Brasil"
              className="h-10 w-10 sm:h-12 sm:w-12"
            />
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Backup</h1>
              <p className="text-sm sm:text-base text-gray-600">Exportação de dados do sistema</p>
            </div>
          </div>
        </div>

        {/* Export Options */}
        <div className="space-y-4">
          {/* Exportar Cães */}
          <Card className="border-blue-200 bg-white hover:shadow-lg transition-shadow">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Dog className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1">
                      Informações dos Cães
                    </h3>
                    <p className="text-xs sm:text-sm text-gray-600">
                      Exportar cadastro completo de todos os cães
                    </p>
                  </div>
                </div>
                <Button
                  onClick={handleExportDogs}
                  className="bg-blue-600 hover:bg-blue-700 text-white flex-shrink-0"
                >
                  <Download className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Exportar</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Exportar Agendamentos */}
          <Card className="border-green-200 bg-white hover:shadow-lg transition-shadow">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-6 h-6 sm:w-7 sm:h-7 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1">
                      Informações de Agendamentos
                    </h3>
                    <p className="text-xs sm:text-sm text-gray-600">
                      Exportar histórico de agendamentos do sistema
                    </p>
                  </div>
                </div>
                <Button
                  onClick={handleExportSchedules}
                  className="bg-green-600 hover:bg-green-700 text-white flex-shrink-0"
                >
                  <Download className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Exportar</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Exportar Tudo */}
          <Card className="border-purple-200 bg-white hover:shadow-lg transition-shadow">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                    <Database className="w-6 h-6 sm:w-7 sm:h-7 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1">
                      Todas as Informações
                    </h3>
                    <p className="text-xs sm:text-sm text-gray-600">
                      Exportar backup completo de todos os dados
                    </p>
                  </div>
                </div>
                <Button
                  onClick={handleExportAll}
                  className="bg-purple-600 hover:bg-purple-700 text-white flex-shrink-0"
                >
                  <Download className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Exportar</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Info Card */}
        <Card className="mt-6 border-gray-200 bg-blue-50">
          <CardContent className="p-4 sm:p-6">
            <div className="flex gap-3">
              <Download className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm sm:text-base font-semibold text-gray-900 mb-1">
                  Sobre as exportações
                </h4>
                <p className="text-xs sm:text-sm text-gray-700">
                  Os dados serão exportados em formato Excel (.xlsx) para facilitar a visualização e análise.
                  Todos os backups incluem data e hora da exportação.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pop-up de notificação */}
      <Dialog open={notifyOpen} onOpenChange={setNotifyOpen}>
        <DialogContent className="w-[95vw] max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{notifyTitle || "Exportação"}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-gray-700">{notifyMessage}</p>
          </div>
          <DialogFooter>
            <Button onClick={() => setNotifyOpen(false)} className="bg-blue-600 hover:bg-blue-700 text-white">
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}