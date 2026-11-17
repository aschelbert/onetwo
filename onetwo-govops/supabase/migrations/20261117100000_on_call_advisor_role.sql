-- On Call Advisor: the role an Admin Console user holds in a building that
-- has the On Call add-on. It is tied to the add-on the way Property Manager
-- is tied to the Property Manager Seat, and starts with the Property
-- Manager's access to every registry entry.

insert into public.user_roles (id, name, description, icon, sort_order)
values ('ON_CALL_ADVISOR', 'On Call Advisor',
        'A ONE two advisor assigned to a building with the On Call add-on', '🎧', 5)
on conflict (id) do nothing;

insert into public.plan_role_availability (plan_id, role_id)
values ('on-call', 'ON_CALL_ADVISOR')
on conflict do nothing;

insert into public.role_permissions (atom_type, atom_id, role_id, access_level)
select atom_type, atom_id, 'ON_CALL_ADVISOR', access_level
from public.role_permissions
where role_id = 'PROPERTY_MANAGER'
on conflict (atom_type, atom_id, role_id) do nothing;
