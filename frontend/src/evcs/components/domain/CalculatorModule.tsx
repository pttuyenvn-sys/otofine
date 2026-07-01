import { Card, Text } from "@evcs/components/primitives";

/**
 * Máy tính ROI — module con trong Trung tâm đầu tư.
 * Sprint 04 sẽ triển khai logic; Sprint 01 chỉ placeholder UI.
 */
export function CalculatorModule() {
  return (
    <section className="evcs-calculator-module" aria-labelledby="calc-title">
      <Card glass className="evcs-calculator-module__card">
        <p className="evcs-eyebrow">Công cụ</p>
        <h2 id="calc-title" className="evcs-heading-3">
          Máy tính đầu tư
        </h2>
        <Text variant="body-lg">
          Ước tính chi phí đầu tư, doanh thu và thời gian hoàn vốn — module tích
          hợp trong Trung tâm đầu tư.
        </Text>
        <div className="evcs-calculator-module__placeholder">
          <div className="evcs-calculator-module__field">
            <span className="evcs-caption">Quy mô trạm (kW)</span>
            <div className="evcs-calculator-module__input-mock">—</div>
          </div>
          <div className="evcs-calculator-module__field">
            <span className="evcs-caption">Tỷ lệ sử dụng (%)</span>
            <div className="evcs-calculator-module__input-mock">—</div>
          </div>
          <div className="evcs-calculator-module__field">
            <span className="evcs-caption">Thời gian hoàn vốn dự kiến</span>
            <div className="evcs-calculator-module__result">Sprint 04</div>
          </div>
        </div>
      </Card>
    </section>
  );
}
