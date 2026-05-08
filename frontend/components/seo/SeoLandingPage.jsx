import Link from "next/link";

export default function SeoLandingPage({ data }) {
    const {
        parsed,
        seoContent,
        products,
        faults,
        maintenance,
        relatedCars,
        specs,
    } = data;

    return (
        <div className="container mx-auto px-4 py-6">
            <nav className="text-sm mb-4">
                <Link href="/">Trang chủ</Link>
                {" / "}
                <span>
                    {seoContent?.custom_h1 ||
                        `${parsed.brand} ${parsed.model}`}
                </span>
            </nav>

            <h1 className="text-3xl font-bold mb-4">
                {seoContent?.custom_h1 ||
                    `${parsed.brand} ${parsed.model}`}
            </h1>

            {seoContent?.custom_intro ? (
                <div
                    className="prose max-w-none mb-8"
                    dangerouslySetInnerHTML={{
                        __html: seoContent.custom_intro,
                    }}
                />
            ) : null}

            <section className="mb-10">
                <h2 className="text-2xl font-bold mb-4">
                    Thông số kỹ thuật
                </h2>

                <div className="border rounded-lg p-4">
                    <div>
                        Động cơ: {specs?.engine_cc || "-"} cc
                    </div>

                    <div>
                        Công suất: {specs?.horsepower || "-"}
                    </div>

                    <div>
                        Mô-men xoắn: {specs?.torque || "-"}
                    </div>
                </div>
            </section>

            <section className="mb-10">
                <h2 className="text-2xl font-bold mb-4">
                    Lỗi thường gặp
                </h2>

                <div className="space-y-4">
                    {faults.map((f) => (
                        <div
                            key={f.id}
                            className="border rounded-lg p-4"
                        >
                            <h3 className="font-bold">
                                {f.title}
                            </h3>

                            <div>{f.symptom}</div>

                            <div className="text-sm text-gray-500">
                                {f.cause_text}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="mb-10">
                <h2 className="text-2xl font-bold mb-4">
                    Bảo dưỡng định kỳ
                </h2>

                <div className="space-y-4">
                    {maintenance.map((m) => (
                        <div
                            key={m.id}
                            className="border rounded-lg p-4"
                        >
                            <div className="font-bold">
                                {m.item_name}
                            </div>

                            <div>
                                {m.every_km?.toLocaleString()} km
                            </div>

                            <div>
                                {m.every_month} tháng
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="mb-10">
                <h2 className="text-2xl font-bold mb-4">
                    Phụ tùng phù hợp
                </h2>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {products.map((p) => (
                        <div
                            key={p.id}
                            className="border rounded-lg p-4"
                        >
                            <div className="font-bold">
                                {p.partName}
                            </div>

                            <div>
                                {Number(p.price).toLocaleString()}đ
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section>
                <h2 className="text-2xl font-bold mb-4">
                    Dòng xe liên quan
                </h2>

                <div className="flex flex-wrap gap-2">
                    {relatedCars.map((c) => (
                        <Link
                            key={c.id}
                            href={`/${c.slug}`}
                            className="border rounded-full px-4 py-2"
                        >
                            {c.hang_xe} {c.ten_xe}
                        </Link>
                    ))}
                </div>
            </section>
        </div>
    );
}