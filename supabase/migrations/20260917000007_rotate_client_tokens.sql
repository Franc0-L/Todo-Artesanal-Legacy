-- Todo-Artesanal
-- 20260917000007_rotate_client_tokens.sql

create or replace function public.rotate_client_token(
  p_cliente_id uuid
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_token text;
begin
  if not private.es_admin() then
    raise exception 'No autorizado';
  end if;

  v_token := encode(extensions.gen_random_bytes(16), 'hex');

  update public.clientes
  set token = v_token
  where id = p_cliente_id;

  if not found then
    raise exception 'Cliente invalido';
  end if;

  return v_token;
end;
$$;

revoke execute on function public.rotate_client_token(uuid)
from public, anon;
grant execute on function public.rotate_client_token(uuid)
to authenticated;
