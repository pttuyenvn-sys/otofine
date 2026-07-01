import type { CaseStudy } from "@evcs/constants/projects";
import { Badge, Card } from "@evcs/components/primitives";

interface CaseStudyCardProps {
  study: CaseStudy;
}

/**
 * Case Study layout — không phải gallery ảnh.
 * Cấu trúc: thách thức → giải pháp → kết quả → số liệu.
 */
export function CaseStudyCard({ study }: CaseStudyCardProps) {
  return (
    <article className="evcs-case-study">
      <header className="evcs-case-study__header">
        <div className="evcs-case-study__meta">
          <Badge variant="accent">{study.year}</Badge>
          <span className="evcs-caption">
            {study.client} · {study.location}
          </span>
        </div>
        <h2 className="evcs-heading-3">{study.title}</h2>
      </header>

      <div className="evcs-case-study__grid">
        <Card glass className="evcs-case-study__block">
          <h3 className="evcs-case-study__label">Thách thức</h3>
          <p className="evcs-body">{study.challenge}</p>
        </Card>
        <Card glass className="evcs-case-study__block">
          <h3 className="evcs-case-study__label">Giải pháp</h3>
          <p className="evcs-body">{study.solution}</p>
        </Card>
      </div>

      <Card className="evcs-case-study__results">
        <h3 className="evcs-case-study__label">Kết quả</h3>
        <ul className="evcs-case-study__list">
          {study.results.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Card>

      <dl className="evcs-case-study__metrics">
        {study.metrics.map((m) => (
          <div key={m.label} className="evcs-case-study__metric">
            <dt className="evcs-caption">{m.label}</dt>
            <dd className="evcs-case-study__metric-value">{m.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
