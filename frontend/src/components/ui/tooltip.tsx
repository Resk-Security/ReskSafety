import { ReactNode } from "react";

export function Tooltip({
  children,
  content,
}: {
  children: ReactNode;
  content: ReactNode;
}) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 hidden w-max max-w-xs -translate-x-1/2 rounded-md border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-lg group-hover:block">
        {content}
      </span>
    </span>
  );
}

export function TooltipRight({
  children,
  content,
}: {
  children: ReactNode;
  content: ReactNode;
}) {
  return (
    <span className="group relative inline-flex cursor-pointer">
      {children}
      <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-1 hidden -translate-y-1/2 rounded-md border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-lg group-hover:block w-48">
        {content}
      </span>
    </span>
  );
}