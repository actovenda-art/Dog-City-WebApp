import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export default function PageSubTabs({
  items,
  className,
  listClassName,
  triggerClassName,
  minTabWidth = 136,
}) {
  const columns = items.length <= 4
    ? `repeat(${items.length}, minmax(0, 1fr))`
    : `repeat(${items.length}, minmax(${minTabWidth}px, 1fr))`;

  return (
    <div className={cn("w-full overflow-x-auto pb-1 touch-pan-x", className)}>
      <TabsList
        className={cn("inline-grid h-auto min-w-max gap-1 rounded-xl bg-gray-100 p-0.5 sm:grid sm:min-w-full sm:rounded-2xl sm:p-1", listClassName)}
        style={{ gridTemplateColumns: columns }}
      >
        {items.map((item) => (
          <TabsTrigger
            key={item.value}
            value={item.value}
            className={cn(
              "rounded-lg px-2.5 py-1.5 text-[12px] font-medium whitespace-nowrap sm:rounded-xl sm:px-3 sm:py-2 sm:text-sm",
              item.icon || item.content ? "flex items-center gap-2" : "",
              triggerClassName,
              item.triggerClassName,
            )}
          >
            {item.icon ? <item.icon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" /> : null}
            {item.content ?? <span>{item.label}</span>}
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
  );
}
