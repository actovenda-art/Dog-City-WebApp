import PropTypes from "prop-types";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function FinancialOperationalAlert({
  status,
  title = "Situação financeira",
  variant = "full",
  className = "",
}) {
  if (!status) return null;

  const isIrregular = status.isIrregular;
  const compact = variant === "compact";

  return (
    <div
      className={[
        "rounded-2xl border px-4 py-3",
        isIrregular ? "border-red-200 bg-red-50/80 text-red-900" : "border-emerald-200 bg-emerald-50/70 text-emerald-950",
        compact ? "w-full max-w-md" : "",
        className,
      ].join(" ").trim()}
    >
      <div className="flex items-start gap-3">
        <div className={`rounded-xl p-2 ${isIrregular ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
          {isIrregular ? <AlertTriangle className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{title}</p>
            <Badge className={`${isIrregular ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"} whitespace-nowrap`}>
              {status.label}
              {isIrregular ? " (>5 dias)" : ""}
            </Badge>
          </div>
          <p className={`mt-1 text-sm ${isIrregular ? "text-red-800" : "text-emerald-800"}`}>{status.helper}</p>
          {status.message ? (
            <p className={`mt-2 text-sm ${compact ? "" : "max-w-2xl"} ${isIrregular ? "text-red-900" : "text-emerald-900"}`}>
              {status.message}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

FinancialOperationalAlert.propTypes = {
  status: PropTypes.shape({
    label: PropTypes.string,
    helper: PropTypes.string,
    message: PropTypes.string,
    isIrregular: PropTypes.bool,
  }),
  title: PropTypes.string,
  variant: PropTypes.oneOf(["full", "compact"]),
  className: PropTypes.string,
};
