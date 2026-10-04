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
-- Generated evening and weekly-shift upgrade. Preserves existing company data.
SET search_path = transport_private, pg_catalog;
ALTER TABLE routes ADD service text NOT NULL DEFAULT 'morning' CHECK (service IN ('morning','evening'));
ALTER TABLE buses ADD night_route_id text;
ALTER TABLE trips ADD service text NOT NULL DEFAULT 'morning' CHECK (service IN ('morning','evening'));
ALTER TABLE route_recordings ADD service text NOT NULL DEFAULT 'morning' CHECK (service IN ('morning','evening'));
CREATE TABLE homes (user_id text PRIMARY KEY, name text NOT NULL, lat double precision NOT NULL, lng double precision NOT NULL, radius bigint NOT NULL, email_arrival bigint NOT NULL, updated_at bigint NOT NULL);
CREATE TABLE weekly_shifts (id text PRIMARY KEY, user_id text NOT NULL, date text NOT NULL, name text NOT NULL, email text NOT NULL, shift_label text NOT NULL, on_shift bigint NOT NULL, morning bigint NOT NULL, evening bigint NOT NULL, submitted_at bigint NOT NULL);
CREATE UNIQUE INDEX idx_weekly_user_date ON weekly_shifts(user_id,date);
CREATE TABLE night_bookings (id text PRIMARY KEY, user_id text NOT NULL, date text NOT NULL, bus_id text NOT NULL, route_id text NOT NULL, on_shift bigint NOT NULL, name text NOT NULL, lat double precision NOT NULL, lng double precision NOT NULL, radius bigint NOT NULL, email_arrival bigint NOT NULL);
CREATE UNIQUE INDEX idx_night_user_date ON night_bookings(user_id,date);
CREATE INDEX idx_night_bus_date ON night_bookings(bus_id,date);
CREATE TABLE trip_points (id text PRIMARY KEY, trip_id text NOT NULL, driver_id text NOT NULL, driver_epoch bigint NOT NULL, lat double precision NOT NULL, lng double precision NOT NULL, accuracy double precision NOT NULL, captured_at bigint NOT NULL);
CREATE INDEX idx_trip_points ON trip_points(trip_id,captured_at);
CREATE TABLE night_deliveries (trip_id text NOT NULL,user_id text NOT NULL,delivered_at bigint NOT NULL,PRIMARY KEY(trip_id,user_id));

ALTER TABLE homes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON homes FROM PUBLIC, anon, authenticated;

ALTER TABLE weekly_shifts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON weekly_shifts FROM PUBLIC, anon, authenticated;

ALTER TABLE night_bookings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON night_bookings FROM PUBLIC, anon, authenticated;

ALTER TABLE trip_points ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON trip_points FROM PUBLIC, anon, authenticated;

ALTER TABLE night_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON night_deliveries FROM PUBLIC, anon, authenticated;
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
   WHEN '05faa95e7ba65c3c0deebe0b6a2e591783e4190d87d81abcba0b830ecb418c47' THEN 'SELECT * FROM trips WHERE status=?'
   WHEN 'de2c00b8020071536627514c3251c3283502ff30f44a8e5eab332bbb726e2276' THEN 'UPDATE trips SET status=? WHERE id=? AND status=? AND driver_epoch=?'
   WHEN '981c940a34df99430ed12cda369f3b204d4081687a6ec6bfa0fe3d3bc270dba0' THEN 'SELECT n.*,m.email,d.delivered_at FROM night_bookings n JOIN members m ON m.user_id=n.user_id LEFT JOIN night_deliveries d ON d.trip_id=? AND d.user_id=n.user_id WHERE n.bus_id=? AND n.route_id=? AND n.date=? AND n.on_shift=1 AND m.role=?'
   WHEN '90e46a515ff0842c969c55ffdd3de440bde4c334b7de1249093f124d745828d9' THEN 'SELECT * FROM homes WHERE user_id=?'
   WHEN '34ea3ee275afc0862ade9539cd7e4570f01be001d3ea628a4526d85b76795d48' THEN 'SELECT * FROM weekly_shifts WHERE user_id=? AND date>=? AND date<=? ORDER BY date'
   WHEN 'b633ab852408905c65c7352e27664068da702c074602df3af9969072b2ecc802' THEN 'SELECT value FROM settings WHERE id=?'
   WHEN 'd7c488b38b32eaff86b240390fbbc8e775b558bbe35c303f4532937536961c86' THEN 'SELECT * FROM trips ORDER BY started_at DESC LIMIT 30'
   WHEN '4f319aee1ce629a664cc2fea67f3bd7d6361b694eafba75b4116862362de0f78' THEN 'INSERT INTO routes (id,name,color,stops,service) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,color=excluded.color,stops=excluded.stops,service=excluded.service,revision=routes.revision+1'
   WHEN '3beda1066a6aa694dae36c0e650a46590d1eb0710c0822f0e7fb5acb1f21c34a' THEN 'INSERT INTO buses (id,name,plate,route_id,night_route_id) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,plate=excluded.plate,route_id=excluded.route_id,night_route_id=excluded.night_route_id'
   WHEN '81ae1a79a909e5de1479504bf74b05b9a92d7f307c628b468db65fea87153479' THEN 'SELECT email FROM members WHERE email=? AND role IN (''driver'',''admin'')'
   WHEN '15381cfa9c5fa8f2db17735996e58c6e63bb7379e434c4206a9238f44abaa4a0' THEN 'SELECT id FROM trips WHERE service=? AND status=?'
   WHEN 'd1c8156218a0f25f0f89c9fc35b10581ea4d272cff494236d9d2b273ee6451d3' THEN 'INSERT INTO settings (id,value) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value'
   WHEN 'e3acea0e4166cf680cfd8a52dda00d55e030714694eb262a6e8a9da77e27a0c7' THEN 'INSERT INTO trips (id,bus_id,route_id,driver_id,driver_name,date,status,test,next_stop,started_at,service) VALUES (?,?,?,?,?,?,?,?,0,?,?)'
   WHEN '069aadfd1b70dcf5e9e06c308439c7cb4442ee0084ad591bfb76007e0ebe97df' THEN 'INSERT INTO trip_points (id,trip_id,driver_id,driver_epoch,lat,lng,accuracy,captured_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM trips WHERE id=? AND driver_id=? AND status=? AND driver_epoch=? AND handover_email IS NULL)'
   WHEN 'bd40aeb1127d08d6ade774fb9ca961ba4b013f7ccedc00039dfe19568803a2a4' THEN 'SELECT id FROM night_bookings WHERE user_id=? AND bus_id=? AND route_id=? AND date=? AND on_shift=1'
   WHEN '3cf0480bf1b45b20c92113d081618fd3badbaf404daf1aaa7660135de8a1236f' THEN 'SELECT delivered_at FROM night_deliveries WHERE trip_id=? AND user_id=?'
   WHEN '95cd47d511105dde713ddff690872d90cb33d21a686e23d16638df965a46e0b2' THEN 'INSERT INTO night_deliveries (trip_id,user_id,delivered_at) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM trips WHERE id=? AND driver_id=? AND status=? AND driver_epoch=? AND handover_email IS NULL) ON CONFLICT DO NOTHING'
   WHEN '4b926b3da8fd7936b2bcbd1da37411a69d1c6aa5dd20688f96ed15364f33ff5e' THEN 'SELECT user_id FROM night_bookings WHERE bus_id=? AND route_id=? AND date=? AND on_shift=1'
   WHEN '4b0003dcacc06ef9918fe79ceab51f9202ef40b7994edacff9b4236aba1878cf' THEN 'INSERT INTO route_recordings (id,owner_id,name,status,created_at,updated_at,service) VALUES (?,?,?,?,?,?,?)'
   WHEN '800ec842f82723c6d733f890e3be00195996f48c022667f27a7f3287e559442e' THEN 'INSERT INTO routes (id,name,color,stops,path,recorded,service) SELECT ?,?,?,?,?,1,? WHERE EXISTS (SELECT 1 FROM route_recordings WHERE id=? AND owner_id=? AND status=?) ON CONFLICT DO NOTHING'
   WHEN '957af2c4756609911cf954c517e8c5422ec09c713c67bcf83f3cb36e643e40b9' THEN 'SELECT service FROM trips WHERE id=?'
   WHEN 'a3e492019af52b30665c9e5ad4661b6a57cfc650766874355b43b10f4cdca31d' THEN 'SELECT m.email FROM members m JOIN night_bookings n ON n.user_id=m.user_id JOIN trips t ON t.id=? WHERE m.user_id=? AND n.date=t.date AND n.bus_id=t.bus_id AND n.route_id=t.route_id AND n.on_shift=1 AND n.email_arrival=1 AND m.role=?'
   WHEN '932e8bd195ab4dbd70eaf854319dc9bf42576c29bd79b5a571ac68c2d1b2d76b' THEN 'SELECT n.*,coalesce(w.name,m.name) AS worker_name,w.shift_label,m.email,m.section,d.delivered_at FROM night_bookings n JOIN members m ON m.user_id=n.user_id LEFT JOIN weekly_shifts w ON w.user_id=n.user_id AND w.date=n.date LEFT JOIN night_deliveries d ON d.trip_id=? AND d.user_id=n.user_id WHERE n.bus_id=? AND n.route_id=? AND n.date=? AND n.on_shift=1 AND m.role=? ORDER BY m.name'
   WHEN 'f8c2913a735272249e8914f3c01573d3d05bba1f9ca173ffb3b5b7a80446b38e' THEN 'SELECT s.*,coalesce(w.name,m.name) AS name,w.shift_label,m.email,m.section FROM shifts s JOIN members m ON m.user_id=s.user_id LEFT JOIN weekly_shifts w ON w.user_id=s.user_id AND w.date=s.date WHERE s.bus_id=? AND s.route_id=? AND s.date=? AND s.on_shift=1 AND m.role=? ORDER BY s.route_offset,m.name'
   WHEN '51cc974562ca8f5a5aabb1c0ed2cb5bcff4f384d9d168ea3b0908ff0c43341fa' THEN 'INSERT INTO homes (user_id,name,lat,lng,radius,email_arrival,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,lat=excluded.lat,lng=excluded.lng,radius=excluded.radius,email_arrival=excluded.email_arrival,updated_at=excluded.updated_at'
   WHEN '3330935587572b2e7c1611cbd0437ec5fba6902b73c16ff12d73bff819e6094f' THEN 'SELECT * FROM routes WHERE id=?'
   WHEN '95a7bcf15dc37031b1fb17978241b9bae26a29214b595198525a883031ec6d9f' THEN 'INSERT INTO weekly_shifts (id,user_id,date,name,email,shift_label,on_shift,morning,evening,submitted_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,date) DO UPDATE SET name=excluded.name,email=excluded.email,shift_label=excluded.shift_label,on_shift=excluded.on_shift,morning=excluded.morning,evening=excluded.evening,submitted_at=excluded.submitted_at'
   WHEN 'bcae2226879d13203e63a8a06edb52d6439b0daddacaccc0cc90a157b57b767e' THEN 'UPDATE shifts SET on_shift=0 WHERE user_id=? AND date=?'
   WHEN '51f34870893b55008d08f488b7e61a9bbd0a2d9111327f2ca551d947613cc43a' THEN 'INSERT INTO night_bookings (id,user_id,date,bus_id,route_id,on_shift,name,lat,lng,radius,email_arrival) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,date) DO UPDATE SET bus_id=excluded.bus_id,route_id=excluded.route_id,on_shift=excluded.on_shift,name=excluded.name,lat=excluded.lat,lng=excluded.lng,radius=excluded.radius,email_arrival=excluded.email_arrival'
   WHEN 'a8e527e894858658864f7b1da83bd2be1f0914a38cdc9f123086269c83cd7289' THEN 'UPDATE night_bookings SET on_shift=0 WHERE user_id=? AND date=?'
   WHEN '7361f7e9df173c2a14fd0e043378486cc21a5f8036a23ed724a2c6b073ad9812' THEN 'SELECT w.*,m.section FROM weekly_shifts w JOIN members m ON m.user_id=w.user_id WHERE w.date>=? AND w.date<=? ORDER BY w.date,w.name'
   WHEN 'ee1655793552f45bcad788225e8ae5414fc4c8bb6286a21fa40874fab9695ee3' THEN 'SELECT lat,lng,accuracy,captured_at FROM trip_points WHERE trip_id=? ORDER BY captured_at LIMIT 10000'
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
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261004173000', 'evening_weekly');
-- Expand worker departments while preserving approved members and worker-only sections.
ALTER TABLE transport_private.members DROP CONSTRAINT IF EXISTS members_section_check;
ALTER TABLE transport_private.members ADD CONSTRAINT valid_worker_section CHECK (
 section IS NULL OR (role = 'worker' AND section IN ('Flightops','Fulops','CCA','Office & Support Staff'))
);
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261004182000', 'office_support');
COMMIT;
