import type { ReactElement, ReactNode } from "react";
import { cn } from "../lib/utils";
import { UnitIcon } from "./unit-icon";

export function TitleUnitIcon({
  type,
  className,
  children
}: {
  type: number;
  className?: string;
  children?: ReactNode;
}): ReactElement {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md border shadow-xs [&_svg]:size-4",
        className ?? "border-border bg-background text-muted-foreground"
      )}
    >
      {children ?? <UnitIcon type={type} />}
    </span>
  );
}
