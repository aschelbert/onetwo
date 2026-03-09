-- Add 'staff' to the tenant_role enum for building staff (concierge, maintenance, building managers)
ALTER TYPE tenant_role ADD VALUE IF NOT EXISTS 'staff';

-- Seed default RBAC permissions for the staff role
INSERT INTO permissions (role_id, feature_id, actions, updated_by)
VALUES
  -- Core modules
  ('staff', 'dashboard',        ARRAY['view'],                  null),
  ('staff', 'boardRoom',        ARRAY[]::text[],                null),
  ('staff', 'building',         ARRAY['view','create','edit'],  null),
  ('staff', 'propertyLog',      ARRAY['view','create','edit'],  null),
  ('staff', 'archives',         ARRAY['view'],                  null),
  ('staff', 'myUnit',           ARRAY[]::text[],                null),
  ('staff', 'userManagement',   ARRAY[]::text[],                null),
  -- Non-core modules
  ('staff', 'fiscalLens',       ARRAY[]::text[],                null),
  ('staff', 'caseOps',          ARRAY['view','create','edit'],  null),
  ('staff', 'complianceRunbook',ARRAY['view'],                  null),
  ('staff', 'aiAdvisor',        ARRAY[]::text[],                null),
  ('staff', 'documentVault',    ARRAY['view'],                  null),
  ('staff', 'paymentProcessing',ARRAY[]::text[],                null),
  ('staff', 'votesResolutions', ARRAY[]::text[],                null),
  ('staff', 'communityPortal',  ARRAY['view','create'],         null),
  ('staff', 'vendorManagement', ARRAY['view','create','edit'],  null),
  ('staff', 'reserveStudyTools',ARRAY[]::text[],                null)
ON CONFLICT DO NOTHING;
