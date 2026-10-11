import { useEffect, useRef } from "react";
import "./_group.css";
import "./Current.css";

const offerings = [
  "Buyside advisory",
  "Market mapping",
  "Expert sourcing",
  "Agentic sales",
  "Sourcing software",
];

export function Current() {
  const bookRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = bookRef.current;
    if (!section) return;

    const pages = Array.from(section.querySelectorAll<HTMLElement>(".product-book-page"));
    const revealAllPages = () => pages.forEach((page) => page.classList.add("is-revealed"));

    if (
      !("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      revealAllPages();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -10% 0px" },
    );

    pages.forEach((page) => observer.observe(page));
    return () => observer.disconnect();
  }, []);

  return (
    <section
      className="product-offerings product-book"
      id="product-offerings"
      aria-labelledby="product-offerings-title"
      ref={bookRef}
    >
      <h2 id="product-offerings-title">Product offerings</h2>
      <ol className="product-book-pages" aria-label="Hadley AI product offerings">
        {offerings.map((offering, index) => (
          <li className="product-book-page" key={offering}>
            <article className="product-book-sheet">
              <span className="product-book-number" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3>{offering}</h3>
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}
