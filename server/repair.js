const { prInvariants } = require('./graph');

function generateRepair(targetNodeId, changeDescription) {
  // Demo hardcoded scenario
  return {
    detectedChange: "user_id → userId",
    affectedService: "Worker Service",
    dependencyPath: ["auth-service", "event-queue", "worker-service"],
    historicalInvariants: prInvariants.filter(inv => inv.target === 'worker-service' || inv.target === 'event-queue'),
    proposedRepair: "Update the consumer payload parsing to use `userId` while preserving the `schema_version` requirement from historical invariants.",
    diff: `--- a/demo-system/worker-service/index.js
+++ b/demo-system/worker-service/index.js
@@ -10,7 +10,7 @@
     return events.map(entry => {
       const payload = entry.payload || {};
-      const userId = payload.user_id;
+      const userId = payload.userId;
       const schemaVersion = payload.schema_version;`
  };
}

module.exports = {
  generateRepair
};
