"use client";

import { useRouter } from "next/navigation";
import ProductForm from "@/components/admin/ProductForm";
import { useToast } from "@/components/admin/Toast";
import type { AdminCategory, AdminProduct } from "@/lib/adminTypes";

export default function EditProduct({ product, categories }: { product: AdminProduct; categories: AdminCategory[] }) {
  const router = useRouter();
  const toast = useToast();
  return (
    <ProductForm
      product={product}
      categories={categories}
      onCancel={() => router.push("/admin")}
      onSaved={(r) => {
        toast(`“${r.name}” saved`);
        router.push("/admin");
        router.refresh();
      }}
    />
  );
}
