import { useEffect, useRef, useState } from 'react';
import './_group.css';
import './Connected.css';

const offeringNames = [
  'Buyside advisory',
  'Market mapping',
  'Expert sourcing',
  'Agentic sales',
  'Sourcing software',
];

export function Connected() {
  const gridRef = useRef<HTMLUListElement>(null);
  const timersRef = useRef<number[]>([]);
  const [visible, setVisible] = useState<boolean[]>([]);
  const [motionReady, setMotionReady] = useState(false);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const items = Array.from(grid.querySelectorAll<HTMLElement>('[data-reveal]'));
    const reveal = (index: number) => {
      setVisible((current) => {
        if (current[index]) return current;
        const next = [...current];
        next[index] = true;
        return next;
      });
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !('IntersectionObserver' in window)) {
      return;
    }

    let observer: IntersectionObserver | undefined;
    try {
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const index = Number((entry.target as HTMLElement).dataset.reveal);
          timersRef.current.push(window.setTimeout(() => reveal(index), index * 85));
          observer?.unobserve(entry.target);
        });
      }, { threshold: 0.16, rootMargin: '0px 0px -5% 0px' });

      items.forEach((item) => observer?.observe(item));
      setMotionReady(true);
    } catch {
      observer?.disconnect();
      return;
    }
    return () => {
      observer?.disconnect();
      timersRef.current.forEach(window.clearTimeout);
      timersRef.current = [];
    };
  }, []);

  const replay = () => {
    timersRef.current.forEach(window.clearTimeout);
    timersRef.current = [];
    if (!motionReady || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(items => items.map(() => true));
      return;
    }
    setVisible([]);

    for (let index = 0; index < 6; index += 1) {
      timersRef.current.push(window.setTimeout(() => {
        setVisible((current) => {
          const next = [...current];
          next[index] = true;
          return next;
        });
      }, 120 + index * 125));
    }
  };

  return (
    <section className="hadley-connected" aria-labelledby="hadley-connected-title">
      <div className="hadley-connected__inner">
        <div className="hadley-connected__tools">
          <button className="hadley-connected__replay" type="button" onClick={replay}>
            Replay animation
          </button>
        </div>
        <ul className={`hadley-connected__grid ${motionReady ? 'motion-ready' : ''}`} ref={gridRef}>
          <li className={`hadley-connected__cell hadley-connected__title-cell ${visible[0] ? 'is-revealed' : ''}`} data-reveal="0">
            <h2 id="hadley-connected-title">Product offerings</h2>
          </li>
          {offeringNames.map((name, index) => (
            <li
              className={`hadley-connected__cell ${visible[index + 1] ? 'is-revealed' : ''}`}
              data-reveal={index + 1}
              key={name}
            >
              <h3>{name}</h3>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
