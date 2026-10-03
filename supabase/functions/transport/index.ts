import { createHandler } from './handler.ts';
const environment = Deno.env.toObject();
const handler = createHandler(environment, { waitUntil: promise => EdgeRuntime.waitUntil(promise) });
Deno.serve(handler);
