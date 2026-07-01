import { CtaButton } from "@evcs/components/conversion/CtaButton";
import { CalculatorModule } from "@evcs/components/domain/CalculatorModule";
import { Container } from "@evcs/components/layout/Container";
import { PageHero } from "@evcs/components/layout/PageHero";
import { Section } from "@evcs/components/layout/Section";

export function InvestmentCenterView() {
  return (
    <>
      <PageHero
        eyebrow="Trung tâm đầu tư"
        title="Trung tâm đầu tư trạm sạc"
        subtitle="Tổng hợp kiến thức, mô hình kinh doanh và công cụ hỗ trợ quyết định — tư vấn minh bạch, không áp lực mua hàng."
        variant="dark"
        actions={
          <>
            <CtaButton variant="consult" size="lg" />
            <CtaButton variant="quote" size="lg" />
          </>
        }
      />

      <Section>
        <Container narrow>
          <div className="evcs-investment-intro">
            <h2 className="evcs-heading-3">Mô hình &amp; lộ trình</h2>
            <p className="evcs-body-lg">
              Phân tích phân khúc đầu tư, chi phí triển khai và dòng tiền dự kiến.
              Nội dung chi tiết sẽ được bổ sung ở Sprint 02.
            </p>
          </div>
        </Container>
      </Section>

      <Section muted>
        <Container narrow>
          <CalculatorModule />
        </Container>
      </Section>

      <Section>
        <Container narrow>
          <div className="evcs-placeholder">
            <p className="evcs-placeholder__label">Sprint 02 — Nội dung đầu tư</p>
            <p className="evcs-body" style={{ marginTop: "0.75rem" }}>
              Bài viết, biểu đồ và FAQ đầu tư sẽ được triển khai ở sprint tiếp theo.
            </p>
          </div>
        </Container>
      </Section>
    </>
  );
}
