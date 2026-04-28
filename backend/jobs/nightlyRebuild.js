import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../config/db.js";
import { logError, logInfo } from "../utils/syncLogger.js";
import { runPartKnowledgeProductMatch } from "../services/partKnowledgeMatch.service.js";
import { syncKnowledge } from "../services/knowledgeService.js";
import { syncProduct } from "../services/productService.js";
import { syncCar, rebuildAllCarModelRelations } from "../services/carService.js";

const SCOPE = "nightlyRebuild";

/**
 * Full rebuild: part_knowledge_id match → products → cars → part_knowledge sync → relations.
 * Individual entity failures are logged; the job continues.
 * @returns {Promise<{
 *   knowledge: { ok: number, fail: number },
 *   products: { ok: number, fail: number },
 *   cars: { ok: number, fail: number },
 *   relations: number | null,
 *   matchError: string | null,
 * }>}
 */
export async function runNightlyRebuild() {
  const t0 = Date.now();
  logInfo(SCOPE, "nightly rebuild started");

  const knowledge = { ok: 0, fail: 0 };
  const products = { ok: 0, fail: 0 };
  const cars = { ok: 0, fail: 0 };
  let relations = null;
  /** @type {string|null} */
  let matchError = null;

  try {
    try {
      await runPartKnowledgeProductMatch();
    } catch (e) {
      matchError = String(e?.message || e);
      logError(SCOPE, "runPartKnowledgeProductMatch failed (continuing nightly job)", {
        err: matchError,
      });
    }

    const [prodRows] = await pool.query(`SELECT id FROM products ORDER BY id ASC`);
    for (const r of prodRows) {
      try {
        await syncProduct(r.id);
        products.ok++;
      } catch (e) {
        products.fail++;
        logError(SCOPE, "syncProduct failed", { productId: r.id, err: String(e?.message || e) });
      }
    }

    const [carRows] = await pool.query(`SELECT id FROM car_models ORDER BY id ASC`);
    for (const r of carRows) {
      try {
        await syncCar(r.id);
        cars.ok++;
      } catch (e) {
        cars.fail++;
        logError(SCOPE, "syncCar failed", { carModelId: r.id, err: String(e?.message || e) });
      }
    }

    const [partRows] = await pool.query(`SELECT id FROM part_knowledge ORDER BY id ASC`);
    for (const r of partRows) {
      try {
        await syncKnowledge(r.id);
        knowledge.ok++;
      } catch (e) {
        knowledge.fail++;
        logError(SCOPE, "syncKnowledge failed", { partId: r.id, err: String(e?.message || e) });
      }
    }

    try {
      relations = await rebuildAllCarModelRelations();
    } catch (e) {
      logError(SCOPE, "rebuildAllCarModelRelations failed", { err: String(e?.message || e) });
    }
  } catch (e) {
    logError(SCOPE, "nightly rebuild fatal", { err: String(e?.message || e) });
    throw e;
  }

  logInfo(SCOPE, "nightly rebuild finished", {
    ms: Date.now() - t0,
    knowledge,
    products,
    cars,
    relations,
    matchError,
  });

  return { knowledge, products, cars, relations, matchError };
}

export default runNightlyRebuild;
export { runNightlyRebuild as nightlyRebuild };

const __filename = fileURLToPath(import.meta.url);
const isMain =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  runNightlyRebuild()
    .then(() => {
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
