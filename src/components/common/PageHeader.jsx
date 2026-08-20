import { cn } from "@/lib/utils";

export default function PageHeader({
  eyebrow,
  title,
  description,
  actions = null,
  className,
  actionsClassName,
}) {
  return (
    <header
      className={cn(
        "mb-4 flex flex-col gap-3 border-b border-slate-200 pb-5 sm:mb-6 sm:gap-4 sm:pb-6 lg:flex-row lg:items-start lg:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-blue-600 sm:text-xs">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-brand text-2xl leading-tight tracking-tight text-slate-950 sm:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-500 sm:text-[15px]">
            {description}
          </p>
        ) : null}
      </div>

      {actions ? (
        <div className={cn("flex w-full items-center gap-2 lg:w-auto lg:shrink-0", actionsClassName)}>
          {actions}
        </div>
      ) : null}
    </header>
  );
}
