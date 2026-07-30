import { Link } from "react-router-dom";
import PropTypes from "prop-types";
import { Checkbox } from "@/components/ui/checkbox";
import { createPageUrl } from "@/utils";
import { cn } from "@/lib/utils";

export default function PrivacyAcknowledgement({
  checked,
  onCheckedChange,
  id = "privacy-acknowledgement",
  sensitive = false,
  className,
}) {
  return (
    <div className={cn("rounded-2xl border border-blue-100 bg-blue-50/60 p-4", className)}>
      <div className="flex items-start gap-3">
        <Checkbox id={id} checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} className="mt-0.5" />
        <label htmlFor={id} className="text-sm leading-6 text-slate-700">
          {sensitive
            ? "Autorizo o tratamento das informações de saúde fornecidas para segurança no trabalho, atendimento emergencial e cumprimento das obrigações aplicáveis."
            : "Li e estou ciente de como meus dados serão utilizados neste cadastro, conforme o "}
          {!sensitive ? (
            <>
              <Link to={createPageUrl("Privacidade")} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 hover:underline">
                Aviso de Privacidade
              </Link>
              {" e os "}
              <Link to={createPageUrl("TermosUso")} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 hover:underline">
                Termos de Uso
              </Link>
              .
            </>
          ) : null}
        </label>
      </div>
    </div>
  );
}

PrivacyAcknowledgement.propTypes = {
  checked: PropTypes.bool.isRequired,
  onCheckedChange: PropTypes.func.isRequired,
  id: PropTypes.string,
  sensitive: PropTypes.bool,
  className: PropTypes.string,
};
