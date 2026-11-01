/**
 * PricingService — the single source of truth for deriving a sales line price.
 *
 * Resolution order for the applicable price list (per customer):
 *   1. customer.priceListId            (direct assignment — highest priority)
 *   2. a sales list whose appliesToTier === customer.customerTier
 *   3. the company's default sales list (is_default = true)
 * Then, within that list, the quantity-break tier with the greatest minQty ≤ qty
 * (active + inside its validity window). If nothing resolves, fall back to the
 * item's own list price (sellingPricePaise) → standard cost → 0 (manual entry).
 *
 * The result feeds both the /sales/price-preview endpoint (UI) and the
 * quotation/SO create handlers (server-side "both" authority — see sales.ts).
 * All methods are read-only; safe to call outside a transaction.
 */

import { and, eq, lte, or, isNull, desc, sql } from 'drizzle-orm';
import {
  db,
  priceLists, priceListItems,
  items, customers, stockBalances,
} from '@erp/db';

export type PriceSource =
  | 'price_list'        // matched a price_list_items tier (via any list-resolution path)
  | 'item_list_price'   // item.sellingPricePaise
  | 'standard_cost'     // item.standardCostPaise
  | 'manual';           // nothing resolved — caller must supply a rate

export interface ResolvedPrice {
  unitPricePaise: number;
  discountPercent: number;
  netUnitPricePaise: number;
  source: PriceSource;
  priceListId: string | null;
  minSellingPricePaise: number;
  costPaise: number;
  marginPercent: number;
}

export class PricingService {
  async resolveLine(
    companyId: string,
    itemId: string,
    opts: { customerId?: string | null; qty: number; asOf?: string },
  ): Promise<ResolvedPrice> {
    const qty = opts.qty > 0 ? opts.qty : 1;
    const asOf = opts.asOf ?? new Date().toISOString().slice(0, 10);

    const [item] = await db
      .select({
        sellingPricePaise: items.sellingPricePaise,
        minSellingPricePaise: items.minSellingPricePaise,
        purchaseRatePaise: items.purchaseRatePaise,
        standardCostPaise: items.standardCostPaise,
      })
      .from(items)
      .where(and(eq(items.companyId, companyId), eq(items.id, itemId)))
      .limit(1);
    if (!item) throw new Error(`Item not found: ${itemId}`);

    // Customer context (price list assignment + default discount)
    let customerListId: string | null = null;
    let customerTier: string | null = null;
    let customerDefaultDiscount = 0;
    if (opts.customerId) {
      const [c] = await db
        .select({
          priceListId: customers.priceListId,
          customerTier: customers.customerTier,
          defaultDiscountPercent: customers.defaultDiscountPercent,
        })
        .from(customers)
        .where(and(eq(customers.companyId, companyId), eq(customers.id, opts.customerId)))
        .limit(1);
      if (c) {
        customerListId = c.priceListId ?? null;
        customerTier = c.customerTier ?? null;
        customerDefaultDiscount = parseFloat(c.defaultDiscountPercent ?? '0');
      }
    }

    // Resolve the applicable list id (direct → tier-tagged → default)
    const listId = customerListId
      ?? (customerTier ? await this.findTierList(companyId, customerTier) : null)
      ?? await this.findDefaultList(companyId);

    // Best qty tier within that list
    let unitPricePaise = 0;
    let discountPercent = customerDefaultDiscount;
    let source: PriceSource = 'manual';
    let resolvedListId: string | null = null;

    if (listId) {
      const [tier] = await db
        .select({ unitPricePaise: priceListItems.unitPricePaise, discountPercent: priceListItems.discountPercent })
        .from(priceListItems)
        .where(and(
          eq(priceListItems.companyId, companyId),
          eq(priceListItems.priceListId, listId),
          eq(priceListItems.itemId, itemId),
          eq(priceListItems.isActive, true),
          lte(sql`${priceListItems.minQty}::numeric`, sql`${qty}::numeric`),
          or(isNull(priceListItems.validFrom), lte(priceListItems.validFrom, asOf)),
          or(isNull(priceListItems.validTo), sql`${priceListItems.validTo} >= ${asOf}`),
        ))
        .orderBy(desc(sql`${priceListItems.minQty}::numeric`))
        .limit(1);
      if (tier) {
        unitPricePaise = tier.unitPricePaise;
        discountPercent = parseFloat(tier.discountPercent ?? '0'); // list tier defines its own discount
        source = 'price_list';
        resolvedListId = listId;
      }
    }

    // Fallbacks when no list tier matched
    if (source === 'manual') {
      if (item.sellingPricePaise > 0) {
        unitPricePaise = item.sellingPricePaise;
        source = 'item_list_price';
      } else if (item.standardCostPaise > 0) {
        unitPricePaise = item.standardCostPaise;
        source = 'standard_cost';
      }
    }

    // Cost basis for margin: WAC across warehouses → last purchase → standard cost
    const costPaise = await this.resolveCost(companyId, itemId, item.purchaseRatePaise, item.standardCostPaise);

    const netUnitPricePaise = Math.round(unitPricePaise * (1 - discountPercent / 100));
    const marginPercent = netUnitPricePaise > 0
      ? Number((((netUnitPricePaise - costPaise) / netUnitPricePaise) * 100).toFixed(2))
      : 0;

    return {
      unitPricePaise,
      discountPercent,
      netUnitPricePaise,
      source,
      priceListId: resolvedListId,
      minSellingPricePaise: item.minSellingPricePaise,
      costPaise,
      marginPercent,
    };
  }

  private async findTierList(companyId: string, tier: string): Promise<string | null> {
    const [row] = await db
      .select({ id: priceLists.id })
      .from(priceLists)
      .where(and(
        eq(priceLists.companyId, companyId),
        eq(priceLists.kind, 'sales'),
        eq(priceLists.isActive, true),
        eq(priceLists.appliesToTier, tier),
      ))
      .limit(1);
    return row?.id ?? null;
  }

  private async findDefaultList(companyId: string): Promise<string | null> {
    const [row] = await db
      .select({ id: priceLists.id })
      .from(priceLists)
      .where(and(
        eq(priceLists.companyId, companyId),
        eq(priceLists.kind, 'sales'),
        eq(priceLists.isActive, true),
        eq(priceLists.isDefault, true),
      ))
      .limit(1);
    return row?.id ?? null;
  }

  private async resolveCost(
    companyId: string,
    itemId: string,
    purchaseRatePaise: number,
    standardCostPaise: number,
  ): Promise<number> {
    const [wac] = await db
      .select({
        totalValue: sql<number>`COALESCE(SUM(${stockBalances.valuationAmountPaise}), 0)`,
        totalQty: sql<number>`COALESCE(SUM(${stockBalances.quantityOnHand}::numeric), 0)`,
      })
      .from(stockBalances)
      .where(and(eq(stockBalances.companyId, companyId), eq(stockBalances.itemId, itemId)));

    const totalQty = Number(wac?.totalQty ?? 0);
    const totalValue = Number(wac?.totalValue ?? 0);
    if (totalQty > 0 && totalValue > 0) return Math.round(totalValue / totalQty);
    if (purchaseRatePaise > 0) return purchaseRatePaise;
    return standardCostPaise;
  }
}
