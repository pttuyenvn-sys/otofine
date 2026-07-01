import { HERO_KPI_ITEMS } from "@evcs/constants/homeContent";

export function KpiBand() {
  return (
    <div className="evcs-kpi-band" id="kpi" aria-label="Chỉ số minh họa">
      <ul className="evcs-kpi-band__grid">
        {HERO_KPI_ITEMS.map((item) => (
          <li key={item.id} className="evcs-kpi-band__item">
            <span className="evcs-kpi-band__value">{item.value}</span>
            <span className="evcs-kpi-band__label">{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
