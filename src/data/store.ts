// DataStore: single access point for the normalized dataset plus common indexes.
// In demo mode this wraps the deterministic generator; the SQLite adapter (Tauri build)
// implements the same shape by hydrating from the local database.

import { generateDataset, type Dataset } from "./demo";
import type { Product, Sku } from "@/domain/types";
import { buildRealStore } from "./realStore";

export interface Store extends Dataset {
  productById: Map<string, Product>;
  skuById: Map<string, Sku>;
  skusByProduct: Map<string, Sku[]>;
}

/** Which dataset the app is reading. */
export type DataSourceId = "demo" | "waterborn";

export interface DataSourceInfo {
  id: DataSourceId;
  label: string;
  sublabel: string;
  /** True when the numbers describe a real business rather than a simulation. */
  real: boolean;
}

export const DATA_SOURCES: DataSourceInfo[] = [
  { id: "waterborn", label: "WaterBorn Workshop", sublabel: "your Shopify store · real data", real: true },
  { id: "demo", label: "Demo dataset", sublabel: "simulated brand · fully populated", real: false },
];

const LS_KEY = "meridian.dataSource";

export function getDataSourceId(): DataSourceId {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v === "demo" || v === "waterborn") return v;
  } catch { /* private mode */ }
  return "waterborn";
}

export function setDataSourceId(id: DataSourceId): void {
  try { localStorage.setItem(LS_KEY, id); } catch { /* private mode */ }
}

const _cache = new Map<DataSourceId, Store>();

export function getStore(source: DataSourceId = getDataSourceId()): Store {
  const hit = _cache.get(source);
  if (hit) return hit;
  const t0 = performance.now();
  if (source === "waterborn") {
    const built = buildRealStore();
    _cache.set(source, built);
    // eslint-disable-next-line no-console
    console.info(
      `[meridian] WaterBorn Workshop: ${built.orders.length.toLocaleString()} orders, ` +
      `${built.products.length} products, ${built.ledger.length.toLocaleString()} journal entries ` +
      `in ${(performance.now() - t0).toFixed(0)}ms`,
    );
    return built;
  }
  const ds = generateDataset();
  const productById = new Map(ds.products.map((p) => [p.id, p]));
  const skuById = new Map(ds.skus.map((s) => [s.id, s]));
  const skusByProduct = new Map<string, Sku[]>();
  for (const s of ds.skus) {
    if (!skusByProduct.has(s.productId)) skusByProduct.set(s.productId, []);
    skusByProduct.get(s.productId)!.push(s);
  }
  const built: Store = { ...ds, productById, skuById, skusByProduct };
  _cache.set(source, built);
  // eslint-disable-next-line no-console
  console.info(
    `[meridian] demo dataset: ${ds.orders.length.toLocaleString()} orders, ${ds.customers.length.toLocaleString()} customers, ` +
    `${ds.ledger.length.toLocaleString()} journal entries in ${(performance.now() - t0).toFixed(0)}ms`,
  );
  return built;
}
