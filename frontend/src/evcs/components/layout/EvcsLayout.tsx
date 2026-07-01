import type { ReactNode } from "react";

interface EvcsLayoutProps {
  children: ReactNode;
}

export function EvcsLayout({ children }: EvcsLayoutProps) {
  return (
    <>
      <main className="evcs-main">{children}</main>
    </>
  );
}
