-- Generated dashboard installation. Run once on a new tracker database.
-- For an existing database, use upgrade-worker-sections.sql instead.
BEGIN;
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text NOT NULL PRIMARY KEY);
ALTER TABLE supabase_migrations.schema_migrations ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE supabase_migrations.schema_migrations ADD COLUMN IF NOT EXISTS statements text[];
-- Generated from the reviewed backend queries by scripts/generate-database.mjs.
-- All tables are private. Browser roles have no access; only the verified Edge Function can call this RPC.
CREATE SCHEMA transport_private;
REVOKE ALL ON SCHEMA transport_private FROM PUBLIC, anon, authenticated;
SET search_path = transport_private, pg_catalog;
CREATE TABLE "alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"trip_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" bigint NOT NULL,
	"push_state" text DEFAULT 'pending' NOT NULL,
	"attempts" bigint DEFAULT 0 NOT NULL
);


CREATE UNIQUE INDEX "idx_alerts_trip_user_kind" ON "alerts" ("trip_id","user_id","kind");

CREATE INDEX "idx_alerts_user_created" ON "alerts" ("user_id","created_at");

CREATE TABLE "buses" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"plate" text NOT NULL,
	"route_id" text NOT NULL
);


CREATE TABLE "members" (
	"email" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"role" text NOT NULL
);


CREATE TABLE "routes" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"stops" text NOT NULL
);


CREATE TABLE "settings" (
	"id" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);


CREATE TABLE "shifts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" text NOT NULL,
	"bus_id" text NOT NULL,
	"route_id" text NOT NULL,
	"stop_id" text NOT NULL,
	"on_shift" bigint NOT NULL,
	"radius" bigint NOT NULL
);


CREATE UNIQUE INDEX "idx_shifts_user_date" ON "shifts" ("user_id","date");

CREATE INDEX "idx_shifts_bus_date" ON "shifts" ("bus_id","date");

CREATE TABLE "subscriptions" (
	"endpoint" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"subscription" text NOT NULL
);


CREATE INDEX "idx_subscriptions_user" ON "subscriptions" ("user_id");

CREATE TABLE "trips" (
	"id" text PRIMARY KEY NOT NULL,
	"bus_id" text NOT NULL,
	"route_id" text NOT NULL,
	"driver_id" text NOT NULL,
	"driver_name" text NOT NULL,
	"date" text NOT NULL,
	"status" text NOT NULL,
	"test" bigint DEFAULT 0 NOT NULL,
	"next_stop" bigint DEFAULT 0 NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"accuracy" double precision,
	"speed" double precision,
	"updated_at" bigint,
	"started_at" bigint NOT NULL,
	"delay_minutes" bigint DEFAULT 0 NOT NULL
);


CREATE UNIQUE INDEX "idx_trips_active_bus" ON "trips" ("bus_id") WHERE "trips"."status" = 'active';

CREATE UNIQUE INDEX "idx_trips_active_driver" ON "trips" ("driver_id") WHERE "trips"."status" = 'active';

CREATE INDEX "idx_trips_date_status" ON "trips" ("date","status");
ALTER TABLE "buses" ADD "slot" bigint DEFAULT 1 NOT NULL;

CREATE UNIQUE INDEX "idx_buses_singleton" ON "buses" ("slot");
ALTER TABLE "trips" ADD "driver_epoch" bigint DEFAULT 0 NOT NULL;

ALTER TABLE "trips" ADD "handover_email" text;

ALTER TABLE "trips" ADD "handover_name" text;
CREATE TABLE "pickups" (
	"user_id" text PRIMARY KEY NOT NULL,
	"bus_id" text NOT NULL,
	"route_id" text NOT NULL,
	"route_revision" bigint NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"name" text NOT NULL,
	"route_offset" double precision NOT NULL,
	"radius" bigint NOT NULL,
	"email_arrival" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);


CREATE TABLE "route_recordings" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"points" text DEFAULT '[]' NOT NULL,
	"point_count" bigint DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);


CREATE UNIQUE INDEX "idx_recordings_owner_draft" ON "route_recordings" ("owner_id") WHERE "route_recordings"."status" IN ('recording','review');

ALTER TABLE "alerts" ADD "email_to" text;

ALTER TABLE "alerts" ADD "email_state" text DEFAULT 'not-requested' NOT NULL;

ALTER TABLE "alerts" ADD "email_attempts" bigint DEFAULT 0 NOT NULL;

ALTER TABLE "routes" ADD "path" text DEFAULT '[]' NOT NULL;

ALTER TABLE "routes" ADD "revision" bigint DEFAULT 1 NOT NULL;

ALTER TABLE "routes" ADD "recorded" bigint DEFAULT 0 NOT NULL;

ALTER TABLE "shifts" ADD "pickup_lat" double precision;

ALTER TABLE "shifts" ADD "pickup_lng" double precision;

ALTER TABLE "shifts" ADD "pickup_name" text;

ALTER TABLE "shifts" ADD "route_offset" double precision;

ALTER TABLE "shifts" ADD "route_revision" bigint DEFAULT 1 NOT NULL;

ALTER TABLE "shifts" ADD "email_arrival" bigint DEFAULT 0 NOT NULL;

ALTER TABLE "trips" ADD "route_progress" double precision DEFAULT 0 NOT NULL;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON settings FROM PUBLIC, anon, authenticated;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON members FROM PUBLIC, anon, authenticated;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON routes FROM PUBLIC, anon, authenticated;
ALTER TABLE buses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON buses FROM PUBLIC, anon, authenticated;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON trips FROM PUBLIC, anon, authenticated;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON shifts FROM PUBLIC, anon, authenticated;
ALTER TABLE pickups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pickups FROM PUBLIC, anon, authenticated;
ALTER TABLE route_recordings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON route_recordings FROM PUBLIC, anon, authenticated;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON alerts FROM PUBLIC, anon, authenticated;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON subscriptions FROM PUBLIC, anon, authenticated;
ALTER TABLE buses ADD CONSTRAINT bus_single_slot CHECK (slot = 1);
ALTER TABLE members ADD CONSTRAINT valid_member_role CHECK (role IN ('admin','driver','worker'));
CREATE UNIQUE INDEX idx_member_user ON members(user_id) WHERE user_id IS NOT NULL;
RESET search_path;
CREATE OR REPLACE FUNCTION public.transport_execute(operations jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = transport_private, pg_catalog
AS $function$
DECLARE op jsonb; args jsonb; template text; rendered text; segments text[]; arg jsonb; output jsonb := '[]'::jsonb; rows jsonb; changes bigint; i integer;
BEGIN
 IF jsonb_typeof(operations) <> 'array' OR jsonb_array_length(operations) > 500 THEN RAISE EXCEPTION 'Invalid operations'; END IF;
 FOR op IN SELECT value FROM jsonb_array_elements(operations) LOOP
  args := op->'args';
  template := CASE op->>'id'
   WHEN 'b9607b8bd2c8265591a565ddca6599cb46292df8a13511d5857aa5b650fa73b3' THEN 'UPDATE trips SET status=?,handover_email=NULL,handover_name=NULL,driver_epoch=driver_epoch+1 WHERE id=? AND status=? AND driver_epoch=?'
   WHEN '00becb533c93a8964fc5e7036d0ac8e2ec8821f2493ee2cce8ebf1489b3231e6' THEN 'SELECT value FROM settings WHERE id = ?'
   WHEN '0d42cfd184fd748d1fb1ecf96090adb7ba305cbe1107b0315a1437870da7fdeb' THEN 'SELECT * FROM members WHERE email = ?'
   WHEN '77901097da9062fb3ea82112a1b94bc56dca82a5de66ccdcb841b04cea4bf27e' THEN 'UPDATE members SET user_id=? WHERE email=?'
   WHEN 'a2e93593c6318b7255a79c23f778aaac800fc4fe94b67636fc863f3d013d0782' THEN 'SELECT * FROM routes WHERE id = ?'
   WHEN 'a3637dc3a5c6e2b5f3e3a00a514a2e918c625c5dd4b9cd475965517a221fc21a' THEN 'SELECT * FROM trips WHERE id = ? AND driver_id = ? AND status = ?'
   WHEN 'd01c921d8006c79a7d68ccc8df50b46120ba0536a51ec9eeb1fc0739562d919a' THEN 'SELECT * FROM subscriptions WHERE user_id = ?'
   WHEN 'f4c95d72c9b076a4eddf0894dffebdfdcf98fe4ba34be6a94d58523c930960b5' THEN 'DELETE FROM subscriptions WHERE endpoint = ?'
   WHEN '77a848659d0fd1660d72870a568175fdd6ec922981c8b0bda6663a051f85ca1b' THEN 'SELECT * FROM alerts WHERE trip_id = ? AND push_state IN (?, ?) AND attempts < 3 AND created_at > ? LIMIT 50'
   WHEN 'd5debaa705b156a685d05a0b967c915bfed51bbf762f4b45dd1560197b351ceb' THEN 'UPDATE alerts SET attempts = attempts + 1, push_state = ? WHERE id = ? AND attempts = ?'
   WHEN '0f24f2f72715ac95746d804210ce183a7dd63445d2dcb971fb16c4fb81367d93' THEN 'UPDATE alerts SET push_state = ? WHERE id = ?'
   WHEN 'fa27bda777f4ac896671b4a874f23371031d4b590343ca5122fb7f491ea4409d' THEN 'SELECT s.*,m.email FROM shifts s LEFT JOIN members m ON m.user_id=s.user_id WHERE s.bus_id=? AND s.route_id=? AND s.date=? AND s.on_shift=1'
   WHEN 'f66f1d35160eb210f8bd954e1bbfb014c44cba557b9d8c4ddbd7089b53dae80f' THEN 'INSERT INTO alerts (id,user_id,trip_id,kind,title,body,created_at,push_state,email_to,email_state) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING'
   WHEN 'ce7391a747639c8eabdb57a363eec7b33392f285bcd202931b82595597ca1923' THEN 'SELECT * FROM routes ORDER BY name'
   WHEN '5383815fc87d87ddb675e2caca6edf953a0088d6b22e4d02abab572345f37891' THEN 'SELECT * FROM buses ORDER BY name'
   WHEN '314bffb3083fe6bc8a835b112a73dd6bcf16ce30497a53b54a11160e113707ce' THEN 'SELECT * FROM trips WHERE status=? AND date=?'
   WHEN '8eea7fb8ebcde18151dc3a92e3129e2a600d58e412aafcab10aceec23b8af740' THEN 'SELECT * FROM shifts WHERE user_id=? AND date=?'
   WHEN '1a7154d472c2bb2db2ac47edb3cea40a8cb82d322f8f7ebacf644804d0d95e08' THEN 'SELECT * FROM alerts WHERE user_id=? ORDER BY created_at DESC LIMIT 30'
   WHEN 'eaa57fbf5b06073bbb701ca6e819172ae464d9145072ea41321e1b0650ca64f4' THEN 'SELECT email,name,role FROM members ORDER BY role,name'
   WHEN '90bfc513f6c95615c0e8246a680f708164952eeb8f4396a933e8e4189b49ee9c' THEN 'SELECT email,name,role FROM members WHERE role IN (''driver'',''admin'') ORDER BY name'
   WHEN '2a0da7b93e9f4772207a2bd260bf76d68db895a6c80cdcd37e4cd9305d6f4ade' THEN 'SELECT * FROM pickups WHERE user_id=?'
   WHEN 'c5cd6f5d16664e6daa3c34eff1b78262b8d41bce20b040089cab3af5e77f05ae' THEN 'SELECT * FROM route_recordings WHERE owner_id=? AND status IN (''recording'',''review'') LIMIT 1'
   WHEN '5a960bfb8dbb38df6ff8db1719e41486d735209f14cdf19a06ae050bdc517524' THEN 'INSERT INTO settings (id,value) VALUES (?,?)'
   WHEN 'f091c15c72fc0158c38b2030e12e12a50ad5010b34001babdf5a296a3086a2b1' THEN 'INSERT INTO members (email,user_id,name,role) VALUES (?,?,?,?)'
   WHEN '64c4d52829491e02a12ea81372e8abfc7c946c2408da4f8ffe7764ec960393d7' THEN 'UPDATE settings SET value = ? WHERE id = ?'
   WHEN 'bba8fc232adaa3c291f3b717ffe9957c1bb0d023605b1d7854e0b2afca7e36f6' THEN 'SELECT id FROM trips WHERE route_id = ? AND status = ?'
   WHEN 'c1d5054a4a40698404319f612fb67f09daa3565b0781f7560094acb2ed31dc8e' THEN 'INSERT INTO routes (id,name,color,stops) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,color=excluded.color,stops=excluded.stops,revision=routes.revision+1'
   WHEN 'f0c00a8ab9b01510b5c98efbc382bb2895fefd3b5a8acc5e179a4a943c15ce53' THEN 'SELECT id FROM buses LIMIT 1'
   WHEN 'd037259ae81e783e019607a4a42131ea6c3bbc25a64019d1d3fb0348fd61dbfb' THEN 'SELECT id FROM trips WHERE bus_id = ? AND status = ?'
   WHEN '4e3086ddfacfab50d84aaf681e343a05b944f6b411de723999ee232a39125fdc' THEN 'INSERT INTO buses (id,name,plate,route_id) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,plate=excluded.plate,route_id=excluded.route_id'
   WHEN 'bd9f356acbbf668c8cd6cc6107247e85feedb73d4327cffb3e1d11284f0d7b19' THEN 'SELECT role FROM members WHERE email = ?'
   WHEN '8e3340aa35c13f49e73cac6e6c3d7dcabb0e6906d669154177442843a3670976' THEN 'INSERT INTO members (email,name,role) VALUES (?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,role=excluded.role'
   WHEN '330dcb11b8db55b6a1974b3874869d9299a13956c6ab419cd49d4e2e394b21a2' THEN 'SELECT * FROM buses LIMIT 1'
   WHEN '92ac46edaa78bb45a85f185a0615fe1c803b5d0adddd41df4b7c5b8155dd4728' THEN 'INSERT INTO pickups (user_id,bus_id,route_id,route_revision,lat,lng,name,route_offset,radius,email_arrival,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET bus_id=excluded.bus_id,route_id=excluded.route_id,route_revision=excluded.route_revision,lat=excluded.lat,lng=excluded.lng,name=excluded.name,route_offset=excluded.route_offset,radius=excluded.radius,email_arrival=excluded.email_arrival,updated_at=excluded.updated_at'
   WHEN '517153f55f0cb77bac81e447acac884528bb1c0fc506e7dda2eb90cfd7ce8db5' THEN 'SELECT * FROM buses WHERE id=? AND route_id=?'
   WHEN 'b6a8ca6b7228e04d4c94d0030cfb45d3a6ccd884d0f187f2e035392a34be779e' THEN 'SELECT * FROM pickups WHERE user_id=? AND bus_id=? AND route_id=? AND route_revision=?'
   WHEN 'a5c64c7deaae03b2f9347fc524d71d9f0a134d4cd3e4225cf3b878aa95bf4f53' THEN 'INSERT INTO shifts (id,user_id,date,bus_id,route_id,stop_id,on_shift,radius,pickup_lat,pickup_lng,pickup_name,route_offset,route_revision,email_arrival) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,date) DO UPDATE SET bus_id=excluded.bus_id,route_id=excluded.route_id,stop_id=excluded.stop_id,on_shift=excluded.on_shift,radius=excluded.radius,pickup_lat=excluded.pickup_lat,pickup_lng=excluded.pickup_lng,pickup_name=excluded.pickup_name,route_offset=excluded.route_offset,route_revision=excluded.route_revision,email_arrival=excluded.email_arrival'
   WHEN '3a76d2584b2bec5e9afe488ca9482c5523cf7c7567a5ca4c3991e0bbfa1e949b' THEN 'SELECT * FROM buses WHERE id = ?'
   WHEN 'ec8bb547e89f80764d952cdb1cee040a7247c06cc4f10db1f1a7e0c9ff5de549' THEN 'UPDATE trips SET status = ? WHERE status = ? AND (date < ? OR (test = 0 AND ? = 0) OR (test = 1 AND started_at < ?))'
   WHEN '8cd58bf3d8b4ef13581ed731bfef86f8bd546eed94b997973d8b00d5554a6056' THEN 'INSERT INTO trips (id,bus_id,route_id,driver_id,driver_name,date,status,test,next_stop,started_at) VALUES (?,?,?,?,?,?,?,?,0,?)'
   WHEN '1d696da01a28aad92db0fcf9caa6f949669035de58312abfc031ae5615d39e7c' THEN 'SELECT * FROM trips WHERE id = ? AND status = ?'
   WHEN 'a8c5d3e684d9f62da778976e878d9bbd89ec0b8025f41d5b2a646f0b85e6f359' THEN 'UPDATE trips SET driver_id=?,driver_name=?,driver_epoch=driver_epoch+1,handover_email=NULL,handover_name=NULL,lat=?,lng=?,accuracy=?,speed=?,updated_at=?,route_progress=? WHERE id=? AND status=? AND driver_epoch=? AND handover_email=?'
   WHEN '4a50a7e762af82f0819e438ed6c32ed3dbe3b6d6e21eec846ce6e4b7b2e5702c' THEN 'SELECT name FROM buses WHERE id = ?'
   WHEN '5275fb4f17bf51a029f2ed8b5236ed751e30f40c2dd67dfbfb2cb95e1ab69415' THEN 'UPDATE trips SET status=?,handover_email=NULL,handover_name=NULL,driver_epoch=driver_epoch+1 WHERE id=? AND driver_id=? AND status=? AND driver_epoch=?'
   WHEN '605888917a8d5ef53f4ff916d08d1903d3c9b011250a8a76acf3d0146694a583' THEN 'SELECT name FROM members WHERE email=? AND role IN (''driver'',''admin'')'
   WHEN '37446ec06da3f672a4c407d208039f884acba49b20ec9a1cf1ff4ae42978dd13' THEN 'UPDATE trips SET handover_email=?,handover_name=?,driver_epoch=driver_epoch+1 WHERE id=? AND driver_id=? AND status=? AND driver_epoch=? AND handover_email IS NULL'
   WHEN '64b828ed10c21a0e3a464d9e778b0432a131c092fdae43f2560bb07597a1c491' THEN 'UPDATE trips SET handover_email=NULL,handover_name=NULL,driver_epoch=driver_epoch+1,updated_at=NULL WHERE id=? AND driver_id=? AND status=? AND driver_epoch=? AND handover_email=?'
   WHEN '7675f5abbbaa8026a338d12cdf763682ef396c17645974bb4ce20894a4a22601' THEN 'UPDATE trips SET lat=?,lng=?,accuracy=?,speed=?,updated_at=?,route_progress=? WHERE id=? AND driver_id=? AND status=? AND driver_epoch=? AND handover_email IS NULL'
   WHEN '79aa017743c4c26252601a604288f1c94c983bcd4d8693a81a64b727b342f773' THEN 'UPDATE trips SET next_stop=?,status=? WHERE id=? AND driver_id=? AND status=? AND driver_epoch=? AND handover_email IS NULL AND next_stop=?'
   WHEN '1033a2719d60e6f6239618a8ab30bdf4e74104c0e19d778e7af11256f4a39548' THEN 'UPDATE trips SET delay_minutes=? WHERE id=? AND driver_id=? AND status=? AND driver_epoch=? AND handover_email IS NULL'
   WHEN '34204ccf23e71e8a09b0176076b3e2784abfcd5e3e8e3faad829cafc5b13e3d6' THEN 'SELECT user_id FROM shifts WHERE bus_id = ? AND route_id = ? AND date = ? AND on_shift = 1'
   WHEN '5f2c918f443849c762abbb15bceace0a6780ce7635a7ab426473d1e15a7c04b2' THEN 'INSERT INTO alerts (id,user_id,trip_id,kind,title,body,created_at,push_state,attempts) VALUES (?,?,?,?,?,?,?,?,0) ON CONFLICT DO NOTHING'
   WHEN 'c8d86428030c230ad87aabd00886f725410d749ee762b99ad089bd9e6757c93e' THEN 'SELECT count(*) as total FROM subscriptions WHERE user_id = ?'
   WHEN '8e765c107f02ec1cfd9ecfaa0abe9d26f720825b2b3653edb7e11ac37fabd168' THEN 'SELECT endpoint FROM subscriptions WHERE endpoint = ? AND user_id = ?'
   WHEN '5db0ea85cbe6cb9042cd694633395116c16d248ad715c060bdb92f3ac60d194a' THEN 'INSERT INTO subscriptions (endpoint,user_id,subscription) VALUES (?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,subscription=excluded.subscription'
   WHEN 'd59f231b3076177e22b544ed03203c22cb9f86b2f2c7e7c1c689b7ffcdc7998d' THEN 'INSERT INTO route_recordings (id,owner_id,name,status,created_at,updated_at) VALUES (?,?,?,?,?,?)'
   WHEN '03df2cf9f6c440a75e87a65ab5beee9b3a876ba1de9769e5f28ec39e534985bb' THEN 'SELECT * FROM route_recordings WHERE id=? AND owner_id=?'
   WHEN '930ae85c17da24587b10937a042473c8c9c510f4946cfcb584f00e9a0afbb2cc' THEN 'UPDATE route_recordings SET points=?,point_count=?,updated_at=? WHERE id=? AND owner_id=? AND status=? AND point_count=?'
   WHEN '78f22962edb861671c01d49b25ba9bdae96298668245194c2cd00c96bf751409' THEN 'UPDATE route_recordings SET status=?,updated_at=? WHERE id=? AND owner_id=? AND status IN (?,?)'
   WHEN '7fbde55407ed12dba568b5df01c9c5256f86c0a7ae8ea75883dc17bcda4d8761' THEN 'UPDATE route_recordings SET status=?,updated_at=? WHERE id=? AND owner_id=?'
   WHEN 'd277129b2a36f508c4744fd2322712f900cb579d3c5ecde26baad76ed413bac8' THEN 'INSERT INTO routes (id,name,color,stops,path,recorded) SELECT ?,?,?,?,?,1 WHERE EXISTS (SELECT 1 FROM route_recordings WHERE id=? AND owner_id=? AND status=?) ON CONFLICT DO NOTHING'
   WHEN 'fa1af3f945e6575c53450ccc871250e30d588acd84dc6734724917b2c7712224' THEN 'UPDATE route_recordings SET status=?,name=?,updated_at=? WHERE id=? AND owner_id=? AND status=? AND EXISTS (SELECT 1 FROM routes WHERE id=?)'
   WHEN '91be3c00a7e478c26da57941ce35c5ff1bf144150f5110f0c5430a31bca7aa65' THEN 'SELECT * FROM alerts WHERE trip_id=? AND email_state IN (''pending'',''failed'') AND email_attempts<3 AND created_at>? LIMIT 50'
   WHEN '65a5ee6403bfb9fc570d8322cbda9cf9a6bf8ff8933ff87608aa882b84ab63e4' THEN 'UPDATE alerts SET email_state=''sending'',email_attempts=email_attempts+1 WHERE id=? AND email_attempts=? AND email_state IN (''pending'',''failed'')'
   WHEN 'a32e8f413aaaaa1df8506ce845149de509193412c4321d02a92b444673a591a4' THEN 'SELECT m.email FROM members m JOIN shifts s ON s.user_id=m.user_id JOIN trips t ON t.id=? JOIN routes r ON r.id=t.route_id WHERE m.user_id=? AND s.date=t.date AND s.bus_id=t.bus_id AND s.route_id=t.route_id AND s.route_revision=r.revision AND s.on_shift=1 AND s.email_arrival=1'
   WHEN '149e01dd149bad0c1e902546ee9e6e70392cf5c5d818adcabf61b66e5acbfe01' THEN 'UPDATE alerts SET email_state=? WHERE id=?'
   ELSE NULL END;
  IF template IS NULL OR jsonb_typeof(args) <> 'array' THEN RAISE EXCEPTION 'Unknown operation'; END IF;
  segments := string_to_array(template, '?');
  IF jsonb_array_length(args) <> array_length(segments, 1)-1 THEN RAISE EXCEPTION 'Invalid parameters'; END IF;
  rendered := segments[1];
  FOR i IN 1..jsonb_array_length(args) LOOP
   arg := args->(i-1);
   IF jsonb_typeof(arg) NOT IN ('string','number','boolean','null') THEN RAISE EXCEPTION 'Invalid parameter type'; END IF;
   rendered := rendered || CASE WHEN jsonb_typeof(arg) = 'null' THEN 'NULL' ELSE quote_literal(arg #>> '{}') END || segments[i+1];
  END LOOP;
  IF template LIKE 'SELECT %' THEN
   EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(result)), ''[]''::jsonb) FROM (' || rendered || ') result' INTO rows;
   changes := 0;
  ELSE
   EXECUTE rendered;
   GET DIAGNOSTICS changes = ROW_COUNT;
   rows := '[]'::jsonb;
  END IF;
  output := output || jsonb_build_array(jsonb_build_object('results',rows,'meta',jsonb_build_object('changes',changes)));
 END LOOP;
 RETURN output;
END;
$function$;
REVOKE ALL ON FUNCTION public.transport_execute(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transport_execute(jsonb) TO service_role;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261003200000', 'transport');
-- Generated worker-section upgrade. Preserves existing members, routes and trips.
SET search_path = transport_private, pg_catalog;
ALTER TABLE "members" ADD "section" text CHECK ("section" IS NULL OR ("role" = 'worker' AND "section" IN ('Flightops','Fulops','CCA')));
RESET search_path;
CREATE OR REPLACE FUNCTION public.transport_execute(operations jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = transport_private, pg_catalog
AS $function$
DECLARE op jsonb; args jsonb; template text; rendered text; segments text[]; arg jsonb; output jsonb := '[]'::jsonb; rows jsonb; changes bigint; i integer;
BEGIN
 IF jsonb_typeof(operations) <> 'array' OR jsonb_array_length(operations) > 500 THEN RAISE EXCEPTION 'Invalid operations'; END IF;
 FOR op IN SELECT value FROM jsonb_array_elements(operations) LOOP
  args := op->'args';
  template := CASE op->>'id'
   WHEN 'b9607b8bd2c8265591a565ddca6599cb46292df8a13511d5857aa5b650fa73b3' THEN 'UPDATE trips SET status=?,handover_email=NULL,handover_name=NULL,driver_epoch=driver_epoch+1 WHERE id=? AND status=? AND driver_epoch=?'
   WHEN '00becb533c93a8964fc5e7036d0ac8e2ec8821f2493ee2cce8ebf1489b3231e6' THEN 'SELECT value FROM settings WHERE id = ?'
   WHEN '0d42cfd184fd748d1fb1ecf96090adb7ba305cbe1107b0315a1437870da7fdeb' THEN 'SELECT * FROM members WHERE email = ?'
   WHEN '77901097da9062fb3ea82112a1b94bc56dca82a5de66ccdcb841b04cea4bf27e' THEN 'UPDATE members SET user_id=? WHERE email=?'
   WHEN 'a2e93593c6318b7255a79c23f778aaac800fc4fe94b67636fc863f3d013d0782' THEN 'SELECT * FROM routes WHERE id = ?'
   WHEN 'a3637dc3a5c6e2b5f3e3a00a514a2e918c625c5dd4b9cd475965517a221fc21a' THEN 'SELECT * FROM trips WHERE id = ? AND driver_id = ? AND status = ?'
   WHEN 'd01c921d8006c79a7d68ccc8df50b46120ba0536a51ec9eeb1fc0739562d919a' THEN 'SELECT * FROM subscriptions WHERE user_id = ?'
   WHEN 'f4c95d72c9b076a4eddf0894dffebdfdcf98fe4ba34be6a94d58523c930960b5' THEN 'DELETE FROM subscriptions WHERE endpoint = ?'
   WHEN '77a848659d0fd1660d72870a568175fdd6ec922981c8b0bda6663a051f85ca1b' THEN 'SELECT * FROM alerts WHERE trip_id = ? AND push_state IN (?, ?) AND attempts < 3 AND created_at > ? LIMIT 50'
   WHEN 'd5debaa705b156a685d05a0b967c915bfed51bbf762f4b45dd1560197b351ceb' THEN 'UPDATE alerts SET attempts = attempts + 1, push_state = ? WHERE id = ? AND attempts = ?'
   WHEN '0f24f2f72715ac95746d804210ce183a7dd63445d2dcb971fb16c4fb81367d93' THEN 'UPDATE alerts SET push_state = ? WHERE id = ?'
   WHEN 'fa27bda777f4ac896671b4a874f23371031d4b590343ca5122fb7f491ea4409d' THEN 'SELECT s.*,m.email FROM shifts s LEFT JOIN members m ON m.user_id=s.user_id WHERE s.bus_id=? AND s.route_id=? AND s.date=? AND s.on_shift=1'
   WHEN 'f66f1d35160eb210f8bd954e1bbfb014c44cba557b9d8c4ddbd7089b53dae80f' THEN 'INSERT INTO alerts (id,user_id,trip_id,kind,title,body,created_at,push_state,email_to,email_state) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING'
   WHEN 'ce7391a747639c8eabdb57a363eec7b33392f285bcd202931b82595597ca1923' THEN 'SELECT * FROM routes ORDER BY name'
   WHEN '5383815fc87d87ddb675e2caca6edf953a0088d6b22e4d02abab572345f37891' THEN 'SELECT * FROM buses ORDER BY name'
   WHEN '314bffb3083fe6bc8a835b112a73dd6bcf16ce30497a53b54a11160e113707ce' THEN 'SELECT * FROM trips WHERE status=? AND date=?'
   WHEN '8eea7fb8ebcde18151dc3a92e3129e2a600d58e412aafcab10aceec23b8af740' THEN 'SELECT * FROM shifts WHERE user_id=? AND date=?'
   WHEN '1a7154d472c2bb2db2ac47edb3cea40a8cb82d322f8f7ebacf644804d0d95e08' THEN 'SELECT * FROM alerts WHERE user_id=? ORDER BY created_at DESC LIMIT 30'
   WHEN 'eaa57fbf5b06073bbb701ca6e819172ae464d9145072ea41321e1b0650ca64f4' THEN 'SELECT email,name,role FROM members ORDER BY role,name'
   WHEN '90bfc513f6c95615c0e8246a680f708164952eeb8f4396a933e8e4189b49ee9c' THEN 'SELECT email,name,role FROM members WHERE role IN (''driver'',''admin'') ORDER BY name'
   WHEN '2a0da7b93e9f4772207a2bd260bf76d68db895a6c80cdcd37e4cd9305d6f4ade' THEN 'SELECT * FROM pickups WHERE user_id=?'
   WHEN 'c5cd6f5d16664e6daa3c34eff1b78262b8d41bce20b040089cab3af5e77f05ae' THEN 'SELECT * FROM route_recordings WHERE owner_id=? AND status IN (''recording'',''review'') LIMIT 1'
   WHEN '5a960bfb8dbb38df6ff8db1719e41486d735209f14cdf19a06ae050bdc517524' THEN 'INSERT INTO settings (id,value) VALUES (?,?)'
   WHEN 'f091c15c72fc0158c38b2030e12e12a50ad5010b34001babdf5a296a3086a2b1' THEN 'INSERT INTO members (email,user_id,name,role) VALUES (?,?,?,?)'
   WHEN '64c4d52829491e02a12ea81372e8abfc7c946c2408da4f8ffe7764ec960393d7' THEN 'UPDATE settings SET value = ? WHERE id = ?'
   WHEN 'bba8fc232adaa3c291f3b717ffe9957c1bb0d023605b1d7854e0b2afca7e36f6' THEN 'SELECT id FROM trips WHERE route_id = ? AND status = ?'
   WHEN 'c1d5054a4a40698404319f612fb67f09daa3565b0781f7560094acb2ed31dc8e' THEN 'INSERT INTO routes (id,name,color,stops) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,color=excluded.color,stops=excluded.stops,revision=routes.revision+1'
   WHEN 'f0c00a8ab9b01510b5c98efbc382bb2895fefd3b5a8acc5e179a4a943c15ce53' THEN 'SELECT id FROM buses LIMIT 1'
   WHEN 'd037259ae81e783e019607a4a42131ea6c3bbc25a64019d1d3fb0348fd61dbfb' THEN 'SELECT id FROM trips WHERE bus_id = ? AND status = ?'
   WHEN '4e3086ddfacfab50d84aaf681e343a05b944f6b411de723999ee232a39125fdc' THEN 'INSERT INTO buses (id,name,plate,route_id) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,plate=excluded.plate,route_id=excluded.route_id'
   WHEN 'bd9f356acbbf668c8cd6cc6107247e85feedb73d4327cffb3e1d11284f0d7b19' THEN 'SELECT role FROM members WHERE email = ?'
   WHEN '8e3340aa35c13f49e73cac6e6c3d7dcabb0e6906d669154177442843a3670976' THEN 'INSERT INTO members (email,name,role) VALUES (?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,role=excluded.role'
   WHEN '330dcb11b8db55b6a1974b3874869d9299a13956c6ab419cd49d4e2e394b21a2' THEN 'SELECT * FROM buses LIMIT 1'
   WHEN '92ac46edaa78bb45a85f185a0615fe1c803b5d0adddd41df4b7c5b8155dd4728' THEN 'INSERT INTO pickups (user_id,bus_id,route_id,route_revision,lat,lng,name,route_offset,radius,email_arrival,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET bus_id=excluded.bus_id,route_id=excluded.route_id,route_revision=excluded.route_revision,lat=excluded.lat,lng=excluded.lng,name=excluded.name,route_offset=excluded.route_offset,radius=excluded.radius,email_arrival=excluded.email_arrival,updated_at=excluded.updated_at'
   WHEN '517153f55f0cb77bac81e447acac884528bb1c0fc506e7dda2eb90cfd7ce8db5' THEN 'SELECT * FROM buses WHERE id=? AND route_id=?'
   WHEN 'b6a8ca6b7228e04d4c94d0030cfb45d3a6ccd884d0f187f2e035392a34be779e' THEN 'SELECT * FROM pickups WHERE user_id=? AND bus_id=? AND route_id=? AND route_revision=?'
   WHEN 'a5c64c7deaae03b2f9347fc524d71d9f0a134d4cd3e4225cf3b878aa95bf4f53' THEN 'INSERT INTO shifts (id,user_id,date,bus_id,route_id,stop_id,on_shift,radius,pickup_lat,pickup_lng,pickup_name,route_offset,route_revision,email_arrival) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,date) DO UPDATE SET bus_id=excluded.bus_id,route_id=excluded.route_id,stop_id=excluded.stop_id,on_shift=excluded.on_shift,radius=excluded.radius,pickup_lat=excluded.pickup_lat,pickup_lng=excluded.pickup_lng,pickup_name=excluded.pickup_name,route_offset=excluded.route_offset,route_revision=excluded.route_revision,email_arrival=excluded.email_arrival'
   WHEN '3a76d2584b2bec5e9afe488ca9482c5523cf7c7567a5ca4c3991e0bbfa1e949b' THEN 'SELECT * FROM buses WHERE id = ?'
   WHEN 'ec8bb547e89f80764d952cdb1cee040a7247c06cc4f10db1f1a7e0c9ff5de549' THEN 'UPDATE trips SET status = ? WHERE status = ? AND (date < ? OR (test = 0 AND ? = 0) OR (test = 1 AND started_at < ?))'
   WHEN '8cd58bf3d8b4ef13581ed731bfef86f8bd546eed94b997973d8b00d5554a6056' THEN 'INSERT INTO trips (id,bus_id,route_id,driver_id,driver_name,date,status,test,next_stop,started_at) VALUES (?,?,?,?,?,?,?,?,0,?)'
   WHEN '1d696da01a28aad92db0fcf9caa6f949669035de58312abfc031ae5615d39e7c' THEN 'SELECT * FROM trips WHERE id = ? AND status = ?'
   WHEN 'a8c5d3e684d9f62da778976e878d9bbd89ec0b8025f41d5b2a646f0b85e6f359' THEN 'UPDATE trips SET driver_id=?,driver_name=?,driver_epoch=driver_epoch+1,handover_email=NULL,handover_name=NULL,lat=?,lng=?,accuracy=?,speed=?,updated_at=?,route_progress=? WHERE id=? AND status=? AND driver_epoch=? AND handover_email=?'
   WHEN '4a50a7e762af82f0819e438ed6c32ed3dbe3b6d6e21eec846ce6e4b7b2e5702c' THEN 'SELECT name FROM buses WHERE id = ?'
   WHEN '5275fb4f17bf51a029f2ed8b5236ed751e30f40c2dd67dfbfb2cb95e1ab69415' THEN 'UPDATE trips SET status=?,handover_email=NULL,handover_name=NULL,driver_epoch=driver_epoch+1 WHERE id=? AND driver_id=? AND status=? AND driver_epoch=?'
   WHEN '605888917a8d5ef53f4ff916d08d1903d3c9b011250a8a76acf3d0146694a583' THEN 'SELECT name FROM members WHERE email=? AND role IN (''driver'',''admin'')'
   WHEN '37446ec06da3f672a4c407d208039f884acba49b20ec9a1cf1ff4ae42978dd13' THEN 'UPDATE trips SET handover_email=?,handover_name=?,driver_epoch=driver_epoch+1 WHERE id=? AND driver_id=? AND status=? AND driver_epoch=? AND handover_email IS NULL'
   WHEN '64b828ed10c21a0e3a464d9e778b0432a131c092fdae43f2560bb07597a1c491' THEN 'UPDATE trips SET handover_email=NULL,handover_name=NULL,driver_epoch=driver_epoch+1,updated_at=NULL WHERE id=? AND driver_id=? AND status=? AND driver_epoch=? AND handover_email=?'
   WHEN '7675f5abbbaa8026a338d12cdf763682ef396c17645974bb4ce20894a4a22601' THEN 'UPDATE trips SET lat=?,lng=?,accuracy=?,speed=?,updated_at=?,route_progress=? WHERE id=? AND driver_id=? AND status=? AND driver_epoch=? AND handover_email IS NULL'
   WHEN '79aa017743c4c26252601a604288f1c94c983bcd4d8693a81a64b727b342f773' THEN 'UPDATE trips SET next_stop=?,status=? WHERE id=? AND driver_id=? AND status=? AND driver_epoch=? AND handover_email IS NULL AND next_stop=?'
   WHEN '1033a2719d60e6f6239618a8ab30bdf4e74104c0e19d778e7af11256f4a39548' THEN 'UPDATE trips SET delay_minutes=? WHERE id=? AND driver_id=? AND status=? AND driver_epoch=? AND handover_email IS NULL'
   WHEN '34204ccf23e71e8a09b0176076b3e2784abfcd5e3e8e3faad829cafc5b13e3d6' THEN 'SELECT user_id FROM shifts WHERE bus_id = ? AND route_id = ? AND date = ? AND on_shift = 1'
   WHEN '5f2c918f443849c762abbb15bceace0a6780ce7635a7ab426473d1e15a7c04b2' THEN 'INSERT INTO alerts (id,user_id,trip_id,kind,title,body,created_at,push_state,attempts) VALUES (?,?,?,?,?,?,?,?,0) ON CONFLICT DO NOTHING'
   WHEN 'c8d86428030c230ad87aabd00886f725410d749ee762b99ad089bd9e6757c93e' THEN 'SELECT count(*) as total FROM subscriptions WHERE user_id = ?'
   WHEN '8e765c107f02ec1cfd9ecfaa0abe9d26f720825b2b3653edb7e11ac37fabd168' THEN 'SELECT endpoint FROM subscriptions WHERE endpoint = ? AND user_id = ?'
   WHEN '5db0ea85cbe6cb9042cd694633395116c16d248ad715c060bdb92f3ac60d194a' THEN 'INSERT INTO subscriptions (endpoint,user_id,subscription) VALUES (?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,subscription=excluded.subscription'
   WHEN 'd59f231b3076177e22b544ed03203c22cb9f86b2f2c7e7c1c689b7ffcdc7998d' THEN 'INSERT INTO route_recordings (id,owner_id,name,status,created_at,updated_at) VALUES (?,?,?,?,?,?)'
   WHEN '03df2cf9f6c440a75e87a65ab5beee9b3a876ba1de9769e5f28ec39e534985bb' THEN 'SELECT * FROM route_recordings WHERE id=? AND owner_id=?'
   WHEN '930ae85c17da24587b10937a042473c8c9c510f4946cfcb584f00e9a0afbb2cc' THEN 'UPDATE route_recordings SET points=?,point_count=?,updated_at=? WHERE id=? AND owner_id=? AND status=? AND point_count=?'
   WHEN '78f22962edb861671c01d49b25ba9bdae96298668245194c2cd00c96bf751409' THEN 'UPDATE route_recordings SET status=?,updated_at=? WHERE id=? AND owner_id=? AND status IN (?,?)'
   WHEN '7fbde55407ed12dba568b5df01c9c5256f86c0a7ae8ea75883dc17bcda4d8761' THEN 'UPDATE route_recordings SET status=?,updated_at=? WHERE id=? AND owner_id=?'
   WHEN 'd277129b2a36f508c4744fd2322712f900cb579d3c5ecde26baad76ed413bac8' THEN 'INSERT INTO routes (id,name,color,stops,path,recorded) SELECT ?,?,?,?,?,1 WHERE EXISTS (SELECT 1 FROM route_recordings WHERE id=? AND owner_id=? AND status=?) ON CONFLICT DO NOTHING'
   WHEN 'fa1af3f945e6575c53450ccc871250e30d588acd84dc6734724917b2c7712224' THEN 'UPDATE route_recordings SET status=?,name=?,updated_at=? WHERE id=? AND owner_id=? AND status=? AND EXISTS (SELECT 1 FROM routes WHERE id=?)'
   WHEN '91be3c00a7e478c26da57941ce35c5ff1bf144150f5110f0c5430a31bca7aa65' THEN 'SELECT * FROM alerts WHERE trip_id=? AND email_state IN (''pending'',''failed'') AND email_attempts<3 AND created_at>? LIMIT 50'
   WHEN '65a5ee6403bfb9fc570d8322cbda9cf9a6bf8ff8933ff87608aa882b84ab63e4' THEN 'UPDATE alerts SET email_state=''sending'',email_attempts=email_attempts+1 WHERE id=? AND email_attempts=? AND email_state IN (''pending'',''failed'')'
   WHEN 'a32e8f413aaaaa1df8506ce845149de509193412c4321d02a92b444673a591a4' THEN 'SELECT m.email FROM members m JOIN shifts s ON s.user_id=m.user_id JOIN trips t ON t.id=? JOIN routes r ON r.id=t.route_id WHERE m.user_id=? AND s.date=t.date AND s.bus_id=t.bus_id AND s.route_id=t.route_id AND s.route_revision=r.revision AND s.on_shift=1 AND s.email_arrival=1'
   WHEN '149e01dd149bad0c1e902546ee9e6e70392cf5c5d818adcabf61b66e5acbfe01' THEN 'UPDATE alerts SET email_state=? WHERE id=?'
   WHEN '7a1840c29d9275534684604efc063ba3c0767bd32b040ee6e16766330284db34' THEN 'SELECT email,name,role,section FROM members ORDER BY role,section,name'
   WHEN '1fbd1db85515f68800b38a09a5e20afdc8ddc0cb6c4c085148e7ff76fefbca02' THEN 'SELECT email,name,role,section FROM members WHERE role IN (''driver'',''admin'') ORDER BY name'
   WHEN '44c2b85092b76b91ac0f08f473b34d4addba5c87cd78ba5c76377946ea4e72f1' THEN 'SELECT role,section FROM members WHERE email = ?'
   WHEN '118f4bb059b46eeeac74ec7b7b7083f43210829da2bb4cb15af9117c93c5b416' THEN 'INSERT INTO members (email,name,role,section) VALUES (?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,role=excluded.role,section=excluded.section'
   WHEN '08ebc72507a3c6413fb0aeab78d4f13ab2a756ba52d07e8d9705227eb378db75' THEN 'UPDATE members SET section=? WHERE email=? AND user_id=? AND role=?'
   ELSE NULL END;
  IF template IS NULL OR jsonb_typeof(args) <> 'array' THEN RAISE EXCEPTION 'Unknown operation'; END IF;
  segments := string_to_array(template, '?');
  IF jsonb_array_length(args) <> array_length(segments, 1)-1 THEN RAISE EXCEPTION 'Invalid parameters'; END IF;
  rendered := segments[1];
  FOR i IN 1..jsonb_array_length(args) LOOP
   arg := args->(i-1);
   IF jsonb_typeof(arg) NOT IN ('string','number','boolean','null') THEN RAISE EXCEPTION 'Invalid parameter type'; END IF;
   rendered := rendered || CASE WHEN jsonb_typeof(arg) = 'null' THEN 'NULL' ELSE quote_literal(arg #>> '{}') END || segments[i+1];
  END LOOP;
  IF template LIKE 'SELECT %' THEN
   EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(result)), ''[]''::jsonb) FROM (' || rendered || ') result' INTO rows;
   changes := 0;
  ELSE
   EXECUTE rendered;
   GET DIAGNOSTICS changes = ROW_COUNT;
   rows := '[]'::jsonb;
  END IF;
  output := output || jsonb_build_array(jsonb_build_object('results',rows,'meta',jsonb_build_object('changes',changes)));
 END LOOP;
 RETURN output;
END;
$function$;
REVOKE ALL ON FUNCTION public.transport_execute(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transport_execute(jsonb) TO service_role;
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261004120000', 'worker_sections');
COMMIT;
