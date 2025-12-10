import React, { useState, useEffect } from "react";
import { User } from "@/api/entities";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Search,
  Dog as DogIcon,
  User as UserIcon,
  CheckCircle,
  ArrowLeft,
  ArrowRight,
  Upload,
  Home,
  Calendar, // Will now be used for Day Care
  Droplet,
  Scissors,
  RefreshCw, // New icon for Adaptação
  GraduationCap // New icon for Adestramento
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import { UploadFile } from "@/api/integrations";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkin } from "@/api/entities"; // New import

export default function Registrador() {
  const [dogs, setDogs] = useState([]);
  const [filteredDogs, setFilteredDogs] = useState([]);
  const [presentDogs, setPresentDogs] = useState([]); // cães presentes para check-out, will now include checkin_id
  const [presentProviders, setPresentProviders] = useState([]); // New state for present providers
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // 'all', 'present', 'arriving'
  const [isLoading, setIsLoading] = useState(true);
  const [mode, setMode] = useState(null); // 'pet' ou 'provider'
  const [cpf, setCpf] = useState("");

  // Pre check-in form
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [selectedDog, setSelectedDog] = useState(null);
  const [monitors, setMonitors] = useState([]);
  const [checkinForm, setCheckinForm] = useState({
    monitor_id: "",
    entregador: "",
    service: "",
    pertences_foto_url: ""
  });
  const [isUploading, setIsUploading] = useState(false);

  // Generic notification modal
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyTitle, setNotifyTitle] = useState("");
  const [notifyMessage, setNotifyMessage] = useState("");

  useEffect(() => {
    const initLoad = async () => {
      const loadedDogs = await loadDogs(); // Load dogs and get the result
      await loadMonitors();
      await loadPresentCheckins(loadedDogs); // Pass loaded dogs to loadPresentCheckins
      setIsLoading(false); // Set loading to false after all initial data is loaded
    };
    initLoad();
  }, []);

  useEffect(() => {
    if (!searchTerm.trim()) {
      if (statusFilter === "all") {
        setFilteredDogs([]);
      } else {
        let filtered = dogs;
        if (statusFilter === "present") {
            filtered = filtered.filter(dog => presentDogs.some(pd => pd.id === dog.id));
        } else if (statusFilter === "arriving") {
            filtered = filtered.filter(dog => !presentDogs.some(pd => pd.id === dog.id));
        }
        setFilteredDogs(filtered);
      }
      return;
    }
    const searchLower = searchTerm.toLowerCase();
    let filtered = dogs.filter(dog =>
      (dog.nome_pet || "").toLowerCase().includes(searchLower) ||
      (dog.nome_tutor || "").toLowerCase().includes(searchLower) ||
      (dog.raca || "").toLowerCase().includes(searchLower)
    );

    if (statusFilter === "present") {
      filtered = filtered.filter(dog => presentDogs.some(pd => pd.id === dog.id));
    } else if (statusFilter === "arriving") {
      filtered = filtered.filter(dog => !presentDogs.some(pd => pd.id === dog.id));
    }

    setFilteredDogs(filtered);
  }, [searchTerm, dogs, statusFilter, presentDogs]);

  // Replace backend load with sample data (sem entidade)
  const loadDogs = async () => {
    // Amostra local de cães para busca (sem persistência)
    const sampleDogs = [
      {
        id: "1",
        nome_pet: "Luna",
        nome_tutor: "Maria Silva",
        raca: "Labrador",
        idade: "2 anos",
        peso: "25",
        foto_url: "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=400",
        services: ["hospedagem", "banho"]
      },
      {
        id: "2",
        nome_pet: "Thor",
        nome_tutor: "João Souza",
        raca: "Bulldog Francês",
        idade: "3 anos",
        peso: "12",
        foto_url: "https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=400",
        services: ["day_care", "tosa"]
      },
      {
        id: "3",
        nome_pet: "Mel",
        nome_tutor: "Ana Lima",
        raca: "Poodle",
        idade: "1 ano",
        peso: "8",
        foto_url: "",
        services: ["adestramento"]
      },
      {
        id: "4",
        nome_pet: "Rex",
        nome_tutor: "Carlos Pereira",
        raca: "Pastor Alemão",
        idade: "5 anos",
        peso: "35",
        foto_url: "https://images.unsplash.com/photo-1568572933382-74d440642117?w=400",
        services: ["hospedagem", "day_care", "banho", "tosa"]
      },
      {
        id: "5",
        nome_pet: "Bela",
        nome_tutor: "Sofia Martins",
        raca: "Golden Retriever",
        idade: "4 anos",
        peso: "28",
        foto_url: "https://images.unsplash.com/photo-1633722715463-d30f4f325e24?w=400",
        services: ["banho", "tosa", "adaptacao"]
      },
    ];
    setDogs(sampleDogs);
    return sampleDogs; // Return the loaded dogs
  };

  const loadMonitors = async () => {
    try {
      const allUsers = await User.list("-created_date", 500);
      const onlyMonitors = allUsers.filter(u => u.profile === "monitoria" && u.active !== false);
      setMonitors(onlyMonitors);
    } catch (e) {
      console.error("Erro ao carregar monitores:", e);
      setMonitors([]);
    }
  };

  const loadPresentCheckins = async (currentDogs) => { // Now accepts currentDogs as argument
    try {
      const allCheckins = await Checkin.filter({ status: "presente" }, "-checkin_datetime", 100);

      const petCheckinsRaw = allCheckins.filter(c => c.tipo === "pet");
      const providerCheckinsRaw = allCheckins.filter(c => c.tipo === "prestador");

      const presentDogsWithDetails = petCheckinsRaw.map(checkin => {
        // Use currentDogs from the argument to ensure data is available
        const dog = currentDogs.find(d => d.id === checkin.dog_id);
        if (dog) {
          return { ...dog, checkin_id: checkin.id, checkin_details: checkin }; // Add checkin_id and full checkin details
        }
        return null;
      }).filter(Boolean); // Filter out any dogs not found

      setPresentDogs(presentDogsWithDetails);

      const userIds = providerCheckinsRaw.map(c => c.user_id).filter(Boolean);
      if (userIds.length > 0) {
        const allUsers = await User.list("-created_date", 500); // Fetch all users to find the present ones
        const presentUsers = allUsers.filter(u => userIds.includes(u.id));

        setPresentProviders(presentUsers.map(u => {
          const checkin = providerCheckinsRaw.find(c => c.user_id === u.id);
          return {
            ...u,
            checkin_id: checkin?.id, // Attach the checkin ID to the provider object
            checkin_details: checkin
          };
        }));
      } else {
        setPresentProviders([]);
      }
    } catch (error) {
      console.error("Erro ao carregar check-ins presentes:", error);
      setPresentDogs([]);
      setPresentProviders([]);
    }
  };

  const openCheckinModal = (dog) => {
    setSelectedDog(dog);
    setCheckinForm({
      monitor_id: "",
      entregador: "",
      service: "",
      pertences_foto_url: ""
    });
    setShowCheckinModal(true);
  };

  const handleUploadPertences = async (file) => {
    if (!file) return;
    setIsUploading(true);
    try {
      const { file_url } = await UploadFile({ file });
      setCheckinForm(prev => ({ ...prev, pertences_foto_url: file_url }));
    } catch (error) {
      console.error("Erro ao fazer upload da imagem:", error);
      setNotifyTitle("Erro no upload");
      setNotifyMessage("Não foi possível enviar a imagem. Tente novamente.");
      setNotifyOpen(true);
    } finally {
      setIsUploading(false);
    }
  };

  const submitCheckin = async () => {
    if (!selectedDog) return;
    if (!checkinForm.monitor_id || !checkinForm.entregador || !checkinForm.service) {
      setNotifyTitle("Formulário incompleto");
      setNotifyMessage("Preencha monitor, entregador e serviço para continuar.");
      setNotifyOpen(true);
      return;
    }
    if (checkinForm.service === "Hospedagem" && !checkinForm.pertences_foto_url) {
      setNotifyTitle("Foto obrigatória");
      setNotifyMessage("Para hospedagem, é necessário anexar foto dos pertences.");
      setNotifyOpen(true);
      return;
    }

    try {
      await Checkin.create({
        tipo: "pet",
        dog_id: selectedDog.id,
        monitor_id: checkinForm.monitor_id,
        entregador: checkinForm.entregador,
        service: checkinForm.service,
        pertences_foto_url: checkinForm.pertences_foto_url,
        checkin_datetime: new Date().toISOString(),
        status: "presente"
      });

      // Refresh all present checkins
      await loadPresentCheckins(dogs);
      setShowCheckinModal(false);
      setSelectedDog(null);
      setNotifyTitle("Check-in realizado");
      setNotifyMessage(`Check-in realizado com sucesso para ${selectedDog.nome_pet}!`);
      setNotifyOpen(true);
      setSearchTerm("");
      setFilteredDogs([]); // Clear filtered results after check-in
    } catch (error) {
      console.error("Erro ao realizar check-in do pet:", error);
      setNotifyTitle("Erro");
      setNotifyMessage("Erro ao realizar check-in do pet. Tente novamente.");
      setNotifyOpen(true);
    }
  };

  const getServiceIcon = (service, isActive) => {
    const color = isActive ? "text-green-600" : "text-gray-300";
    const size = "w-5 h-5";

    switch(service) {
      case "day_care":
        return <Calendar className={`${size} ${color}`} title="Day Care" />;
      case "hospedagem":
        return <Home className={`${size} ${color}`} title="Hospedagem" />;
      case "adaptacao":
        return <RefreshCw className={`${size} ${color}`} title="Adaptação" />;
      case "banho":
        return <Droplet className={`${size} ${color}`} title="Banho" />;
      case "tosa":
        return <Scissors className={`${size} ${color}`} title="Tosa" />;
      case "adestramento":
        return <GraduationCap className={`${size} ${color}`} title="Adestramento" />;
      default:
        return null;
    }
  };

  const handleCheckOutDog = async (dogId, checkinId) => { // checkinId is now a parameter
    try {
      await Checkin.update(checkinId, {
        checkout_datetime: new Date().toISOString(),
        status: "finalizado"
      });

      // Refresh all present checkins
      await loadPresentCheckins(dogs);
      const dog = dogs.find(d => d.id === dogId); // Find the original dog details for notification
      setNotifyTitle("Check-out realizado");
      setNotifyMessage(`Check-out realizado com sucesso para ${dog?.nome_pet || "o pet"}!`);
      setNotifyOpen(true);
    } catch (error) {
      console.error("Erro ao realizar check-out do pet:", error);
      setNotifyTitle("Erro");
      setNotifyMessage("Erro ao realizar check-out do pet. Tente novamente.");
      setNotifyOpen(true);
    }
  };

  const handleCheckInProvider = async () => {
    if (!cpf || cpf.replace(/\D/g, '').length !== 11) {
      setNotifyTitle("CPF inválido");
      setNotifyMessage("Por favor, informe um CPF válido.");
      setNotifyOpen(true);
      return;
    }
    try {
      const allUsers = await User.list();
      const user = allUsers.find(u => (u.cpf || "").replace(/\D/g, '') === cpf.replace(/\D/g, ''));
      if (user) {
        // Check if provider is already checked in
        const isAlreadyPresent = presentProviders.some(p => p.id === user.id);
        if (isAlreadyPresent) {
          setNotifyTitle("Prestador já registrado");
          setNotifyMessage(`${user.full_name} já está presente.`);
          setNotifyOpen(true);
          return;
        }

        await Checkin.create({
          tipo: "prestador",
          user_id: user.id,
          checkin_datetime: new Date().toISOString(),
          status: "presente"
        });

        // Refresh all present checkins
        await loadPresentCheckins(dogs);
        setNotifyTitle("Registro de prestador");
        setNotifyMessage(`Registro realizado com sucesso para ${user.full_name}!`);
        setNotifyOpen(true);
        setCpf("");
      } else {
        setNotifyTitle("Prestador não encontrado");
        setNotifyMessage("Verifique o CPF informado e tente novamente.");
        setNotifyOpen(true);
      }
    } catch (error) {
      console.error("Erro ao buscar prestador ou realizar check-in:", error);
      setNotifyTitle("Erro");
      setNotifyMessage("Erro ao realizar o registro. Tente novamente.");
      setNotifyOpen(true);
    }
  };

  const handleCheckOutProvider = async (checkinId, userName) => {
    try {
      await Checkin.update(checkinId, {
        checkout_datetime: new Date().toISOString(),
        status: "finalizado"
      });

      // Refresh all present checkins
      await loadPresentCheckins(dogs);
      setNotifyTitle("Check-out realizado");
      setNotifyMessage(`Check-out realizado com sucesso para ${userName}!`);
      setNotifyOpen(true);
    } catch (error) {
      console.error("Erro ao realizar check-out do prestador:", error);
      setNotifyTitle("Erro");
      setNotifyMessage("Erro ao realizar check-out do prestador. Tente novamente.");
      setNotifyOpen(true);
    }
  };

  const formatCPF = (value) => {
    const numbers = value.replace(/\D/g, '');
    let formatted = numbers;
    if (numbers.length > 3) formatted = `${numbers.slice(0, 3)}.${numbers.slice(3)}`;
    if (numbers.length > 6) formatted = `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6)}`;
    if (numbers.length > 9) formatted = `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6, 9)}-${numbers.slice(9, 11)}`;
    return formatted.slice(0, 14);
  };

  const resetMode = () => {
    setMode(null);
    setSearchTerm("");
    setCpf("");
    setFilteredDogs([]);
    setStatusFilter("all");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-start gap-3 mb-2">
            <div className="mt-1">
              <DogIcon className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Registrador</h1>
              <p className="text-sm sm:text-base text-gray-600 mt-1">
                {mode === 'pet' ? 'Registro de Pets' : mode === 'provider' ? 'Registro de Prestadores' : 'Selecione o tipo de registro'}
              </p>
            </div>
          </div>
        </div>

        {/* Toggle Switch Selection */}
        {!mode && (
          <Card className="mb-6 border-gray-200 bg-white shadow-lg overflow-hidden">
            <CardContent className="p-6 sm:p-8">
              <div className="text-center mb-6">
                <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">
                  Selecione o tipo de registro
                </h3>
                <p className="text-sm text-gray-600">
                  Clique em uma das opções abaixo
                </p>
              </div>

              <div className="flex gap-4 justify-center items-stretch">
                {/* Prestador Option */}
                <motion.button
                  onClick={() => setMode('provider')}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex-1 max-w-[200px] p-6 rounded-2xl border-2 border-orange-200 bg-orange-50 hover:bg-orange-100 hover:border-orange-300 transition-all cursor-pointer"
                >
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-orange-200 flex items-center justify-center">
                      <UserIcon className="w-8 h-8 sm:w-10 sm:h-10 text-orange-700" />
                    </div>
                    <div className="text-center">
                      <p className="text-base sm:text-lg font-bold text-orange-900">Prestador</p>
                      <p className="text-xs sm:text-sm text-orange-700 mt-1">Registro de funcionários</p>
                    </div>
                  </div>
                </motion.button>

                {/* Pet Option */}
                <motion.button
                  onClick={() => setMode('pet')}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex-1 max-w-[200px] p-6 rounded-2xl border-2 border-green-200 bg-green-50 hover:bg-green-100 hover:border-green-300 transition-all cursor-pointer"
                >
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-green-200 flex items-center justify-center">
                      <DogIcon className="w-8 h-8 sm:w-10 sm:h-10 text-green-700" />
                    </div>
                    <div className="text-center">
                      <p className="text-base sm:text-lg font-bold text-green-900">Pet</p>
                      <p className="text-xs sm:text-sm text-green-700 mt-1">Registro de cães</p>
                    </div>
                  </div>
                </motion.button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pet Mode - Search and Present Dogs */}
        {mode === 'pet' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="mb-6 border-gray-200 bg-white shadow-lg">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <DogIcon className="w-5 h-5 text-green-600" />
                    <h3 className="font-semibold text-gray-900">Buscar Pet</h3>
                  </div>
                  <Button variant="outline" size="sm" onClick={resetMode} className="text-xs sm:text-sm">
                    Voltar
                  </Button>
                </div>

                <div className="flex gap-3 mb-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <Input
                      type="text"
                      placeholder="Buscar por nome do pet, tutor ou raça..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 text-base sm:text-lg h-12 sm:h-14 border-gray-300"
                    />
                  </div>

                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-32 sm:w-40 h-12 sm:h-14">
                      <SelectValue placeholder="Filtrar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="present">Presentes</SelectItem>
                      <SelectItem value="arriving">Chegando</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {(searchTerm.trim() || statusFilter !== "all") && (
                  <p className="text-xs sm:text-sm text-gray-500 mt-2">
                    {filteredDogs.length} resultado(s) encontrado(s)
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Cães presentes (Check-out) */}
            <Card className="mb-6 border-green-200 bg-white shadow">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <h3 className="font-semibold text-gray-900">Presentes agora</h3>
                </div>
                {presentDogs.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhum pet presente no momento.</p>
                ) : (
                  <div className="space-y-3">
                    {presentDogs.map((dog) => (
                      <motion.div
                        key={dog.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-200"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {dog.foto_url ? (
                            <img
                              src={dog.foto_url}
                              alt={dog.nome_pet}
                              className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                              <DogIcon className="w-5 h-5 text-blue-600" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{dog.nome_pet}</p>
                            <p className="text-xs text-gray-600 truncate">Tutor: {dog.nome_tutor}</p>
                          </div>
                        </div>
                        <Button variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" onClick={() => handleCheckOutDog(dog.id, dog.checkin_id)}>
                          Check-out
                        </Button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Resultados de busca */}
            <AnimatePresence>
              {(searchTerm.trim() || statusFilter !== "all") && filteredDogs.length === 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Card className="border-gray-200 bg-white">
                    <CardContent className="p-8 sm:p-12 text-center">
                      <DogIcon className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">Nenhum pet encontrado</h3>
                      <p className="text-sm sm:text-base text-gray-600">Tente buscar por outro nome, tutor ou raça</p>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {filteredDogs.length > 0 && (
                <div className="space-y-3 sm:space-y-4">
                  {filteredDogs.map((dog) => {
                    const allServices = ["day_care", "hospedagem", "adaptacao", "banho", "tosa", "adestramento"];
                    const dogServices = dog.services || [];

                    return (
                      <motion.div key={dog.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                        <Card className="border-gray-200 bg-white hover:shadow-lg transition-shadow">
                          <CardContent className="p-4 sm:p-6">
                            <div className="flex items-start justify-between gap-3 sm:gap-4">
                              <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
                                {dog.foto_url ? (
                                  <img
                                    src={dog.foto_url}
                                    alt={dog.nome_pet}
                                    className="w-12 h-12 sm:w-16 sm:h-16 rounded-full object-cover flex-shrink-0"
                                  />
                                ) : (
                                  <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                    <DogIcon className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600" />
                                  </div>
                                )}

                                <div className="flex-1 min-w-0">
                                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1 truncate">{dog.nome_pet}</h3>
                                  <div className="space-y-1 mb-2">
                                    <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
                                      <UserIcon className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                                      <span className="truncate">Tutor: {dog.nome_tutor}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
                                      <DogIcon className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                                      <span>Raça: {dog.raca}</span>
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap gap-2 mb-2">
                                    {dog.idade && <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">{dog.idade}</Badge>}
                                    {dog.peso && <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">{dog.peso} kg</Badge>}
                                  </div>

                                  {/* Service Icons */}
                                  <div className="flex gap-2 mt-3">
                                    {allServices.map(service => (
                                      <div key={service} className="flex items-center justify-center">
                                        {getServiceIcon(service, dogServices.includes(service))}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <Button onClick={() => openCheckinModal(dog)} className="bg-green-600 hover:bg-green-700 text-white flex-shrink-0 h-10 sm:h-12 px-4 sm:px-6">
                                <CheckCircle className="w-4 h-4 sm:mr-2" />
                                <span className="hidden sm:inline">Check-in</span>
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Provider Mode - CPF Input */}
        {mode === 'provider' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-gray-200 bg-white shadow-lg mb-6">
              <CardContent className="p-6 sm:p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <UserIcon className="w-5 h-5 text-orange-600" />
                    <h3 className="font-semibold text-gray-900">Registro de Prestador</h3>
                  </div>
                  <Button variant="outline" size="sm" onClick={resetMode} className="text-xs sm:text-sm">
                    Voltar
                  </Button>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-700 mb-2">CPF do Prestador</Label>
                    <Input
                      type="text"
                      value={cpf}
                      onChange={(e) => setCpf(formatCPF(e.target.value))}
                      placeholder="000.000.000-00"
                      maxLength={14}
                      className="text-lg h-12 sm:h-14 border-gray-300"
                    />
                    <p className="text-xs text-gray-500 mt-1">Informe o CPF do prestador de serviço</p>
                  </div>

                  <Button
                    onClick={handleCheckInProvider}
                    disabled={!cpf || cpf.replace(/\D/g, '').length !== 11}
                    className="w-full bg-orange-600 hover:bg-orange-700 text-white h-12 sm:h-14 text-base sm:text-lg"
                  >
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Realizar Registro
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Prestadores presentes (Check-out) */}
            <Card className="border-orange-200 bg-white shadow mt-6">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="w-5 h-5 text-orange-600" />
                  <h3 className="font-semibold text-gray-900">Prestadores Presentes</h3>
                </div>
                {presentProviders.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhum prestador presente no momento.</p>
                ) : (
                  <div className="space-y-3">
                    {presentProviders.map((provider) => (
                      <motion.div
                        key={provider.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-200"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                            <UserIcon className="w-5 h-5 text-orange-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{provider.full_name}</p>
                            <p className="text-xs text-gray-600 truncate">{provider.email}</p>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          className="text-red-600 border-red-300 hover:bg-red-50 flex-shrink-0"
                          onClick={() => handleCheckOutProvider(provider.checkin_id, provider.full_name)}
                        >
                          Check-out
                        </Button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>

      {/* Modal: Pre Check-in do Pet */}
      <Dialog open={showCheckinModal} onOpenChange={setShowCheckinModal}>
        <DialogContent className="w-[95vw] max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Pré Check-in do Pet</DialogTitle>
            <DialogDescription>Preencha as informações para concluir o check-in</DialogDescription>
          </DialogHeader>

          {selectedDog && (
            <div className="space-y-4 py-2">
              <div className="p-3 rounded-md bg-gray-50 border border-gray-200">
                <p className="text-sm text-gray-700">
                  Pet: <span className="font-semibold">{selectedDog.nome_pet}</span> • Tutor: <span className="font-semibold">{selectedDog.nome_tutor}</span>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="monitor-select" className="text-sm">Nome do monitor</Label>
                <select
                  id="monitor-select"
                  value={checkinForm.monitor_id}
                  onChange={(e) => setCheckinForm(prev => ({ ...prev, monitor_id: e.target.value }))}
                  className="w-full border rounded-md px-3 py-2 text-sm border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="">Selecione um monitor</option>
                  {monitors.map(m => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="entregador-input" className="text-sm">Nome de quem entregou o cão</Label>
                <Input
                  id="entregador-input"
                  placeholder="Digite o nome de quem entregou"
                  value={checkinForm.entregador}
                  onChange={(e) => setCheckinForm(prev => ({ ...prev, entregador: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="service-select" className="text-sm">Serviço</Label>
                <select
                  id="service-select"
                  value={checkinForm.service}
                  onChange={(e) => setCheckinForm(prev => ({ ...prev, service: e.target.value }))}
                  className="w-full border rounded-md px-3 py-2 text-sm border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="">Selecione o serviço</option>
                  <option value="Day Care">Day Care</option>
                  <option value="Hospedagem">Hospedagem</option>
                  <option value="Adaptação">Adaptação</option>
                  <option value="Banho">Banho</option>
                  <option value="Tosa">Tosa</option>
                  <option value="Banho e Tosa">Banho e Tosa</option>
                  <option value="Adestramento">Adestramento</option>
                </select>
              </div>

              {checkinForm.service === "Hospedagem" && (
                <div className="space-y-2">
                  <Label htmlFor="uploadPertences" className="text-sm">Foto dos pertences</Label>
                  <div className="flex items-center gap-3">
                    <input
                      id="uploadPertences"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleUploadPertences(e.target.files?.[0])}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById("uploadPertences").click()}
                      disabled={isUploading}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {isUploading ? "Enviando..." : "Enviar foto"}
                    </Button>
                    {checkinForm.pertences_foto_url && (
                      <a
                        href={checkinForm.pertences_foto_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 text-sm underline"
                      >
                        Ver imagem
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCheckinModal(false)}>Cancelar</Button>
            <Button onClick={submitCheckin} className="bg-green-600 hover:bg-green-700 text-white">
              Concluir Check-in
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Notificações */}
      <Dialog open={notifyOpen} onOpenChange={setNotifyOpen}>
        <DialogContent className="w-[92vw] max-w-[460px]">
          <DialogHeader>
            <DialogTitle>{notifyTitle || "Notificação"}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-gray-700">{notifyMessage}</p>
          </div>
          <DialogFooter>
            <Button onClick={() => setNotifyOpen(false)} className="bg-blue-600 hover:bg-blue-700 text-white">OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}