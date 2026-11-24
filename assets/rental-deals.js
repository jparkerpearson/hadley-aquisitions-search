// Recent equipment rental transactions shown on equipment-rental.html.
// To update the feed, add an entry here. The six most recent by date are shown.
const RENTAL_DEALS = [
  {
    date: "2026-10-01",
    acquirer: "MH Equipment",
    target: "Bohl Equipment",
    geography: "Fort Wayne, IN · Toledo and Marion, OH",
    category: "Forklifts and material handling",
    summary: "Adds three locations from a family-owned Hyster-Yale dealer founded in 1924, taking MH Equipment past 30 Midwest locations.",
    source: "The Machine Maker",
    url: "https://themachinemaker.com/news/mh-equipment-combines-operations-with-bohl-equipment-to-expand-midwest-service-network/",
  },
  {
    date: "2026-06-02",
    acquirer: "Elite Equipment Rentals",
    target: "ISG Inc. and ISG Rents",
    geography: "Virginia, Maryland, North Carolina, South Carolina",
    category: "General equipment rental",
    summary: "Expands Elite into the Mid-Atlantic and Southeast, adding ISG's locations and customer base.",
    source: "Business Wire",
    url: "https://www.businesswire.com/news/home/20260602160867/en/Elite-Equipment-Rentals-Expands-into-the-Mid-Atlantic-and-Southeast-with-Acquisition-of-ISG",
  },
  {
    date: "2026-05-16",
    acquirer: "Northside Tool Rental",
    target: "Able 2 Rent All and Patrick's Rentals & Sales",
    geography: "Fayetteville and McDonough, GA",
    category: "General and tool rental",
    summary: "Two family-owned Atlanta-area rental companies join Northside, bringing it to six metro Atlanta locations.",
    source: "Rental Equipment Register",
    url: "https://www.rermag.com/mergers-acquisitions/article/55379163/northside-tool-rental-acquires-two-atlanta-companies-expanding-to-six-locations",
  },
  {
    date: "2026-04-20",
    acquirer: "Centurion Group",
    target: "Trand Inc.",
    geography: "Sawyer, KS",
    category: "Crane and lifting",
    summary: "Adds a founder-owned crane rental company to expand Centurion's U.S. heavy-lift and onshore wind capabilities.",
    source: "Equipment Finance News",
    url: "https://equipmentfinancenews.com/news/rentals/centurion-group-acquires-crane-rental-company-trand/",
  },
  {
    date: "2026-04-07",
    acquirer: "Allied Industrial Partners",
    target: "Trinity Industrial",
    verb: "took a majority stake in",
    geography: "Broussard, LA · Gulf Coast",
    category: "General and specialty industrial rental",
    summary: "Majority investment in a founder-led rental platform serving utility, energy and industrial customers, to fund organic growth and add-on acquisitions.",
    source: "Rental Equipment Register",
    url: "https://www.rermag.com/mergers-acquisitions/news/55377644/allied-industrial-partners-makes-majority-investment-in-trinity-industrial-a-gulf-coast-rental-company",
  },
];

(() => {
  const list = document.querySelector("[data-rental-deals]");
  if (!list) return;

  const formatDate = (iso) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  const deals = [...RENTAL_DEALS].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  list.replaceChildren(...deals.map((deal) => {
    const item = el("li", "deal");
    const when = el("time", "deal-date", formatDate(deal.date));
    when.dateTime = deal.date;

    const parties = el("div", "deal-parties");
    parties.append(el("p", "deal-acquirer", deal.acquirer), el("p", "deal-target", `${deal.verb || "acquired"} ${deal.target}`));

    const meta = el("div", "deal-meta");
    meta.append(el("span", "deal-category", deal.category), el("span", "deal-geo", deal.geography));

    const body = el("div", "deal-body");
    const source = el("a", "deal-source", deal.source);
    source.href = deal.url;
    source.target = "_blank";
    source.rel = "noopener";
    body.append(el("p", "deal-summary", deal.summary), source);

    item.append(when, parties, meta, body);
    return item;
  }));
  list.hidden = false;
})();
