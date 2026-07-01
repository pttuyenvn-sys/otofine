import { CtaButton } from "@evcs/components/conversion/CtaButton";
import { Container } from "@evcs/components/layout/Container";
import { PageHero } from "@evcs/components/layout/PageHero";
import { Section } from "@evcs/components/layout/Section";

export function SolutionsView() {
  return (
    <>
      <PageHero
        eyebrow="Giải pháp"
        title="Giải pháp trạm sạc toàn diện"
        subtitle="Từ trạm sạc công cộng, doanh nghiệp đến bãi đỗ thông minh — thiết kế phù hợp từng quy mô đầu tư."
        variant="gradient"
        actions={<CtaButton variant="quote" size="lg" />}
      />
      <Section>
        <Container narrow>
          <div className="evcs-placeholder">
            <p className="evcs-placeholder__label">Sprint 02 — Giải pháp</p>
            <p className="evcs-body" style={{ marginTop: "0.75rem" }}>
              Nội dung giải pháp sẽ được triển khai ở sprint tiếp theo.
            </p>
          </div>
        </Container>
      </Section>
    </>
  );
}
