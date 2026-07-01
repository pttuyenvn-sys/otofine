import { CtaButton } from "@evcs/components/conversion/CtaButton";
import { Container } from "@evcs/components/layout/Container";
import { PageHero } from "@evcs/components/layout/PageHero";
import { Section } from "@evcs/components/layout/Section";

export function AcademyView() {
  return (
    <>
      <PageHero
        eyebrow="Học viện EV"
        title="Kiến thức đầu tư trạm sạc"
        subtitle="Học hỏi từ chuyên gia — từ cơ bản đến chiến lược vận hành trạm sạc hiệu quả."
        variant="gradient"
        actions={<CtaButton variant="consult" size="lg" />}
      />
      <Section>
        <Container narrow>
          <div className="evcs-placeholder">
            <p className="evcs-placeholder__label">Sprint 02 — Học viện EV</p>
            <p className="evcs-body" style={{ marginTop: "0.75rem" }}>
              Bài viết và khóa học sẽ được triển khai ở sprint tiếp theo.
            </p>
          </div>
        </Container>
      </Section>
    </>
  );
}
