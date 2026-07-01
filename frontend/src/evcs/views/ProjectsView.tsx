import { CtaButton } from "@evcs/components/conversion/CtaButton";
import { CaseStudyCard } from "@evcs/components/domain/CaseStudyCard";
import { MOCK_CASE_STUDIES } from "@evcs/constants/projects";
import { Container } from "@evcs/components/layout/Container";
import { PageHero } from "@evcs/components/layout/PageHero";
import { Section } from "@evcs/components/layout/Section";

export function ProjectsView() {
  return (
    <>
      <PageHero
        eyebrow="Dự án"
        title="Case study triển khai thực tế"
        subtitle="Mỗi dự án được trình bày theo cấu trúc case study — thách thức, giải pháp, kết quả và số liệu. Không phải gallery ảnh."
        variant="gradient"
        actions={<CtaButton variant="survey" size="lg" />}
      />
      <Section>
        <Container>
          <div className="evcs-case-study-list">
            {MOCK_CASE_STUDIES.map((study) => (
              <CaseStudyCard key={study.id} study={study} />
            ))}
          </div>
        </Container>
      </Section>
    </>
  );
}
