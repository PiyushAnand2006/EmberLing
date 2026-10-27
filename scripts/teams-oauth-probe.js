// Probe Microsoft device-code flow with candidate public client ids + Graph
// chat scopes. The devicecode step pre-validates scope applicability for the
// client; a subsequent poll with a thrown-away device code shows the real
// error shapes (authorization_pending vs consent errors).
const CANDIDATES = [
  { name: "azure-cli", id: "04b07795-8ddb-461a-bbee-02f9e1bf7b46" },
  { name: "ms-teams-client", id: "1fec8e78-bce4-4aaf-ab1b-5451cc387264" },
  { name: "ms-office", id: "d3590ed6-52b3-4102-aeff-aad2292ab01c" },
];
const SCOPES = "User.Read Chat.ReadWrite ChatMessage.Send offline_access";
const AUTH = "https://login.microsoftonline.com/common";

async function main() {
  for (const c of CANDIDATES) {
    try {
      const res = await fetch(`${AUTH}/oauth2/v2.0/devicecode`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: c.id, scope: SCOPES }).toString(),
      });
      const j = await res.json();
      if (j.device_code) {
        console.log(`${c.name}: devicecode OK (user_code ${j.user_code})`);
        // immediately poll with this code once — expect authorization_pending
        const p = await fetch(`${AUTH}/oauth2/v2.0/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:device_code", client_id: c.id, device_code: j.device_code }).toString(),
        });
        const pj = await p.json();
        console.log(`  poll1: ${pj.error || "TOKEN!"} ${pj.error_description ? "(" + pj.error_description.slice(0, 90) + ")" : ""}`);
        // poll with a corrupted code — reveals invalid_grant shaping
        const p2 = await fetch(`${AUTH}/oauth2/v2.0/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:device_code", client_id: c.id, device_code: "bogus-" + j.device_code }).toString(),
        });
        const pj2 = await p2.json();
        console.log(`  poll-bogus: ${pj2.error}`);
      } else {
        console.log(`${c.name}: devicecode REJECTED ${j.error} — ${(j.error_description || "").slice(0, 140)}`);
      }
    } catch (e) {
      console.log(`${c.name}: request failed ${e.message}`);
    }
  }
}
main();
