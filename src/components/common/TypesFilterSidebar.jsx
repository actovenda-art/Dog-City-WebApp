import React from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function TypesFilterSidebar({ 
  isOpen, 
  onClose, 
  selectedTypes,
  onToggleType 
}) {
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
              <h2 className="text-lg font-semibold text-gray-900">Tipos</h2>
              <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Tipos de transação</h3>
              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 p-3 rounded-lg border border-gray-200 transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedTypes.entrada}
                    onChange={() => onToggleType('entrada')}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Entradas</span>
                </label>
                
                <label className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 p-3 rounded-lg border border-gray-200 transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedTypes.saida}
                    onChange={() => onToggleType('saida')}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Saídas</span>
                </label>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}