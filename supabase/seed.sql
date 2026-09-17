-- Semilla para desarrollo local (Supabase local).
-- Solo se aplica en local. NUNCA en producción.
--
-- Crea un usuario demo y algo de progreso para poder ver el dashboard con
-- datos reales al arrancar sin registrarse. Contraseña: "panduro-demo".

do $$
declare
  v_id uuid := '11111111-1111-1111-1111-111111111111';
begin
  -- Idempotente: solo insertamos si no existe todavía.
  if not exists (select 1 from auth.users where id = v_id) then
    insert into auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_user_meta_data,
      raw_app_meta_data,
      created_at,
      updated_at
    ) values (
      v_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'demo@panduro.local',
      crypt('panduro-demo', gen_salt('bf')),
      now(),
      jsonb_build_object('display_name', 'Demo'),
      jsonb_build_object('provider', 'email', 'providers', array['email']::text[]),
      now(),
      now()
    );
  end if;

  -- El trigger handle_new_user habrá creado la fila en profiles.
  update public.profiles
    set display_name = 'Demo',
        xp_total = 30,
        hearts = 4,
        streak_days = 2,
        streak_last_day = current_date - 1
    where id = v_id;

  insert into public.progress (user_id, lesson_id, status, best_score, attempts, completed_at)
  values (v_id, 'a1.u1.l1', 'completed', 80, 1, now())
  on conflict (user_id, lesson_id) do nothing;

  insert into public.events (user_id, kind, payload)
  values (v_id, 'lesson_completed', jsonb_build_object(
    'lesson_id', 'a1.u1.l1',
    'correct', 4,
    'total', 5,
    'hearts_used', 1,
    'xp_awarded', 40,
    'perfected', false
  ));
end$$;
