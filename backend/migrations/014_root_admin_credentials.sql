-- Apply the final root administrator credentials to existing installations.
-- Fresh installations already receive the same values from 001_init.sql.
UPDATE users
SET username = 'maiko_root',
    password_hash = '$2a$12$X8JwEHws3Y.0dDZlstWKueQSKNpHBr2Z9SfTNVolP3ly6QvaQsXpS'
WHERE username = 'admin';
