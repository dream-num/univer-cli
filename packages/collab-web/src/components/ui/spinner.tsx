import { LoaderCircle } from "lucide-react";
import { cn } from "../../lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <LoaderCircle
      role="status"
      aria-label="loading"
      data-slot="spinner"
      className={cn("size-7 animate-spin text-foreground/60", className)}
    />
  );
}
