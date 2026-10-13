// Courbe d'une seule série dans le temps (uPlot). Une seule série, donc
// pas de légende : le titre de la section dit ce qui est tracé. Le
// survol affiche la date et la valeur ; un tableau des valeurs est
// disponible sous le graphique.

import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

interface Proprietes {
  /** Dates en secondes depuis 1970. */
  x: number[];
  y: number[];
  formatY: (v: number) => string;
  formatX: (secondes: number) => string;
  /** Ligne de référence horizontale (par ex. 100 pour un indice). */
  reference?: number;
  /** Description pour les lecteurs d'écran. */
  description: string;
  hauteur?: number;
}

function couleur(element: HTMLElement, variable: string, secours: string): string {
  const valeur = getComputedStyle(element).getPropertyValue(variable).trim();
  return valeur || secours;
}

export function GraphiqueLigne({ x, y, formatY, formatX, reference, description, hauteur = 220 }: Proprietes) {
  const conteneur = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = conteneur.current;
    if (!element || x.length === 0) return;

    let graphique: uPlot | null = null;

    const construire = () => {
      graphique?.destroy();
      const stylo = couleur(element, '--stylo', '#2B48C9');
      const grille = couleur(element, '--trait', '#DCE0E5');
      const encre2 = couleur(element, '--encre-2', '#5B6575');
      const surface = couleur(element, '--surface', '#FFFFFF');

      const options: uPlot.Options = {
        width: Math.max(element.clientWidth, 260),
        height: hauteur,
        padding: [12, 8, 0, 0],
        legend: { show: false },
        cursor: { drag: { x: false, y: false }, points: { size: 10, stroke: surface, width: 2, fill: stylo } },
        scales: { x: { time: true } },
        series: [
          {},
          {
            label: description,
            stroke: stylo,
            width: 2,
            points: { show: x.length <= 40, size: 8, stroke: surface, width: 2, fill: stylo },
          },
        ],
        axes: [
          {
            stroke: encre2,
            grid: { show: false },
            ticks: { stroke: grille, width: 1 },
            values: (_u, valeurs) => valeurs.map((v) => formatX(v)),
            font: '12px system-ui, sans-serif',
          },
          {
            stroke: encre2,
            grid: { stroke: grille, width: 1 },
            ticks: { show: false },
            size: 56,
            values: (_u, valeurs) => valeurs.map((v) => formatY(v)),
            font: '12px system-ui, sans-serif',
          },
        ],
        hooks: {
          draw: [
            (u) => {
              if (reference === undefined) return;
              const ctx = u.ctx;
              const yPx = u.valToPos(reference, 'y', true);
              ctx.save();
              ctx.strokeStyle = encre2;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(u.bbox.left, yPx);
              ctx.lineTo(u.bbox.left + u.bbox.width, yPx);
              ctx.stroke();
              ctx.restore();
            },
          ],
          setCursor: [
            (u) => {
              const i = u.cursor.idx;
              const bulle = element.querySelector<HTMLDivElement>('.bulle-graphique');
              if (!bulle) return;
              if (i === null || i === undefined) {
                bulle.hidden = true;
                return;
              }
              bulle.hidden = false;
              bulle.textContent = `${formatX(x[i])} : ${formatY(y[i])}`;
            },
          ],
        },
      };
      graphique = new uPlot(options, [x, y], element.querySelector<HTMLDivElement>('.trace-graphique') as HTMLDivElement);
    };

    construire();

    const observateur = new ResizeObserver(() => {
      graphique?.setSize({ width: Math.max(element.clientWidth, 260), height: hauteur });
    });
    observateur.observe(element);

    const theme = window.matchMedia('(prefers-color-scheme: dark)');
    theme.addEventListener('change', construire);

    return () => {
      observateur.disconnect();
      theme.removeEventListener('change', construire);
      graphique?.destroy();
    };
  }, [x, y, formatX, formatY, reference, description, hauteur]);

  if (x.length === 0) return null;

  return (
    <figure className="graphique">
      <div ref={conteneur} className="graphique-conteneur" role="img" aria-label={description}>
        <div className="bulle-graphique" hidden />
        <div className="trace-graphique" />
      </div>
      <details className="graphique-valeurs">
        <summary>Voir les valeurs</summary>
        <table>
          <tbody>
            {x.map((t, i) => (
              <tr key={t}>
                <td>{formatX(t)}</td>
                <td className="chiffre">{formatY(y[i])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
