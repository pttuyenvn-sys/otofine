import { CtaShowcase } from "@evcs/components/conversion/CtaShowcase";
import { Container } from "@evcs/components/layout/Container";
import { PageHero } from "@evcs/components/layout/PageHero";
import { Section } from "@evcs/components/layout/Section";
import { SITE } from "@evcs/constants/site";

export function ContactView() {
  return (
    <>
      <PageHero
        eyebrow="Liên hệ"
        title="Kết nối với chúng tôi"
        subtitle="Đội ngũ tư vấn sẵn sàng hỗ trợ — qua Zalo hoặc hotline, không cần đăng ký tài khoản."
        variant="gradient"
        align="center"
      />
      <Section>
        <Container narrow>
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <p className="evcs-body">
              Email:{" "}
              <a href={`mailto:${SITE.email}`} style={{ color: "var(--evcs-color-primary)" }}>
                {SITE.email}
              </a>
            </p>
          </div>
          <CtaShowcase />
          <div className="evcs-placeholder" style={{ marginTop: "2rem" }}>
            <p className="evcs-placeholder__label">Sprint 03 — Contact form</p>
            <p className="evcs-body" style={{ marginTop: "0.75rem" }}>
              Form liên hệ sẽ được triển khai ở sprint tiếp theo.
            </p>
          </div>
        </Container>
      </Section>
    </>
  );
}
