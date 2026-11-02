import { assert, assertEquals } from "@std/assert";
import { checkRealm, realmAddress } from "./realm.ts";

Deno.test("a gateway reads as a place to connect, with Battle.net's port unless it says otherwise", () => {
  assertEquals(realmAddress("realm.example.com", null), { hostname: "realm.example.com", port: 6112 });
  assertEquals(realmAddress(" realm.example.com ", " "), { hostname: "realm.example.com", port: 6112 });
  assertEquals(realmAddress("realm.example.com", "6200"), { hostname: "realm.example.com", port: 6200 });
  assertEquals(realmAddress("realm.example.com:7000", "6200"), { hostname: "realm.example.com", port: 7000 });
  assertEquals(realmAddress("", null), null);
  assertEquals(realmAddress("two words", null), null);
  assertEquals(realmAddress("realm.example.com", "99999"), null);
  assertEquals(realmAddress("realm.example.com", "not a port"), null);
});

Deno.test("a listening server is reachable, and a closed port says why it is not", async () => {
  const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const port = (listener.addr as Deno.NetAddr).port;
  const accepted = listener.accept().then((connection) => connection.close());
  const open = await checkRealm({ hostname: "127.0.0.1", port });
  await accepted;
  listener.close();
  assertEquals(open.reachable, true);
  assertEquals(open.address, `127.0.0.1:${port}`);
  assertEquals(open.error, null);
  assertEquals(typeof open.milliseconds, "number");

  const closed = await checkRealm({ hostname: "127.0.0.1", port });
  assertEquals(closed.reachable, false);
  assertEquals(closed.milliseconds, null);
  assert(closed.error, "a failed check says why");
});
