-- Ajoute la colonne Importance si absente (calendrier)
ALTER TABLE "CalendarEvents" ADD COLUMN IF NOT EXISTS "Importance" character varying(40) NOT NULL DEFAULT 'normal';
ALTER TABLE "CalendarEvents" ADD COLUMN IF NOT EXISTS "EventType" character varying(40) NOT NULL DEFAULT 'custom';
ALTER TABLE "CalendarEvents" ADD COLUMN IF NOT EXISTS "IsCompanyWide" boolean NOT NULL DEFAULT true;
ALTER TABLE "CalendarEvents" ADD COLUMN IF NOT EXISTS "TargetUserIdsJson" text NULL;
ALTER TABLE "CalendarEvents" ADD COLUMN IF NOT EXISTS "TargetDepartmentIdsJson" text NULL;
