// DataStore: single access point for the normalized dataset plus common indexes.
// In demo mode this wraps the deterministic generator; the SQLite adapter (Tauri build)
// implements the same shape by hydrating from the local database.

import { generateDataset, type Dataset } from "./demo";
import type { Product, Sku } from "@/domain/types";

export interface Store extends Dataset {
  productById: Map<string, Product>;
  skuById: Map<string, Sku>;
  skusByProduct: Map<string, Sku[]>;
}

let _store: Store | null = null;

export function getStore(): Store {
  if (_store) return _store;
  const t0 = performance.now();
  const ds = generateDataset();
  const productById = new Map(ds.products.map((p) => [p.id, p]));
  const skuById = new Map(ds.skus.map((s) => [s.id, s]));
  const skusByProduct = new Map<string, Sku[]>();
  for (const s of ds.skus) {
    if (!skusByProduct.has(s.productId)) skusByProduct.set(s.productId, []);
    skusByProduct.get(s.productId)!.push(s);
  }
  _store = { ...ds, productById, skuById, skusByProduct };
  // eslint-disable-next-line no-console
  console.info(
    `[meridian] demo dataset: ${ds.orders.length.toLocaleString()} orders, ${ds.customers.length.toLocaleString()} customers, ` +
    `${ds.ledger.length.toLocaleString()} journal entries in ${(performance.now() - t0).toFixed(0)}ms`,
  );
  return _store;
}
