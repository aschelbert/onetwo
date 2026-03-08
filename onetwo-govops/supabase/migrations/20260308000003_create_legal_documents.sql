-- Migration 3: Create legal_documents table and storage bucket

CREATE TYPE public.legal_doc_type AS ENUM (
  'bylaws', 'cc_and_r', 'rules_regulations', 'declaration', 'articles_of_incorporation', 'insurance_certificate', 'other'
);

CREATE TABLE IF NOT EXISTS public.legal_documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenancy_id text NOT NULL REFERENCES public.tenancies(id) ON DELETE CASCADE,
  name text NOT NULL,
  doc_type public.legal_doc_type NOT NULL DEFAULT 'other',
  version text,
  file_size bigint,
  status text NOT NULL DEFAULT 'active',
  storage_path text,
  bylaws_rules jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins have full access to legal_documents"
  ON public.legal_documents FOR ALL TO authenticated
  USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE POLICY "Tenant users can manage legal_documents"
  ON public.legal_documents FOR ALL TO authenticated
  USING (tenancy_id IN (SELECT unnest(user_tenancy_ids())))
  WITH CHECK (tenancy_id IN (SELECT unnest(user_tenancy_ids())));

-- Storage bucket for legal documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('legal-documents', 'legal-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: tenant-scoped access (folder name = tenancy_id)
CREATE POLICY "Tenant users can upload legal documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'legal-documents'
    AND (storage.foldername(name))[1] IN (SELECT unnest(user_tenancy_ids()))
  );

CREATE POLICY "Tenant users can view legal documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'legal-documents'
    AND (storage.foldername(name))[1] IN (SELECT unnest(user_tenancy_ids()))
  );

CREATE POLICY "Tenant users can delete legal documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'legal-documents'
    AND (storage.foldername(name))[1] IN (SELECT unnest(user_tenancy_ids()))
  );
