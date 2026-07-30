import { Link } from "react-router-dom";
import PropTypes from "prop-types";
import { createPageUrl } from "@/utils";
import { openPrivacyPreferences } from "@/lib/privacy-preferences";
import { cn } from "@/lib/utils";

export default function LegalLinks({ className, compact = false }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-slate-500", compact ? "text-[11px]" : "text-xs", className)}>
      <Link className="transition-colors hover:text-blue-700 hover:underline" to={createPageUrl("Privacidade")}>
        Privacidade
      </Link>
      <Link className="transition-colors hover:text-blue-700 hover:underline" to={createPageUrl("TermosUso")}>
        Termos de uso
      </Link>
      <Link className="transition-colors hover:text-blue-700 hover:underline" to={createPageUrl("Cookies")}>
        Cookies
      </Link>
      <button type="button" className="transition-colors hover:text-blue-700 hover:underline" onClick={openPrivacyPreferences}>
        Preferências de cookies
      </button>
    </div>
  );
}

LegalLinks.propTypes = {
  className: PropTypes.string,
  compact: PropTypes.bool,
};
