import { siteConfig } from "@/lib/siteConfig";

const priceFormatter = new Intl.NumberFormat(siteConfig.currency.locale, {
  style: "currency",
  currency: siteConfig.currency.code,
  maximumFractionDigits: 0,
});

export const formatPrice = (amount: number) => priceFormatter.format(amount);

export const discountPercent = (price: number, sale: number) => Math.round(((price - sale) / price) * 100);
