// Icônes au trait, sur une grille de 24 : même épaisseur partout.

import type { ReactNode } from 'react';

function Icone({ children, className = 'icone' }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      {children}
    </svg>
  );
}

export const IconePanier = ({ className }: { className?: string }) => (
  <Icone className={className}>
    <path d="M3 9h18l-2 11H5z" />
    <path d="m8 9 4-5 4 5" />
  </Icone>
);

export const IconeToque = ({ className }: { className?: string }) => (
  <Icone className={className}>
    <path d="M7 14a4 4 0 1 1 1.5-7.7A4 4 0 0 1 16 6a4 4 0 0 1 1 8v5H7z" />
    <path d="M7 17h10" />
  </Icone>
);

export const IconeCarte = ({ className }: { className?: string }) => (
  <Icone className={className}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="M7 9v6M10 9v6M12.5 9v6M15 9v6M17 9v6" />
  </Icone>
);

export const IconeTicket = ({ className }: { className?: string }) => (
  <Icone className={className}>
    <path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z" />
    <path d="M12 8v6M9 11h6" />
  </Icone>
);

export const IconeTendance = ({ className }: { className?: string }) => (
  <Icone className={className}>
    <path d="M3 17l6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </Icone>
);

export const IconeReglages = ({ className }: { className?: string }) => (
  <Icone className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Icone>
);

export const IconeCrayon = ({ className }: { className?: string }) => (
  <Icone className={className}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="m13.5 6.5 4 4" />
  </Icone>
);

export const IconeHorloge = ({ className }: { className?: string }) => (
  <Icone className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icone>
);

export const IconeExterne = ({ className }: { className?: string }) => (
  <Icone className={className}>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Icone>
);

export const IconePhoto = ({ className }: { className?: string }) => (
  <Icone className={className}>
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </Icone>
);
