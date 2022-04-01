CREATE TABLE "public"."Author"
(
    "id" integer NOT NULL,
    "name" character varying(128) COLLATE "pg_catalog"."default" NOT NULL,
    CONSTRAINT "Author_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Author_name_key" UNIQUE ("name")
);

CREATE TABLE "public"."Source"
(
    "id" integer NOT NULL,
    "name" character varying(128) COLLATE "pg_catalog"."default" NOT NULL,
    CONSTRAINT "Source_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Source_name_key" UNIQUE ("name")
);

CREATE TABLE "public"."Raw"
(
    "source" integer NOT NULL,
    "id" bigserial NOT NULL,
    "timestamp" bigint NOT NULL,
    "author" integer NOT NULL,
    "data" bytea NOT NULL,
    PRIMARY KEY ("source", "id"),
    FOREIGN KEY ("source")
        REFERENCES "public"."Source" ("id") MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
        NOT VALID,
    FOREIGN KEY ("author")
        REFERENCES "public"."Author" ("id") MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
        NOT VALID
) PARTITION BY RANGE ("source");
