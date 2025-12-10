import React, { useState, useEffect } from "react";
import { User } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Search,
  UserPlus,
  Pencil,
  Trash2,
  Shield,
  Users,
  Home,
  Scissors,
  Car,
  CheckCircle,
  XCircle,
  Mail,
  Phone,
  DollarSign,
  MoreVertical,
  Eye,
  Key,
  AlertCircle,
  Copy,
  CheckCheck
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";

export default function Dev_Dashboard() {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterProfile, setFilterProfile] = useState("all");
  const [showEditModal, setShowEditModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false); // New state for view modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [viewingUser, setViewingUser] = useState(null); // New state for viewing user
  const [isSaving, setIsSaving] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [newUser, setNewUser] = useState({
    full_name: "",
    cpf: "",
    phone: "",
    emergency_contact: "",
    profile: "comercial"
  });

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    let filtered = users;

    if (searchTerm) {
      filtered = filtered.filter(user => 
        user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.phone?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filterProfile !== "all") {
      filtered = filtered.filter(user => user.profile === filterProfile);
    }

    setFilteredUsers(filtered);
  }, [searchTerm, filterProfile, users]);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const allUsers = await User.list("-created_date", 1000);
      setUsers(allUsers);
    } catch (error) {
      console.error("Erro ao carregar usuários:", error);
    }
    setIsLoading(false);
  };

  const handleView = (user) => {
    setViewingUser(user);
    setShowViewModal(true);
  };

  const handleEdit = (user) => {
    setEditingUser({...user});
    setShowEditModal(true);
  };

  const handleSave = async () => {
    if (!editingUser) return;

    setIsSaving(true);
    try {
      await User.update(editingUser.id, {
        profile: editingUser.profile,
        phone: editingUser.phone,
        emergency_contact: editingUser.emergency_contact, // Added emergency_contact
        active: editingUser.active
      });
      
      await loadUsers();
      setShowEditModal(false);
      setEditingUser(null);
    } catch (error) {
      console.error("Erro ao salvar usuário:", error);
      alert("Erro ao salvar usuário. Verifique se você tem permissão para editar este usuário.");
    }
    setIsSaving(false);
  };

  const handleResetPassword = async (user, e) => {
    e.stopPropagation(); // Prevent opening view modal when clicking this button
    
    if (!confirm(`Tem certeza que deseja redefinir a senha de ${user.full_name}?`)) return;

    try {
      // In a real application, this would involve an API call to reset the password securely.
      // For this mock, we generate a random password and display it.
      const randomPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12).toUpperCase() + "!@#";
      
      setGeneratedPassword(randomPassword);
      setShowPasswordModal(true);
      setPasswordCopied(false);
      
      console.log("Reset de senha para:", user.email, "Nova senha:", randomPassword);
      // Here you would typically call an API, e.g., await User.resetPassword(user.id);
    } catch (error) {
      console.error("Erro ao redefinir senha:", error);
      alert("Erro ao redefinir senha. Tente novamente.");
    }
  };

  const handleCopyPassword = async () => {
    try {
      await navigator.clipboard.writeText(generatedPassword);
      setPasswordCopied(true);
      setTimeout(() => setPasswordCopied(false), 2000);
    } catch (error) {
      console.error("Erro ao copiar senha:", error);
      alert("Erro ao copiar senha. Por favor, copie manualmente.");
    }
  };

  const handleDelete = async (userId) => {
    if (!confirm("Tem certeza que deseja excluir este usuário?")) return;

    try {
      await User.delete(userId);
      await loadUsers();
    } catch (error) {
      console.error("Erro ao excluir usuário:", error);
      alert("Erro ao excluir usuário. Apenas administradores podem excluir usuários.");
    }
  };

  const validateFullName = (name) => {
    const trimmedName = name.trim();
    const words = trimmedName.split(/\s+/);
    return words.length >= 2 && words.every(word => word.length > 0);
  };

  const handleNameBlur = () => {
    if (newUser.full_name && !validateFullName(newUser.full_name)) {
      setNameError(true);
    } else {
      setNameError(false);
    }
  };

  const handleInviteUser = () => {
    if (!newUser.full_name || !newUser.cpf || !newUser.phone || !newUser.emergency_contact) {
      alert("Por favor, preencha todos os campos obrigatórios.");
      if (!validateFullName(newUser.full_name)) {
        setNameError(true);
      }
      return;
    }

    if (!validateFullName(newUser.full_name)) {
      setNameError(true);
      return;
    }

    console.log("Convidando usuário:", newUser);
    alert("Funcionalidade será implementada em breve!");
    setShowInviteModal(false);
    setNewUser({
      full_name: "",
      cpf: "",
      phone: "",
      emergency_contact: "",
      profile: "comercial"
    });
    setNameError(false);
  };

  const formatCPF = (value) => {
    const numbers = value.replace(/\D/g, '');
    let formatted = numbers;
    if (numbers.length > 3) {
      formatted = `${numbers.slice(0, 3)}.${numbers.slice(3)}`;
    }
    if (numbers.length > 6) {
      formatted = `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6)}`;
    }
    if (numbers.length > 9) {
      formatted = `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6, 9)}-${numbers.slice(9, 11)}`;
    }
    return formatted.slice(0, 14); // Limit to CPF length
  };

  const formatPhone = (value) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 10) { // (XX) XXXX-XXXX
      return numbers.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    return numbers.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3'); // (XX) XXXXX-XXXX
  };

  const getProfileInfo = (profile) => {
    const profiles = {
      desenvolvedor: { 
        name: "Dev", 
        fullName: "Desenvolvedor",
        icon: Shield, 
        color: "bg-purple-100 text-purple-700 border-purple-200" 
      },
      administrador: { 
        name: "Adm", 
        fullName: "Administrador",
        icon: Shield, 
        color: "bg-blue-100 text-blue-700 border-blue-200" 
      },
      comercial: { 
        name: "Com", 
        fullName: "Comercial",
        icon: Users, 
        color: "bg-orange-100 text-orange-700 border-orange-200" 
      },
      monitoria: { 
        name: "Mon", 
        fullName: "Monitor",
        icon: Home, 
        color: "bg-green-100 text-green-700 border-green-200" 
      },
      banhista_tosador: { 
        name: "Ban", 
        fullName: "Banhista/Tosador",
        icon: Scissors, 
        color: "bg-pink-100 text-pink-700 border-pink-200" 
      },
      motorista: { 
        name: "Mot", 
        fullName: "Motorista",
        icon: Car, 
        color: "bg-indigo-100 text-indigo-700 border-indigo-200" 
      },
      financeiro: { 
        name: "Fin", 
        fullName: "Financeiro",
        icon: DollarSign, 
        color: "bg-emerald-100 text-emerald-700 border-emerald-200" 
      }
    };
    return profiles[profile] || { name: 'N/A', fullName: 'Não definido', icon: Users, color: "bg-gray-100 text-gray-700" };
  };

  const stats = {
    total: users.length,
    inactive: users.filter(u => u.active === false).length,
    byProfile: {
      desenvolvedor: users.filter(u => u.profile === "desenvolvedor" && u.active !== false).length,
      administrador: users.filter(u => u.profile === "administrador" && u.active !== false).length,
      comercial: users.filter(u => u.profile === "comercial" && u.active !== false).length,
      monitoria: users.filter(u => u.profile === "monitoria" && u.active !== false).length,
      banhista_tosador: users.filter(u => u.profile === "banhista_tosador" && u.active !== false).length,
      motorista: users.filter(u => u.profile === "motorista" && u.active !== false).length,
      financeiro: users.filter(u => u.profile === "financeiro" && u.active !== false).length,
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando usuários...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-start gap-3 mb-2">
            <div className="mt-1">
              <Shield className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Gestão de Usuários</h1>
              <p className="text-sm sm:text-base text-gray-600 mt-1">Controle completo de usuários do sistema</p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
          {/* Primeira Linha - Usuários Ativos por Perfil */}
          <Card className="border-green-200 bg-white">
            <CardContent className="p-3 sm:p-4">
              <p className="text-xs sm:text-sm font-medium text-gray-700 mb-2 sm:mb-3">Usuários Ativos por Perfil</p>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                <Badge className="bg-blue-100 text-blue-700 text-xs sm:text-sm px-2 sm:px-3 py-0.5 sm:py-1">
                  <span className="sm:hidden">Adm: {stats.byProfile.administrador}</span>
                  <span className="hidden sm:inline">Administrador: {stats.byProfile.administrador}</span>
                </Badge>
                <Badge className="bg-green-100 text-green-700 text-xs sm:text-sm px-2 sm:px-3 py-0.5 sm:py-1">
                  <span className="sm:hidden">Mon: {stats.byProfile.monitoria}</span>
                  <span className="hidden sm:inline">Monitor: {stats.byProfile.monitoria}</span>
                </Badge>
                <Badge className="bg-indigo-100 text-indigo-700 text-xs sm:text-sm px-2 sm:px-3 py-0.5 sm:py-1">
                  <span className="sm:hidden">Mot: {stats.byProfile.motorista}</span>
                  <span className="hidden sm:inline">Motorista: {stats.byProfile.motorista}</span>
                </Badge>
                <Badge className="bg-purple-100 text-purple-700 text-xs sm:text-sm px-2 sm:px-3 py-0.5 sm:py-1">
                  <span className="sm:hidden">Dev: {stats.byProfile.desenvolvedor}</span>
                  <span className="hidden sm:inline">Desenvolvedor: {stats.byProfile.desenvolvedor}</span>
                </Badge>
                <Badge className="bg-emerald-100 text-emerald-700 text-xs sm:text-sm px-2 sm:px-3 py-0.5 sm:py-1">
                  <span className="sm:hidden">Fin: {stats.byProfile.financeiro}</span>
                  <span className="hidden sm:inline">Financeiro: {stats.byProfile.financeiro}</span>
                </Badge>
                <Badge className="bg-orange-100 text-orange-700 text-xs sm:text-sm px-2 sm:px-3 py-0.5 sm:py-1">
                  <span className="sm:hidden">Com: {stats.byProfile.comercial}</span>
                  <span className="hidden sm:inline">Comercial: {stats.byProfile.comercial}</span>
                </Badge>
                <Badge className="bg-pink-100 text-pink-700 text-xs sm:text-sm px-2 sm:px-3 py-0.5 sm:py-1">
                  <span className="sm:hidden">Ban: {stats.byProfile.banhista_tosador}</span>
                  <span className="hidden sm:inline">Banhista/Tosador: {stats.byProfile.banhista_tosador}</span>
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Segunda Linha - Total e Inativos */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {/* Total de Usuários */}
            <Card className="border-blue-200 bg-white">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-600 mb-1">Total de Usuários</p>
                    <p className="text-2xl sm:text-3xl font-bold text-blue-600">{stats.total}</p>
                  </div>
                  <Users className="w-8 h-8 sm:w-10 sm:h-10 text-blue-600" />
                </div>
              </CardContent>
            </Card>

            {/* Usuários Inativos */}
            <Card className="border-red-200 bg-white">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-600 mb-1">Usuários Inativos</p>
                    <p className="text-2xl sm:text-3xl font-bold text-red-600">{stats.inactive}</p>
                  </div>
                  <XCircle className="w-8 h-8 sm:w-10 sm:h-10 text-red-600" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Filters and Search */}
        <Card className="mb-4 sm:mb-6 border-gray-200 bg-white">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 sm:w-5 sm:h-5" />
                  <Input
                    type="text"
                    placeholder="Buscar por nome, email ou telefone..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 sm:pl-10 border-gray-300 text-sm sm:text-base"
                  />
                </div>
              </div>
              
              <div className="flex gap-2 sm:gap-4">
                <Select value={filterProfile} onValueChange={setFilterProfile}>
                  <SelectTrigger className="flex-1 border-gray-300 text-sm sm:text-base">
                    <SelectValue placeholder="Filtrar por perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os perfis</SelectItem>
                    <SelectItem value="desenvolvedor">Desenvolvedor</SelectItem>
                    <SelectItem value="administrador">Administrador</SelectItem>
                    <SelectItem value="comercial">Comercial</SelectItem>
                    <SelectItem value="monitoria">Monitor</SelectItem>
                    <SelectItem value="banhista_tosador">Banhista/Tosador</SelectItem>
                    <SelectItem value="motorista">Motorista</SelectItem>
                    <SelectItem value="financeiro">Financeiro</SelectItem>
                  </SelectContent>
                </Select>

                <Button 
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm sm:text-base px-3 sm:px-4"
                  onClick={() => setShowInviteModal(true)}
                >
                  <UserPlus className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Convidar</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Users List */}
        <div className="grid gap-3 sm:gap-4">
          <AnimatePresence>
            {filteredUsers.map((user) => {
              const profileInfo = getProfileInfo(user.profile);
              const ProfileIcon = profileInfo.icon;

              return (
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                >
                  <Card 
                    className="border-gray-200 bg-white hover:shadow-lg transition-shadow cursor-pointer"
                    onClick={() => handleView(user)} // Make card clickable to view details
                  >
                    <CardContent className="p-4 sm:p-6">
                      <div className="flex items-start justify-between gap-3 sm:gap-4">
                        <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
                          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full ${user.active !== false ? 'bg-blue-100' : 'bg-gray-200'} flex items-center justify-center flex-shrink-0`}>
                            <ProfileIcon className={`w-5 h-5 sm:w-6 sm:h-6 ${user.active !== false ? 'text-blue-600' : 'text-gray-500'}`} />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
                                {user.full_name || "Nome não informado"}
                              </h3>
                              {user.active === false && (
                                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs flex-shrink-0">
                                  Inativo
                                </Badge>
                              )}
                            </div>
                            
                            <div className="space-y-1 mb-2 sm:mb-3">
                              <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
                                <Mail className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                                <span className="truncate">{user.email}</span>
                              </div>
                              {user.phone && (
                                <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
                                  <Phone className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                                  <span>{formatPhone(user.phone)}</span>
                                </div>
                              )}
                            </div>

                            <Badge className={profileInfo.color + " border text-xs sm:text-sm"}>
                              <ProfileIcon className="w-3 h-3 mr-1" />
                              {profileInfo.fullName}
                            </Badge>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation(); // Prevent card's onClick from firing
                              handleEdit(user);
                            }}
                            className="border-gray-300 hover:bg-gray-50 h-8 w-8 sm:h-10 sm:w-10"
                          >
                            <Pencil className="w-3 h-3 sm:w-4 sm:h-4 text-gray-600" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={(e) => handleResetPassword(user, e)} // Pass event to stop propagation
                            className="border-orange-300 hover:bg-orange-50 h-8 w-8 sm:h-10 sm:w-10"
                          >
                            <Key className="w-3 h-3 sm:w-4 sm:h-4 text-orange-600" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation(); // Prevent card's onClick from firing
                              handleDelete(user.id);
                            }}
                            className="border-red-300 hover:bg-red-50 h-8 w-8 sm:h-10 sm:w-10"
                          >
                            <Trash2 className="w-3 h-3 sm:w-4 sm:h-4 text-red-600" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {filteredUsers.length === 0 && (
            <Card className="border-gray-200 bg-white">
              <CardContent className="p-8 sm:p-12 text-center">
                <Users className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">Nenhum usuário encontrado</h3>
                <p className="text-sm sm:text-base text-gray-600">Tente ajustar os filtros de busca</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Password Reset Modal */}
      <Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
        <DialogContent className="w-[95vw] max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl flex items-center gap-2">
              <Key className="w-5 h-5 text-green-600" />
              Senha Redefinida com Sucesso
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-800">
                  <strong>Importante:</strong> Anote essa senha e entregue ao usuário de forma segura. Esta senha não será exibida novamente.
                </p>
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2">Nova Senha Temporária</Label>
              <div className="relative">
                <Input
                  type="text"
                  value={generatedPassword}
                  readOnly
                  className="bg-gray-50 border-gray-300 font-mono text-sm pr-12"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={handleCopyPassword}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                >
                  {passwordCopied ? (
                    <CheckCheck className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4 text-gray-600" />
                  )}
                </Button>
              </div>
              {passwordCopied && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <CheckCheck className="w-3 h-3" />
                  Senha copiada!
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => setShowPasswordModal(false)}
              className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
            >
              Entendi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Modal */}
      <Dialog open={showViewModal} onOpenChange={setShowViewModal}>
        <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">Informações do Usuário</DialogTitle>
          </DialogHeader>
          
          {viewingUser && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-4 pb-4 border-b border-gray-200">
                {(() => {
                  const profileInfo = getProfileInfo(viewingUser.profile);
                  const ProfileIcon = profileInfo.icon;
                  return (
                    <div className={`w-16 h-16 rounded-full ${viewingUser.active !== false ? 'bg-blue-100' : 'bg-gray-200'} flex items-center justify-center`}>
                      <ProfileIcon className={`w-8 h-8 ${viewingUser.active !== false ? 'text-blue-600' : 'text-gray-500'}`} />
                    </div>
                  );
                })()}
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900">{viewingUser.full_name || "Nome não informado"}</h3>
                  <Badge className={getProfileInfo(viewingUser.profile).color + " border mt-2"}>
                    {getProfileInfo(viewingUser.profile).fullName}
                  </Badge>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-medium text-gray-500">Email</Label>
                  <p className="text-sm text-gray-900 mt-1">{viewingUser.email}</p>
                </div>

                {viewingUser.cpf && (
                  <div>
                    <Label className="text-sm font-medium text-gray-500">CPF</Label>
                    <p className="text-sm text-gray-900 mt-1">{formatCPF(viewingUser.cpf)}</p>
                  </div>
                )}

                {viewingUser.phone && (
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Telefone</Label>
                    <p className="text-sm text-gray-900 mt-1">{formatPhone(viewingUser.phone)}</p>
                  </div>
                )}

                {viewingUser.emergency_contact && (
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Contato de Emergência</Label>
                    <p className="text-sm text-gray-900 mt-1">{formatPhone(viewingUser.emergency_contact)}</p>
                  </div>
                )}

                <div>
                  <Label className="text-sm font-medium text-gray-500">Status</Label>
                  <p className="text-sm text-gray-900 mt-1">
                    {viewingUser.active === false ? (
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                        Inativo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        Ativo
                      </Badge>
                    )}
                  </p>
                </div>

                <div>
                  <Label className="text-sm font-medium text-gray-500">Cadastrado em</Label>
                  <p className="text-sm text-gray-900 mt-1">
                    {new Date(viewingUser.created_date).toLocaleDateString('pt-BR', { 
                      day: '2-digit', 
                      month: '2-digit', 
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>

                {viewingUser.updated_date && (
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Última atualização</Label>
                    <p className="text-sm text-gray-900 mt-1">
                      {new Date(viewingUser.updated_date).toLocaleDateString('pt-BR', { 
                        day: '2-digit', 
                        month: '2-digit', 
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowViewModal(false)}
              className="w-full sm:w-auto"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Modal */}
      <Dialog open={showInviteModal} onOpenChange={setShowInviteModal}>
        <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">Convidar Novo Usuário</DialogTitle>
            <DialogDescription className="text-sm sm:text-base">
              Preencha as informações do novo usuário para enviar o convite
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2">Nome Completo *</Label>
              <Input
                type="text"
                value={newUser.full_name}
                onChange={(e) => {
                  setNewUser({...newUser, full_name: e.target.value});
                  if (nameError) setNameError(false);
                }}
                onBlur={handleNameBlur}
                placeholder="Ex: João da Silva"
                className={`border-gray-300 text-sm sm:text-base ${nameError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
              />
              {nameError ? (
                <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                  <XCircle className="w-3 h-3" />
                  Por favor, informe nome e sobrenome completos
                </p>
              ) : (
                <p className="text-xs text-gray-500 mt-1">Informe nome e sobrenome</p>
              )}
            </div>

            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2">CPF *</Label>
              <Input
                type="text"
                value={newUser.cpf}
                onChange={(e) => setNewUser({...newUser, cpf: formatCPF(e.target.value)})}
                placeholder="000.000.000-00"
                maxLength={14}
                className="border-gray-300 text-sm sm:text-base"
              />
            </div>

            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2">Número de Telefone *</Label>
              <Input
                type="tel"
                value={newUser.phone}
                onChange={(e) => setNewUser({...newUser, phone: formatPhone(e.target.value)})}
                placeholder="(11) 99999-9999"
                maxLength={15}
                className="border-gray-300 text-sm sm:text-base"
              />
            </div>

            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2">Contato de Emergência *</Label>
              <Input
                type="tel"
                value={newUser.emergency_contact}
                onChange={(e) => setNewUser({...newUser, emergency_contact: formatPhone(e.target.value)})}
                placeholder="(11) 99999-9999"
                maxLength={15}
                className="border-gray-300 text-sm sm:text-base"
              />
              <p className="text-xs text-gray-500 mt-1">Número para contato em caso de emergência</p>
            </div>

            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2">Tipo de Perfil *</Label>
              <Select
                value={newUser.profile}
                onValueChange={(value) => setNewUser({...newUser, profile: value})}
              >
                <SelectTrigger className="border-gray-300 text-sm sm:text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desenvolvedor">Desenvolvedor</SelectItem>
                  <SelectItem value="administrador">Administrador</SelectItem>
                  <SelectItem value="comercial">Comercial</SelectItem>
                  <SelectItem value="monitoria">Monitor</SelectItem>
                  <SelectItem value="banhista_tosador">Banhista/Tosador</SelectItem>
                  <SelectItem value="motorista">Motorista</SelectItem>
                  <SelectItem value="financeiro">Financeiro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setShowInviteModal(false);
                setNewUser({
                  full_name: "",
                  cpf: "",
                  phone: "",
                  emergency_contact: "",
                  profile: "comercial"
                });
                setNameError(false);
              }}
              className="border-gray-300 w-full sm:w-auto text-sm sm:text-base"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleInviteUser}
              className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto text-sm sm:text-base"
              disabled={!newUser.full_name || !newUser.cpf || !newUser.phone || !newUser.emergency_contact || nameError}
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Enviar Convite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="w-[95vw] max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">Editar Usuário</DialogTitle>
          </DialogHeader>
          
          {editingUser && (
            <div className="space-y-4 py-4">
              <div>
                <Label className="text-sm font-medium text-gray-700 mb-2">Nome</Label>
                <Input
                  value={editingUser.full_name || ""}
                  disabled
                  className="bg-gray-50 border-gray-300 text-sm sm:text-base"
                />
                <p className="text-xs text-gray-500 mt-1">O nome não pode ser editado</p>
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700 mb-2">Email</Label>
                <Input
                  value={editingUser.email}
                  disabled
                  className="bg-gray-50 border-gray-300 text-sm sm:text-base"
                />
                <p className="text-xs text-gray-500 mt-1">O email não pode ser editado</p>
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700 mb-2">Perfil</Label>
                <Select
                  value={editingUser.profile}
                  onValueChange={(value) => setEditingUser({...editingUser, profile: value})}
                >
                  <SelectTrigger className="border-gray-300 text-sm sm:text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desenvolvedor">Desenvolvedor</SelectItem>
                    <SelectItem value="administrador">Administrador</SelectItem>
                    <SelectItem value="comercial">Comercial</SelectItem>
                    <SelectItem value="monitoria">Monitor</SelectItem>
                    <SelectItem value="banhista_tosador">Banhista/Tosador</SelectItem>
                    <SelectItem value="motorista">Motorista</SelectItem>
                    <SelectItem value="financeiro">Financeiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700 mb-2">Telefone</Label>
                <Input
                  value={editingUser.phone || ""}
                  onChange={(e) => setEditingUser({...editingUser, phone: formatPhone(e.target.value)})}
                  placeholder="(11) 99999-9999"
                  maxLength={15}
                  className="border-gray-300 text-sm sm:text-base"
                />
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700 mb-2">Contato de Emergência</Label>
                <Input
                  value={editingUser.emergency_contact || ""}
                  onChange={(e) => setEditingUser({...editingUser, emergency_contact: formatPhone(e.target.value)})}
                  placeholder="(11) 99999-9999"
                  maxLength={15}
                  className="border-gray-300 text-sm sm:text-base"
                />
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700 mb-2">Status</Label>
                <Select
                  value={editingUser.active === false ? "false" : "true"}
                  onValueChange={(value) => setEditingUser({...editingUser, active: value === "true"})}
                >
                  <SelectTrigger className="border-gray-300 text-sm sm:text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Ativo</SelectItem>
                    <SelectItem value="false">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowEditModal(false)}
              disabled={isSaving}
              className="border-gray-300 w-full sm:w-auto text-sm sm:text-base"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto text-sm sm:text-base"
            >
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}