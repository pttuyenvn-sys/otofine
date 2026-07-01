import { Container } from "@evcs/components/layout/Container";
import { PageHero } from "@evcs/components/layout/PageHero";
import { Section } from "@evcs/components/layout/Section";

export function StationMapView() {
  return (
    <>
      <PageHero
        eyebrow="Bản đồ"
        title="Bản đồ trạm sạc"
        subtitle="Khám phá mạng lưới trạm sạc — vị trí, công suất và trạng thái hoạt động."
        variant="gradient"
      />
      <Section>
        <Container narrow>
          <div className="evcs-placeholder">
            <p className="evcs-placeholder__label">Sprint 04 — Bản đồ trạm sạc</p>
            <p className="evcs-body" style={{ marginTop: "0.75rem" }}>
              Bản đồ tương tác sẽ được triển khai ở sprint riêng.
            </p>
          </div>
        </Container>
      </Section>
    </>
  );
}
