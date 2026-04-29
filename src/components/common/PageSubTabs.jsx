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
        className={cn("inline-grid h-auto min-w-max gap-1 rounded-2xl bg-gray-100 p-1 sm:grid sm:min-w-full", listClassName)}
        style={{ gridTemplateColumns: columns }}
      >
        {items.map((item) => (
          <TabsTrigger
            key={item.value}
            value={item.value}
            className={cn(
              "rounded-xl px-3 py-2 text-sm font-medium whitespace-nowrap",
              item.icon || item.content ? "flex items-center gap-2" : "",
              triggerClassName,
              item.triggerClassName,
            )}
          >
            {item.icon ? <item.icon className="h-4 w-4 shrink-0" /> : null}
            {item.content ?? <span>{item.label}</span>}
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
  );
}
