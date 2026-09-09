const { simulateBreak, prInvariants, nodes } = require('./graph');
const { simulateBreakWithContext } = require('./simulate');
const config = require('./config');
const fs = require('fs');
const path = require('path');

function generateDiff(filePath, originalContent, oldProperty, newProperty) {
  // Simple diff generator for single property replacement
  const lines = originalContent.split('\n');
  const normalizedPath = filePath.replace(/\\/g, '/');
  const header = [`--- a/${normalizedPath}`, `+++ b/${normalizedPath}`];

  // Escape special regex characters in oldProperty to avoid regex injection
  const escapedOldProp = oldProperty.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escapedOldProp, 'g');

  // Collect changed line indices
  const changedIndices = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(oldProperty)) changedIndices.push(i);
  }
  if (changedIndices.length === 0) return null;

  // Merge indices into non-overlapping windows (context = 2 lines either side)
  const CONTEXT = 2;
  const hunks = [];
  let hunkStart = Math.max(0, changedIndices[0] - CONTEXT);
  let hunkEnd = Math.min(lines.length - 1, changedIndices[0] + CONTEXT);
  let hunkChanges = [changedIndices[0]];

  for (let k = 1; k < changedIndices.length; k++) {
    const windowStart = Math.max(0, changedIndices[k] - CONTEXT);
    if (windowStart <= hunkEnd + 1) {
      // Windows overlap — extend the current hunk
      hunkEnd = Math.min(lines.length - 1, changedIndices[k] + CONTEXT);
      hunkChanges.push(changedIndices[k]);
    } else {
      hunks.push({ start: hunkStart, end: hunkEnd, changes: hunkChanges });
      hunkStart = windowStart;
      hunkEnd = Math.min(lines.length - 1, changedIndices[k] + CONTEXT);
      hunkChanges = [changedIndices[k]];
    }
  }
  hunks.push({ start: hunkStart, end: hunkEnd, changes: hunkChanges });

  const diffLines = [...header];
  for (const hunk of hunks) {
    const count = hunk.end - hunk.start + 1;
    diffLines.push(`@@ -${hunk.start + 1},${count} +${hunk.start + 1},${count} @@`);
    const changeSet = new Set(hunk.changes);
    for (let j = hunk.start; j <= hunk.end; j++) {
      if (changeSet.has(j)) {
        diffLines.push(`-${lines[j]}`);
        diffLines.push(`+${lines[j].replace(re, newProperty)}`);
      } else {
        diffLines.push(` ${lines[j]}`);
      }
    }
  }

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
