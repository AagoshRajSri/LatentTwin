const { simulateBreak, prInvariants, nodes } = require('./graph');
const { simulateBreakWithContext } = require('./simulate');
const config = require('./config');
const fs = require('fs');
const path = require('path');

function generateDiff(filePath, originalContent, oldProperty, newProperty) {
  // Simple diff generator for single property replacement
  const lines = originalContent.split('\n');
  const diffLines = [];
  const normalizedPath = filePath.replace(/\\/g, '/');
  diffLines.push(`--- a/${normalizedPath}`);
  diffLines.push(`+++ b/${normalizedPath}`);
  
  let changeCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes(oldProperty)) {
      // Find window of context
      const start = Math.max(0, i - 2);
      const end = Math.min(lines.length - 1, i + 2);
      
      diffLines.push(`@@ -${start + 1},${end - start + 1} +${start + 1},${end - start + 1} @@`);
      
      for (let j = start; j <= end; j++) {
        if (j === i) {
          diffLines.push(`-${lines[j]}`);
          diffLines.push(`+${lines[j].replace(new RegExp(oldProperty, 'g'), newProperty)}`);
          changeCount++;
        } else {
          diffLines.push(` ${lines[j]}`);
        }
      }
    }
  }
  
  if (changeCount === 0) return null;
  return diffLines.join('\n');
}

function generateRepair(targetNodeId, changeDescription) {
  let propertyMatch = changeDescription.match(/rename\s+(\w+)\s+to\s+(\w+)/i);
  let oldProp = 'user_id';
  let newProp = 'userId';
  
  if (propertyMatch) {
    oldProp = propertyMatch[1];
    newProp = propertyMatch[2];
  }
  
  // Try to use real files if configured
  if (config.isValidRepo()) {
    const simulation = simulateBreakWithContext({ 
      target: targetNodeId, 
      property: oldProp, 
      newProperty: newProp 
    });
    
    // Find worker service in relevant files
    const workerFileMatch = simulation.relevantFiles.find(f => f.path.includes('worker-service') || f.nodeId === 'worker-service');
    
    if (workerFileMatch) {
      try {
        const absolutePath = path.join(config.getRepoPath(), workerFileMatch.path);
        const content = fs.readFileSync(absolutePath, 'utf8');
        
        const diff = generateDiff(workerFileMatch.path, content, oldProp, newProp);
        
        if (diff) {
          return {
            detectedChange: `${oldProp} → ${newProp}`,
            affectedService: "Worker Service",
            dependencyPath: simulation.dependencyPath,
            historicalInvariants: simulation.relevantInvariants,
            proposedRepair: `Update the consumer payload parsing in ${workerFileMatch.path} to use \`${newProp}\` while preserving the \`schema_version\` requirement from historical invariants.`,
            diff: diff,
            targetFilePath: workerFileMatch.path,
            invariantMatch: simulation.relevantInvariants.length > 0 ? true : false
          };
        }
      } catch (err) {
        console.error("Error generating dynamic diff:", err);
      }
    }
  }

  // Fallback to static demo behavior
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
