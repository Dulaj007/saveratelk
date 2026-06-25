/*
 * 0001_add_lending_product_types.sql
 *
 * Extends rates.product_type to cover lending products beyond deposits:
 * housing loans, personal loans, leasing/vehicle loans, education loans,
 * pawning/gold loans, and overdrafts. Credit cards already had a slot
 * ('card') from the original schema.
 *
 * Run once against any database created before this migration was added
 * (schema.sql's CREATE TABLE IF NOT EXISTS does not retroactively alter an
 * existing table's CHECK constraint). Safe to re-run: DROP CONSTRAINT IF
 * EXISTS makes it idempotent.
 */

ALTER TABLE rates DROP CONSTRAINT IF EXISTS rates_product_type_check;

ALTER TABLE rates ADD CONSTRAINT rates_product_type_check
    CHECK (product_type IN (
        'fd', 'savings', 'card', 'profit',
        'housing_loan', 'personal_loan', 'leasing',
        'education_loan', 'pawning', 'overdraft'
    ));
