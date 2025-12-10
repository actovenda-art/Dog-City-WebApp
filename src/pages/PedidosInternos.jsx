import React, { useState, useEffect } from "react";
import { PedidoInterno } from "@/api/entities";
import { User } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Pencil, Trash2, Clock, CheckCircle, XCircle, Pause, FileText, Upload, GripVertical, Calendar, Tag, Sparkles
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { UploadFile } from "@/api/integrations";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

const PIPELINES = [
  { id: "sem_tramitacao", label: "Sem Tramitação", gradient: "from-slate-400 to-slate-500", bg: "bg-slate-50", border: "border-slate-200", icon: FileText },
  { id: "tramitando", label: "Tramitando", gradient: "from-blue-500 to-indigo-600", bg: "bg-blue-50", border: "border-blue-200", icon: Clock },
  { id: "postergado", label: "Postergados", gradient: "from-amber-400 to-orange-500", bg: "bg-amber-50", border: "border-amber-200", icon: Pause },
  { id: "concluido", label: "Concluídos", gradient: "from-emerald-400 to-teal-500", bg: "bg-emerald-50", border: "border-emerald-200", icon: CheckCircle },
  { id: "excluido", label: "Excluídos", gradient: "from-rose-400 to-red-500", bg: "bg-rose-50", border: "border-rose-200", icon: XCircle }
];

const PRIORIDADES = {
  baixa: { color: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" },
  media: { color: "bg-sky-100 text-sky-700 border-sky-200", dot: "bg-sky-500" },
  alta: { color: "bg-orange-100 text-orange-700 border-orange-200", dot: "bg-orange-500" },
  urgente: { color: "bg-rose-100 text-rose-700 border-rose-200", dot: "bg-rose-500" }
};

const CATEGORIAS = {
  compra_material: { label: "Compra de Material", emoji: "🛒" },
  manutencao: { label: "Manutenção", emoji: "🔧" },
  equipamento: { label: "Equipamento", emoji: "⚙️" },
  suprimentos: { label: "Suprimentos", emoji: "📦" },
  servico_externo: { label: "Serviço Externo", emoji: "🏢" },
  outros: { label: "Outros", emoji: "📋" }
};

export default function PedidosInternos() {
  const [pedidos, setPedidos] = useState([]);
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  const [formData, setFormData] = useState({
    titulo: "", descricao: "", categoria: "", prioridade: "media",
    valor_estimado: "", status: "sem_tramitacao", anexo_url: "", observacoes: ""
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [pedidosData, usersData, me] = await Promise.all([
        PedidoInterno.list("-created_date", 500),
        User.list("-created_date", 500),
        User.me()
      ]);
      setPedidos(pedidosData);
      setUsers(usersData);
      setCurrentUser(me);
    } catch (error) { console.error("Erro:", error); }
    setIsLoading(false);
  };

  const resetForm = () => {
    setFormData({
      titulo: "", descricao: "", categoria: "", prioridade: "media",
      valor_estimado: "", status: "sem_tramitacao", anexo_url: "", observacoes: ""
    });
    setEditingItem(null);
  };

  const openEditModal = (item, e) => {
    e?.stopPropagation();
    setEditingItem(item);
    setFormData({
      titulo: item.titulo || "", descricao: item.descricao || "", categoria: item.categoria || "",
      prioridade: item.prioridade || "media", valor_estimado: item.valor_estimado?.toString() || "",
      status: item.status || "sem_tramitacao", anexo_url: item.anexo_url || "", observacoes: item.observacoes || ""
    });
    setShowModal(true);
  };

  const handleUpload = async (file) => {
    if (!file) return;
    setIsUploading(true);
    try {
      const { file_url } = await UploadFile({ file });
      setFormData(prev => ({ ...prev, anexo_url: file_url }));
    } catch (error) { alert("Erro ao enviar arquivo."); }
    setIsUploading(false);
  };

  const handleSave = async () => {
    if (!formData.titulo || !formData.categoria) {
      alert("Preencha: Título e Categoria"); return;
    }
    setIsSaving(true);
    try {
      const dataToSave = {
        ...formData,
        valor_estimado: formData.valor_estimado ? parseFloat(formData.valor_estimado.replace(",", ".")) : null,
        solicitante_id: currentUser?.id,
        data_conclusao: formData.status === "concluido" ? new Date().toISOString().split('T')[0] : null
      };
      if (editingItem) await PedidoInterno.update(editingItem.id, dataToSave);
      else await PedidoInterno.create(dataToSave);
      await loadData();
      setShowModal(false);
      resetForm();
    } catch (error) { alert("Erro ao salvar."); }
    setIsSaving(false);
  };

  const handleDelete = async (id, e) => {
    e?.stopPropagation();
    if (!confirm("Excluir permanentemente esta tarefa?")) return;
    await PedidoInterno.delete(id);
    await loadData();
  };

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    
    const { draggableId, destination } = result;
    const newStatus = destination.droppableId;
    
    const pedido = pedidos.find(p => p.id === draggableId);
    if (!pedido || pedido.status === newStatus) return;

    setPedidos(prev => prev.map(p => p.id === draggableId ? { ...p, status: newStatus } : p));

    try {
      await PedidoInterno.update(draggableId, { 
        status: newStatus,
        data_conclusao: newStatus === "concluido" ? new Date().toISOString().split('T')[0] : null
      });
    } catch (error) {
      console.error("Erro ao mover:", error);
      await loadData();
    }
  };

  const formatCurrency = (v) => v ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : null;
  const formatDate = (d) => d ? format(new Date(d), "dd MMM", { locale: ptBR }) : null;

  const getPedidosByStatus = (status) => pedidos.filter(p => p.status === status);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 border-t-blue-600 mx-auto"></div>
            <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-blue-600" />
          </div>
          <p className="text-slate-600 mt-4 font-medium">Carregando tarefas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-full mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-1">
                <FileText className="w-6 h-6 text-orange-500" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Tarefas Internas</h1>
                <p className="text-sm text-gray-600 mt-1">{pedidos.length} tarefas no total</p>
              </div>
            </div>
            <Button 
              onClick={() => { resetForm(); setShowModal(true); }} 
              className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/25 border-0"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nova Tarefa
            </Button>
          </div>
        </div>
      </div>

      {/* Pipeline Board */}
      <div className="p-4 sm:p-6">
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
            {PIPELINES.map(pipeline => {
              const PipelineIcon = pipeline.icon;
              const pipelinePedidos = getPedidosByStatus(pipeline.id);
              
              return (
                <div key={pipeline.id} className="flex-shrink-0 w-80 snap-start">
                  {/* Pipeline Header */}
                  <div className={`rounded-2xl overflow-hidden shadow-sm`}>
                    <div className={`bg-gradient-to-r ${pipeline.gradient} p-4`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                            <PipelineIcon className="w-4 h-4 text-white" />
                          </div>
                          <span className="font-semibold text-white">{pipeline.label}</span>
                        </div>
                        <div className="px-2.5 py-1 rounded-full bg-white/20 backdrop-blur">
                          <span className="text-sm font-medium text-white">{pipelinePedidos.length}</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Droppable Area */}
                    <Droppable droppableId={pipeline.id}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`min-h-[60vh] p-3 transition-all duration-200 ${pipeline.bg} ${
                            snapshot.isDraggingOver 
                              ? 'bg-blue-100 ring-2 ring-blue-400 ring-inset' 
                              : ''
                          }`}
                        >
                          <div className="space-y-3">
                            {pipelinePedidos.map((pedido, index) => {
                              const prioridade = PRIORIDADES[pedido.prioridade] || PRIORIDADES.media;
                              const categoria = CATEGORIAS[pedido.categoria] || CATEGORIAS.outros;
                              
                              return (
                                <Draggable key={pedido.id} draggableId={pedido.id} index={index}>
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      className={`group bg-white rounded-xl border border-slate-200 overflow-hidden transition-all duration-200 ${
                                        snapshot.isDragging 
                                          ? 'shadow-2xl ring-2 ring-blue-400 rotate-2 scale-105' 
                                          : 'shadow-sm hover:shadow-md hover:border-slate-300'
                                      }`}
                                    >
                                      {/* Card Header with drag handle */}
                                      <div 
                                        {...provided.dragHandleProps}
                                        className="px-4 py-3 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 cursor-grab active:cursor-grabbing"
                                      >
                                        <div className="flex items-start gap-3">
                                          <div className="mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <GripVertical className="w-4 h-4 text-slate-400" />
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <h4 className="font-semibold text-slate-800 truncate pr-2">
                                              {pedido.titulo}
                                            </h4>
                                          </div>
                                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button 
                                              onClick={(e) => openEditModal(pedido, e)} 
                                              className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                                            >
                                              <Pencil className="w-3.5 h-3.5 text-slate-500" />
                                            </button>
                                            {pipeline.id === "excluido" && (
                                              <button 
                                                onClick={(e) => handleDelete(pedido.id, e)} 
                                                className="p-1.5 rounded-lg hover:bg-red-100 transition-colors"
                                              >
                                                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                      
                                      {/* Card Body */}
                                      <div className="px-4 py-3">
                                        {pedido.descricao && (
                                          <p className="text-sm text-slate-500 line-clamp-2 mb-3">
                                            {pedido.descricao}
                                          </p>
                                        )}
                                        
                                        {/* Tags */}
                                        <div className="flex flex-wrap gap-2 mb-3">
                                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border ${prioridade.color}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${prioridade.dot}`}></span>
                                            {pedido.prioridade}
                                          </span>
                                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                            <span>{categoria.emoji}</span>
                                            {categoria.label}
                                          </span>
                                        </div>
                                        
                                        {/* Footer */}
                                        <div className="flex items-center justify-between text-xs text-slate-400">
                                          <div className="flex items-center gap-1">
                                            <Calendar className="w-3.5 h-3.5" />
                                            {formatDate(pedido.created_date)}
                                          </div>
                                          {pedido.valor_estimado && (
                                            <span className="font-medium text-slate-600">
                                              {formatCurrency(pedido.valor_estimado)}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </Draggable>
                              );
                            })}
                          </div>
                          {provided.placeholder}
                          
                          {/* Empty State */}
                          {pipelinePedidos.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${pipeline.gradient} opacity-20 flex items-center justify-center mb-3`}>
                                <PipelineIcon className="w-6 h-6 text-slate-600" />
                              </div>
                              <p className="text-sm text-slate-400">Arraste tarefas aqui</p>
                            </div>
                          )}
                        </div>
                      )}
                    </Droppable>
                  </div>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      </div>

      {/* Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="w-[95vw] max-w-[550px] max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-slate-800">
              {editingItem ? "Editar Tarefa" : "Nova Tarefa"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            <div className="sm:col-span-2">
              <Label className="text-slate-700">Título *</Label>
              <Input 
                value={formData.titulo} 
                onChange={(e) => setFormData({ ...formData, titulo: e.target.value })} 
                placeholder="O que precisa ser feito?" 
                className="mt-1.5 rounded-xl border-slate-200 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <Label className="text-slate-700">Categoria *</Label>
              <Select value={formData.categoria} onValueChange={(v) => setFormData({ ...formData, categoria: v })}>
                <SelectTrigger className="mt-1.5 rounded-xl border-slate-200"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORIAS).map(([key, val]) => (
                    <SelectItem key={key} value={key}>{val.emoji} {val.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-700">Prioridade</Label>
              <Select value={formData.prioridade} onValueChange={(v) => setFormData({ ...formData, prioridade: v })}>
                <SelectTrigger className="mt-1.5 rounded-xl border-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">🔵 Baixa</SelectItem>
                  <SelectItem value="media">🟡 Média</SelectItem>
                  <SelectItem value="alta">🟠 Alta</SelectItem>
                  <SelectItem value="urgente">🔴 Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-700">Valor Estimado</Label>
              <Input 
                value={formData.valor_estimado} 
                onChange={(e) => setFormData({ ...formData, valor_estimado: e.target.value })} 
                placeholder="R$ 0,00" 
                className="mt-1.5 rounded-xl border-slate-200"
              />
            </div>
            <div>
              <Label className="text-slate-700">Pipeline</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger className="mt-1.5 rounded-xl border-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PIPELINES.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-slate-700">Descrição</Label>
              <Textarea 
                value={formData.descricao} 
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })} 
                placeholder="Adicione mais detalhes..." 
                rows={3} 
                className="mt-1.5 rounded-xl border-slate-200 resize-none"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-slate-700">Anexo</Label>
              <div className="flex items-center gap-2 mt-1.5">
                <input type="file" id="anexo" className="hidden" onChange={(e) => handleUpload(e.target.files?.[0])} />
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => document.getElementById("anexo").click()} 
                  disabled={isUploading} 
                  className="flex-1 rounded-xl border-dashed border-2 hover:border-blue-400 hover:bg-blue-50"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {isUploading ? "Enviando..." : "Adicionar arquivo"}
                </Button>
                {formData.anexo_url && (
                  <a href={formData.anexo_url} target="_blank" rel="noreferrer" className="text-blue-600 text-sm hover:underline">
                    Ver arquivo
                  </a>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowModal(false)} className="rounded-xl">
              Cancelar
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={isSaving} 
              className="rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 border-0"
            >
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}