import type { ReactNode } from 'react';

type InfoPageHeaderProps = {
  title: string;
  badge: string;
  subtitle?: string;
  icon: ReactNode;
};

export default function InfoPageHeader({ title, badge, subtitle, icon }: InfoPageHeaderProps) {
  return (
    <header className="mx-auto max-w-4xl space-y-4 text-center">
      <h1 className="text-4xl font-black tracking-tight text-foreground sm:text-5xl">
        {title}
      </h1>
      <div className="inline-flex max-w-full items-center justify-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-1.5 text-sm font-extrabold text-primary shadow-sm">
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{badge}</span>
      </div>
      {subtitle && (
        <p className="mx-auto max-w-3xl text-base font-medium leading-7 text-muted-foreground sm:text-lg">
          {subtitle}
        </p>
      )}
    </header>
  );
}
