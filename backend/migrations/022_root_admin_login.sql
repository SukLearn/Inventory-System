-- Keep applied migrations immutable; update the root administrator in a new migration.
UPDATE users
SET username = 'admin',
    password_hash = '$2a$12$Ol8agOdG2gyYyafYJqiWeeVqkAWa.NyFdRJ1/fnuUW66zuQkpJ8eO'
WHERE username = 'maiko_root'
  AND role = 'ADMIN';

-- Also enforce the requested password if the username was changed manually first.
UPDATE users
SET password_hash = '$2a$12$Ol8agOdG2gyYyafYJqiWeeVqkAWa.NyFdRJ1/fnuUW66zuQkpJ8eO'
WHERE username = 'admin'
  AND role = 'ADMIN';
