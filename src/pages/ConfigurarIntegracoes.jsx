import React, { useState, useEffect } from "react";
import { IntegracaoConfig } from "@/api/entities";
import { bancoInter } from "@/api/functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Settings, Building2, CheckCircle, XCircle, Download, Calendar, AlertCircle, Edit2, Save 
} from "lucide-react";
import { format, subDays } from "date-fns";

export default function ConfigurarIntegracoes() {
  const [config, setConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [dataInicio, setDataInicio] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [dataFim, setDataFim] = useState(format(new Date(), "yyyy-MM-dd"));
  
  const [formData, setFormData] = useState({
    client_id: "",
    client_secret: "",
    account_number: ""
  });
  
  const [certificateFiles, setCertificateFiles] = useState({
    crt: null,
    key: null
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setIsLoading(true);
    try {
      const configs = await IntegracaoConfig.filter({ nome: "banco_inter" });
      if (configs.length > 0) {
        const cfg = configs[0];
        setConfig(cfg);
        setFormData({
          client_id: cfg.credenciais?.client_id || "",
          client_secret: cfg.credenciais?.client_secret || "",
          account_number: cfg.credenciais?.account_number || ""
        });
      }
    } catch (error) {
      console.error("Erro ao carregar config:", error);
    }
    setIsLoading(false);
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      // Ler conteúdo dos certificados se fornecidos
      let certificate_crt = config?.certificate_crt;
      let certificate_key = config?.certificate_key;
      
      if (certificateFiles.crt) {
        certificate_crt = await certificateFiles.crt.text();
      }
      if (certificateFiles.key) {
        certificate_key = await certificateFiles.key.text();
      }

      const data = {
        nome: "banco_inter",
        ativa: true,
        credenciais: {
          client_id: formData.client_id,
          client_secret: formData.client_secret,
          account_number: formData.account_number
        },
        certificate_crt,
        certificate_key
      };

      if (config) {
        await IntegracaoConfig.update(config.id, data);
      } else {
        await IntegracaoConfig.create(data);
      }

      await loadConfig();
      setIsEditing(false);
      setCertificateFiles({ crt: null, key: null });
      setTestResult({ success: true, message: "Credenciais salvas com sucesso" });
    } catch (error) {
      setTestResult({ success: false, message: "Erro ao salvar credenciais: " + error.message });
    }
    setIsSaving(false);
  };

  const testarConexao = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const data = await bancoInter({ action: 'test' });
      setTestResult({ success: true, message: data.message });
    } catch (error) {
        console.error('Erro completo:', error);
        console.error('Response data:', error.response?.data);
        console.error('Response status:', error.response?.status);
        console.error('Response headers:', error.response?.headers);

        const errorData = error.response?.data || {};

        setTestResult({ 
          success: false, 
          message: errorData.error || 'Erro ao testar conexão',
          help: errorData.help,
          status: errorData.status,
          statusText: errorData.statusText,
          response_data: errorData.response_data,
          response_headers: errorData.response_headers,
          sent_data: errorData.sent_data,
          certificate_debug: errorData.certificate_debug,
          details: errorData.details || JSON.stringify(errorData, null, 2)
        });
      }
    setIsTesting(false);
  };

  const importarExtrato = async () => {
    if (!dataInicio || !dataFim) {
      alert("Selecione o período para importação");
      return;
    }

    setIsImporting(true);
    setImportResult(null);
    try {
      const data = await bancoInter({ 
        action: 'buscarExtrato',
        dataInicio,
        dataFim
      });
      
      setImportResult({ 
        success: true, 
        message: data.message,
        details: data
      });
    } catch (error) {
      setImportResult({ 
        success: false, 
        message: error.response?.data?.error || 'Erro ao importar extrato',
        details: error.response?.data?.details
      });
    }
    setIsImporting(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-start gap-3">
          <div className="mt-1">
            <Settings className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Configurar Integrações</h1>
            <p className="text-sm text-gray-600 mt-1">Conecte sistemas externos para automação financeira</p>
          </div>
        </div>

        {/* Banco Inter */}
        <Card className="border-gray-200 bg-white mb-6">
          <CardHeader className="border-b bg-gradient-to-r from-orange-50 to-orange-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shadow-sm">
                  <Building2 className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <CardTitle className="text-lg">Banco Inter - Extrato Bancário</CardTitle>
                  <p className="text-sm text-gray-600">Importação automática de transações</p>
                </div>
              </div>
              {testResult && (
                <Badge className={testResult.success ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                  {testResult.success ? "Conectado" : "Erro"}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {/* Formulário de Credenciais */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Credenciais da Integração</h3>
                {!isEditing && config && (
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                    <Edit2 className="w-4 h-4 mr-2" />Editar
                  </Button>
                )}
              </div>

              {isLoading ? (
                <div className="text-center py-8 text-gray-500">Carregando...</div>
              ) : (
                <>
                  <div className="space-y-3">
                    <div>
                      <Label>Client ID *</Label>
                      <Input 
                        value={formData.client_id}
                        onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                        disabled={config && !isEditing}
                        placeholder="Ex: 3f5a5f1f-7c0e-4724-8f0a-bbe8ee43cd4c"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>Client Secret *</Label>
                      <Input 
                        type="password"
                        value={formData.client_secret}
                        onChange={(e) => setFormData({ ...formData, client_secret: e.target.value })}
                        disabled={config && !isEditing}
                        placeholder="Ex: 358585c2-69c5-4423-91e4-f80cbffca09f"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>Número da Conta (opcional)</Label>
                      <Input 
                        value={formData.account_number}
                        onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                        disabled={config && !isEditing}
                        placeholder="Número da conta sem dígito"
                        className="mt-1"
                      />
                    </div>
                    </div>

                    <Separator />

                    {/* Certificados Digital */}
                    <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-gray-900">Certificado Digital *</h4>
                      <Badge variant="outline" className="text-xs">Obrigatório</Badge>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-sm">Arquivo .crt (Certificado)</Label>
                        <div className="mt-1">
                          <input
                            type="file"
                            accept=".crt,.pem"
                            onChange={(e) => setCertificateFiles({ ...certificateFiles, crt: e.target.files?.[0] })}
                            disabled={config && !isEditing}
                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                          />
                          {(config?.certificate_crt || certificateFiles.crt) && (
                            <p className="text-xs text-green-600 mt-1">✓ Certificado carregado</p>
                          )}
                        </div>
                      </div>

                      <div>
                        <Label className="text-sm">Arquivo .key (Chave Privada)</Label>
                        <div className="mt-1">
                          <input
                            type="file"
                            accept=".key,.pem"
                            onChange={(e) => setCertificateFiles({ ...certificateFiles, key: e.target.files?.[0] })}
                            disabled={config && !isEditing}
                            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                          />
                          {(config?.certificate_key || certificateFiles.key) && (
                            <p className="text-xs text-green-600 mt-1">✓ Chave carregada</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700">
                      <AlertCircle className="w-4 h-4 inline mr-1" />
                      Os certificados são fornecidos pelo Banco Inter no formato .crt e .key
                    </div>
                    </div>

                  {(!config || isEditing) && (
                    <div className="flex gap-2">
                      <Button 
                        onClick={handleSaveConfig}
                        disabled={isSaving || !formData.client_id || !formData.client_secret || (!config?.certificate_crt && !certificateFiles.crt)}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <Save className="w-4 h-4 mr-2" />
                        {isSaving ? "Salvando..." : "Salvar Credenciais"}
                      </Button>
                      {config && (
                        <Button variant="outline" onClick={() => { setIsEditing(false); setCertificateFiles({ crt: null, key: null }); loadConfig(); }}>
                          Cancelar
                        </Button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <Separator />

            {/* Teste de Conexão */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">1. Testar Conexão</h3>
              <Button 
                onClick={testarConexao} 
                disabled={isTesting}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white"
              >
                {isTesting ? "Testando..." : "Testar Conexão com Banco Inter"}
              </Button>
              
              {testResult && (
                <div className={`mt-3 p-3 rounded-lg border ${
                  testResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                }`}>
                  <div className="flex items-start gap-2">
                    {testResult.success ? (
                      <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${testResult.success ? 'text-green-700' : 'text-red-700'}`}>
                        {testResult.message || testResult.error}
                      </p>
                      {testResult.help && (
                        <p className="text-xs text-orange-600 mt-1">💡 {testResult.help}</p>
                      )}
                      {(testResult.details || testResult.response_data || testResult.sent_data || testResult.certificate_debug) && (
                        <details className="mt-2" open={!testResult.success}>
                          <summary className="text-xs cursor-pointer text-gray-600 font-medium">Ver detalhes técnicos</summary>
                          <div className="mt-2 space-y-2">
                            {testResult.certificate_debug && (
                              <div>
                                <p className="text-xs font-semibold text-purple-600">Debug dos Certificados:</p>
                                <pre className="text-xs bg-gray-900 text-gray-100 p-2 rounded overflow-auto max-h-32">
                                  {JSON.stringify(testResult.certificate_debug, null, 2)}
                                </pre>
                              </div>
                            )}
                            {testResult.response_data && (
                              <>
                                <div>
                                  <p className="text-xs font-semibold text-red-600">Resposta do Banco:</p>
                                  <pre className="text-xs bg-gray-900 text-gray-100 p-2 rounded overflow-auto max-h-32">
                                    {testResult.response_data 
                                      ? (typeof testResult.response_data === 'object' 
                                          ? JSON.stringify(testResult.response_data, null, 2)
                                          : testResult.response_data)
                                      : '(vazio ou sem corpo)'}
                                  </pre>
                                </div>
                                {testResult.response_headers && (
                                  <div>
                                    <p className="text-xs font-semibold text-blue-600">Headers da Resposta:</p>
                                    <pre className="text-xs bg-gray-900 text-gray-100 p-2 rounded overflow-auto max-h-32">
                                      {JSON.stringify(testResult.response_headers, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </>
                            )}
                            {testResult.sent_data && (
                              <div>
                                <p className="text-xs font-semibold text-blue-600">Dados Enviados:</p>
                                <pre className="text-xs bg-gray-900 text-gray-100 p-2 rounded overflow-auto max-h-32">
                                  {JSON.stringify(testResult.sent_data, null, 2)}
                                </pre>
                              </div>
                            )}
                            {testResult.details && !testResult.response_data && (
                              <pre className="text-xs bg-gray-900 text-gray-100 p-2 rounded overflow-auto max-h-40">
                                {typeof testResult.details === 'object' 
                                  ? JSON.stringify(testResult.details, null, 2)
                                  : testResult.details}
                              </pre>
                            )}
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Importação de Extrato */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">2. Importar Extrato Bancário</h3>
              
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <Label className="text-sm">Data Início</Label>
                  <div className="relative mt-1">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input 
                      type="date" 
                      value={dataInicio}
                      onChange={(e) => setDataInicio(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-sm">Data Fim</Label>
                  <div className="relative mt-1">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input 
                      type="date" 
                      value={dataFim}
                      onChange={(e) => setDataFim(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
              </div>

              <Button 
                onClick={importarExtrato}
                disabled={isImporting || !dataInicio || !dataFim}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                <Download className="w-4 h-4 mr-2" />
                {isImporting ? "Importando..." : "Importar Transações"}
              </Button>

              {importResult && (
                <div className={`mt-3 p-4 rounded-lg border ${
                  importResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                }`}>
                  <div className="flex items-start gap-2 mb-2">
                    {importResult.success ? (
                      <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <p className={`font-medium ${importResult.success ? 'text-green-700' : 'text-red-700'}`}>
                        {importResult.message}
                      </p>
                      {importResult.details && importResult.success && (
                        <div className="mt-2 text-sm text-green-600">
                          <p>• Total encontradas: {importResult.details.total}</p>
                          <p>• Novas inseridas: {importResult.details.inseridas}</p>
                        </div>
                      )}
                      {importResult.details && !importResult.success && (
                        <p className="mt-1 text-xs text-red-600">{importResult.details}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Instruções */}
            <div className="p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
              <p className="font-medium text-gray-900 mb-2">Como funciona:</p>
              <ol className="space-y-1 list-decimal list-inside">
                <li>Teste a conexão para verificar se as credenciais estão corretas</li>
                <li>Selecione o período desejado (máximo 90 dias)</li>
                <li>Clique em "Importar Transações" para buscar o extrato</li>
                <li>As transações serão adicionadas automaticamente em "Movimentações"</li>
                <li>Transações duplicadas são automaticamente ignoradas</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {/* Outras Integrações (Futuro) */}
        <Card className="border-gray-200 bg-white opacity-60">
          <CardHeader className="border-b bg-gray-50">
            <CardTitle className="text-lg text-gray-500">Outras Integrações</CardTitle>
          </CardHeader>
          <CardContent className="p-6 text-center">
            <p className="text-gray-500">Mais integrações em breve...</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
