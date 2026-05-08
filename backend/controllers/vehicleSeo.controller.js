import { getVehicleSeoPage } from "../services/vehicleSeo.service.js";

export async function getVehicleSeoPageCtrl(req, res) {
    try {
        const slug = String(req.params.slug || "")
            .trim()
            .toLowerCase();

        const data = await getVehicleSeoPage(slug);

        if (!data) {
            return res.status(404).json({
                error: "Vehicle SEO page not found",
            });
        }

        return res.json(data);
    } catch (err) {
        console.error(err);

        return res.status(500).json({
            error: "Internal server error",
        });
    }
}