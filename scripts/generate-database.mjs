import ts from 'typescript';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const normalize=sql=>sql.trim().replace(/\s+/g,' ');
// The installed baseline stays unchanged. Upgrades preserve its reviewed operations
// so a database update also works with the previous backend during rollout.
const baselineFile=root+'/supabase/migrations/20261003200000_transport.sql';
const baseline=await readFile(baselineFile,'utf8');
const baselineQueries=new Map([...baseline.matchAll(/   WHEN '([a-f0-9]{64})' THEN '((?:[^']|'')*)'\n/g)].map(match=>[match[1],match[2].replaceAll("''","'")]));
if(baselineQueries.size!==66)throw new Error('Unexpected baseline operation registry.');
const queries=new Map();
for(const filename of ['api.ts','recordings.ts','email.ts','service.ts']){
 const source=ts.createSourceFile(filename,await readFile(root+'/supabase/functions/transport/core/'+filename,'utf8'),ts.ScriptTarget.Latest,true);
 const constants=new Map();
 function literal(node){if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))return node.text;if(ts.isIdentifier(node)&&constants.has(node.text))return constants.get(node.text);if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.PlusToken)return literal(node.left)+literal(node.right);throw new Error('Database query must be a static string: '+node.getText(source));}
 function collect(node){if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer){try{constants.set(node.name.text,literal(node.initializer));}catch{}}ts.forEachChild(node,collect);}collect(source);
 function visit(node){if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='prepare'){const sql=normalize(literal(node.arguments[0]));queries.set(createHash('sha256').update(sql).digest('hex'),sql);}ts.forEachChild(node,visit);}visit(source);
}
const quote=value=>"'"+value.replaceAll("'","''")+"'";
let sql='-- Generated from the reviewed backend queries by scripts/generate-database.mjs.\n-- All tables are private. Browser roles have no access; only the verified Edge Function can call this RPC.\nCREATE SCHEMA transport_private;\nREVOKE ALL ON SCHEMA transport_private FROM PUBLIC, anon, authenticated;\nSET search_path = transport_private, pg_catalog;\n';
for(const name of (await readdir(root+'/scripts/fixtures')).filter(f=>/^000[0-3]_.*\.sql$/.test(f)).sort()){
 let fixture=await readFile(root+'/scripts/fixtures/'+name,'utf8');
 fixture=fixture.replaceAll('--> statement-breakpoint','\n').replaceAll('`','"').replace(/\binteger\b/g,'bigint').replace(/\breal\b/g,'double precision');
 sql+=fixture+'\n';
}
const tables=['settings','members','routes','buses','trips','shifts','pickups','route_recordings','alerts','subscriptions'];
for(const table of tables)sql+=`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;\nREVOKE ALL ON ${table} FROM PUBLIC, anon, authenticated;\n`;
sql+='ALTER TABLE buses ADD CONSTRAINT bus_single_slot CHECK (slot = 1);\nALTER TABLE members ADD CONSTRAINT valid_member_role CHECK (role IN (\'admin\',\'driver\',\'worker\'));\nCREATE UNIQUE INDEX idx_member_user ON members(user_id) WHERE user_id IS NOT NULL;\nRESET search_path;\n';
const schema=sql;
function registry(operations){let sql=`CREATE OR REPLACE FUNCTION public.transport_execute(operations jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = transport_private, pg_catalog
AS $function$
DECLARE op jsonb; args jsonb; template text; rendered text; segments text[]; arg jsonb; output jsonb := '[]'::jsonb; rows jsonb; changes bigint; i integer;
BEGIN
 IF jsonb_typeof(operations) <> 'array' OR jsonb_array_length(operations) > 500 THEN RAISE EXCEPTION 'Invalid operations'; END IF;
 FOR op IN SELECT value FROM jsonb_array_elements(operations) LOOP
  args := op->'args';
  template := CASE op->>'id'\n`;
for(const [hash, query] of operations)sql+=`   WHEN '${hash}' THEN ${quote(query)}\n`;
sql+=`   ELSE NULL END;
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
`;
return sql;}
if(schema+registry(baselineQueries)!==baseline)throw new Error('The installed baseline schema must stay unchanged; add a new migration.');
const previous=await readFile(root+'/supabase/migrations/20261004120000_worker_sections.sql','utf8');
const operations=new Map([...previous.matchAll(/   WHEN '([a-f0-9]{64})' THEN '((?:[^']|'')*)'\n/g)].map(match=>[match[1],match[2].replaceAll("''","'")]));
for(const [hash,query] of queries){let pg=query.replace(/^INSERT OR IGNORE INTO /,'INSERT INTO ');if(query.startsWith('INSERT OR IGNORE'))pg+=' ON CONFLICT DO NOTHING';operations.set(hash,pg);}
let fixture=(await readFile(root+'/scripts/fixtures/0005_evening_weekly.sql','utf8')).replaceAll('`','"').replace(/\binteger\b/g,'bigint').replace(/\breal\b/g,'double precision');
for(const table of ['homes','weekly_shifts','night_bookings','trip_points','night_deliveries'])fixture+=`\nALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;\nREVOKE ALL ON ${table} FROM PUBLIC, anon, authenticated;\n`;
const upgrade='-- Generated evening and weekly-shift upgrade. Preserves existing company data.\nSET search_path = transport_private, pg_catalog;\n'+fixture+'RESET search_path;\n'+registry(operations);
const file=root+'/supabase/migrations/20261004173000_evening_weekly.sql';
if(process.argv.includes('--check')){if(await readFile(file,'utf8')!==upgrade)throw new Error('Migration query registry is out of date; run node scripts/generate-database.mjs.');}else await writeFile(file,upgrade);
console.log('Verified',queries.size,'current fixed server operations and immutable previous migrations.');
