const fs = require('fs');
const path = require('path');
const config = require('./config');
const { getGraph, traverse } = require('./graph');
const { Scanner } = require('./scanner/scanner');

function simulateBreakWithContext(request) {
  const { target = 'auth-service', property, newProperty } = request;
  const changeDescription = `rename ${property} to ${newProperty}`;
  
  const graph = getGraph();
  const traversal = traverse(target);
  const affectedNodes = traversal.visitedNodes;
  const pathData = traversal.path;

  // Filter historical PR invariants relevant to target or affected nodes
  const relevantInvariants = graph.prInvariants.filter(inv => affectedNodes.includes(inv.target));
  
  let relevantFiles = [];
  
  if (config.isValidRepo()) {
    const scanner = new Scanner(config.getRepoPath());
    const files = scanner.scan();
    
    if (files) {
      for (const file of files) {
        if (file.content.includes(property)) {
           // Basic line number detection
           const lines = file.content.split('\n');
           const occurrences = [];
           lines.forEach((line, index) => {
             if (line.includes(property)) {
               occurrences.push(index + 1);
             }
           });
           
           if (occurrences.length > 0) {
             relevantFiles.push({
               path: file.path,
               lines: occurrences,
               // Extract the node id from the path if possible (heuristic for demo)
               nodeId: affectedNodes.find(node => file.path.startsWith(node)) || 'unknown'
             });
           }
        }
      }
    }
  }

  // Build enhanced edge relationships for context
  const relationshipTypes = [];
  for (let i = 0; i < pathData.length - 1; i++) {
    const source = pathData[i];
    const target = pathData[i+1];
    const edge = graph.edges.find(e => e.source === source && e.target === target);
    if (edge) {
      relationshipTypes.push({
        source,
        target,
        type: edge.relationshipType || edge.type
      });
    }
  }

  return {
    target,
    change: changeDescription,
    affectedNodes,
    dependencyPath: pathData,
    relevantInvariants,
    relevantFiles,
    relationshipTypes
  };
}

module.exports = { simulateBreakWithContext };
