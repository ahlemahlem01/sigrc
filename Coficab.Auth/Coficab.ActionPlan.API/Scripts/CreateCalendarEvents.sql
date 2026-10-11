-- Calendrier entreprise (annonces, réunions, jours fériés) — stockage local DB
CREATE TABLE IF NOT EXISTS "CalendarEvents" (
    "Id" uuid PRIMARY KEY,
    "Title" character varying(300) NOT NULL,
    "Description" text NULL,
    "StartAt" timestamp with time zone NOT NULL,
    "EndAt" timestamp with time zone NOT NULL,
    "AllDay" boolean NOT NULL DEFAULT false,
    "Source" character varying(40) NOT NULL DEFAULT 'custom',
    "EventType" character varying(40) NOT NULL DEFAULT 'custom',
    "Importance" character varying(40) NOT NULL DEFAULT 'normal',
    "Color" character varying(40) NULL,
    "ActionPlanId" uuid NULL,
    "ClaimId" uuid NULL,
    "ExternalUid" character varying(200) NOT NULL,
    "OwnerId" text NOT NULL,
    "IsCompanyWide" boolean NOT NULL DEFAULT true,
    "TargetUserIdsJson" text NULL,
    "TargetDepartmentIdsJson" text NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "CreatedBy" text NULL,
    "UpdatedAt" timestamp with time zone NULL,
    "UpdatedBy" text NULL,
    "IsArchived" boolean NOT NULL DEFAULT false,
    "ArchivedAt" timestamp with time zone NULL,
    "ArchivedBy" text NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "IX_CalendarEvents_ExternalUid" ON "CalendarEvents" ("ExternalUid");
CREATE INDEX IF NOT EXISTS "IX_CalendarEvents_StartAt_EndAt" ON "CalendarEvents" ("StartAt", "EndAt");
CREATE INDEX IF NOT EXISTS "IX_CalendarEvents_OwnerId" ON "CalendarEvents" ("OwnerId");
CREATE INDEX IF NOT EXISTS "IX_CalendarEvents_EventType" ON "CalendarEvents" ("EventType");

-- Migration si la table existait déjà sans les colonnes de ciblage
ALTER TABLE "CalendarEvents" ADD COLUMN IF NOT EXISTS "EventType" character varying(40) NOT NULL DEFAULT 'custom';
ALTER TABLE "CalendarEvents" ADD COLUMN IF NOT EXISTS "Importance" character varying(40) NOT NULL DEFAULT 'normal';
ALTER TABLE "CalendarEvents" ADD COLUMN IF NOT EXISTS "IsCompanyWide" boolean NOT NULL DEFAULT true;
ALTER TABLE "CalendarEvents" ADD COLUMN IF NOT EXISTS "TargetUserIdsJson" text NULL;
ALTER TABLE "CalendarEvents" ADD COLUMN IF NOT EXISTS "TargetDepartmentIdsJson" text NULL;
