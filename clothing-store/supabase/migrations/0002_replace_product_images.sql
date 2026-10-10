-- Replace a product's photo list in one transaction (used by the admin app).
-- Returns the storage paths that are no longer used, so the app can delete those files.
create or replace function public.replace_product_images(p_product_id uuid, p_images jsonb)
returns setof text
language plpgsql
security invoker -- runs as the caller, so the RLS policies still apply
set search_path = public
as $$
declare
  removed text[];
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select coalesce(array_agg(storage_path), '{}') into removed
  from public.product_images
  where product_id = p_product_id
    and storage_path is not null
    and storage_path not in (
      select x ->> 'storage_path' from jsonb_array_elements(p_images) x where x ->> 'storage_path' is not null
    );

  delete from public.product_images where product_id = p_product_id;

  insert into public.product_images (product_id, storage_path, url, width, height, sort_order)
  select p_product_id, x ->> 'storage_path', x ->> 'url', (x ->> 'width')::int, (x ->> 'height')::int, (ord - 1)::int
  from jsonb_array_elements(p_images) with ordinality as t (x, ord);

  return query select unnest(removed);
end;
$$;

revoke all on function public.replace_product_images(uuid, jsonb) from public, anon;
grant execute on function public.replace_product_images(uuid, jsonb) to authenticated;
