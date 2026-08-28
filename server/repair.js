const { simulateBreak, prInvariants, nodes } = require('./graph');

function generateRepair(targetNodeId, changeDescription) {
  const simulation = simulateBreak(targetNodeId, changeDescription);
  
  // Try to find if 'worker-service' is affected since that's our demo scenario
  const workerServiceAffected = simulation.affectedNodes.includes('worker-service');
  
  if (workerServiceAffected && changeDescription.includes('user_id') && changeDescription.includes('userId')) {
    return {
      detectedChange: "user_id → userId",
      affectedService: "Worker Service",
      dependencyPath: simulation.dependencyPath,
      historicalInvariants: simulation.relevantInvariants,
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

  // Fallback for other scenarios
  const targetNode = nodes.find(n => n.id === targetNodeId) || { name: targetNodeId };
  
  return {
    detectedChange: changeDescription,
    affectedService: targetNode.name,
    dependencyPath: simulation.dependencyPath,
    historicalInvariants: simulation.relevantInvariants,
    proposedRepair: `Investigate and update ${simulation.affectedNodes.join(', ')} to accommodate the change in ${targetNode.name}.`,
    diff: `--- a/unknown
+++ b/unknown
@@ -1,1 +1,1 @@
- // Requires manual investigation
+ // Patch cannot be automatically generated for this scenario`
  };
}

module.exports = {
  generateRepair
};
