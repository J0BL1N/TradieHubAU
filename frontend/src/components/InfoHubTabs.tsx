import { NavLink } from 'react-router-dom';

const infoHubTabs = [
  { to: '/how-it-works', label: 'How It Works' },
  { to: '/protected-payments', label: 'Protected Payments' },
  { to: '/trust-and-safety', label: 'Trust & Safety' },
  { to: '/dispute-process', label: 'Dispute Process' },
  { to: '/tradie-verification', label: 'Tradie Verification' },
  { to: '/customer-verification', label: 'Customer Verification' },
];

export default function InfoHubTabs() {
  return (
    <nav className="overflow-x-auto border-b border-border" aria-label="Help topics">
      <div className="flex min-w-max gap-6 text-sm font-extrabold">
        {infoHubTabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `whitespace-nowrap border-b-2 pb-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-t-md ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
