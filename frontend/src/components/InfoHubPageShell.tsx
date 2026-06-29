import type { ReactNode } from 'react';
import InfoHubTabs from './InfoHubTabs';
import InfoPageHeader from './InfoPageHeader';

type InfoHubPageShellProps = {
  title: string;
  badge: string;
  icon: ReactNode;
  subtitle?: string;
  children: ReactNode;
};

export default function InfoHubPageShell({
  title,
  badge,
  icon,
  subtitle,
  children,
}: InfoHubPageShellProps) {
  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <InfoPageHeader title={title} badge={badge} icon={icon} subtitle={subtitle} />
      <InfoHubTabs />
      {children}
    </div>
  );
}
