import React from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const CATEGORIAS = [
  "Bônus",
  "Cashback",
  "Câmbio",
  "Estorno",
  "Investimento",
  "Renda",
  "Rendimento",
  "Sem categoria",
  "Vendas",
  "99 entrega",
  "Alimentação",
  "Animais de estimação",
  "Compras",
  "Construção",
  "Contas",
  "Doações e caridade",
  "Educação",
  "Fatura Cartão Inter",
  "Funcionários",
  "Gift Card",
  "Imposto, juros e multa",
  "Inter Shop",
  "Lazer",
  "Mercado",
  "Moradia",
  "Proprietário",
  "Recarga",
  "Saúde",
  "Seguros",
  "Serviços",
  "Transporte"
];

export default function FilterSidebar({ isOpen, onClose, selectedCategories, onToggleCategory }) {
  return (
    <>
      {/* Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="fixed top-0 right-0 h-full w-[350px] bg-white shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Categorias</h2>
              <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Categories List */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-3">
                {CATEGORIAS.map((categoria) => (
                  <label
                    key={categoria}
                    className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 p-2 rounded-lg transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(categoria)}
                      onChange={() => onToggleCategory(categoria)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{categoria}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  CATEGORIAS.forEach(cat => {
                    if (selectedCategories.includes(cat)) {
                      onToggleCategory(cat);
                    }
                  });
                }}
              >
                Limpar seleção
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}