const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { createIsolatedWorkspace, cleanupIsolatedWorkspace, applyPatch, runValidation } = require('../runner');

describe('Runner Module', () => {
    const demoRepoPath = path.join(__dirname, '..', '..', 'demo-system');
    let workspacePath = null;

    afterEach(() => {
        if (workspacePath) {
            cleanupIsolatedWorkspace(workspacePath);
            workspacePath = null;
        }
    });

    test('isolated workspace creation and cleanup', () => {
        workspacePath = createIsolatedWorkspace(demoRepoPath);
        assert.strictEqual(fs.existsSync(workspacePath), true);
        assert.ok(workspacePath.includes('latentcode-repair-'));
        
        // Ensure original repository remains unchanged (basic check)
        assert.strictEqual(fs.existsSync(demoRepoPath), true);

        cleanupIsolatedWorkspace(workspacePath);
        assert.strictEqual(fs.existsSync(workspacePath), false);
        workspacePath = null;
    });

    test('real patch application against demo repository', () => {
        workspacePath = createIsolatedWorkspace(demoRepoPath);
        
        const targetFilePath = 'worker-service/index.js';
        const absoluteTargetPath = path.join(workspacePath, targetFilePath);
        
        const originalContent = fs.readFileSync(absoluteTargetPath, 'utf8');
        assert.ok(originalContent.includes('const userId = payload.user_id;'));
        assert.ok(originalContent.includes("const schemaVersion = payload.schema_version;"));

        const patchInfo = {
            detectedChange: 'user_id → userId',
            diff: 'dummy diff' // Not actually used by applyPatch logic currently
        };

        const result = applyPatch(workspacePath, targetFilePath, patchInfo);
        assert.strictEqual(result, true);

        const newContent = fs.readFileSync(absoluteTargetPath, 'utf8');
        assert.ok(newContent.includes('const userId = payload.userId;'));
        assert.ok(!newContent.includes('const userId = payload.user_id;'));
        assert.ok(newContent.includes("const schemaVersion = payload.schema_version;")); // schema_version untouched

        // Original repository unchanged
        const originalFileInRepo = fs.readFileSync(path.join(demoRepoPath, targetFilePath), 'utf8');
        assert.ok(originalFileInRepo.includes('const userId = payload.user_id;'));
    });

    test('validation success', () => {
        workspacePath = createIsolatedWorkspace(demoRepoPath);
        const targetFilePath = 'worker-service/index.js';
        const patchInfo = {
            detectedChange: 'user_id → userId',
            diff: 'dummy'
        };
        applyPatch(workspacePath, targetFilePath, patchInfo);
        
        // Ensure we copy or create package.json in worker-service to simulate tests passing 
        // if the demo system itself doesn't have tests that run at the root.
        // Actually, runValidation runs npm test at the root of the workspace. 
        // Let's create a dummy package.json at the workspace root to test validation.
        fs.writeFileSync(path.join(workspacePath, 'package.json'), JSON.stringify({
            scripts: {
                test: "echo 'Success'"
            }
        }));

        const result = runValidation(workspacePath, targetFilePath);
        assert.strictEqual(result.success, true);
        assert.ok(result.stdout.includes('Success'));
        assert.strictEqual(result.exitCode, 0);
    });

    test('validation failure', () => {
        workspacePath = createIsolatedWorkspace(demoRepoPath);
        fs.writeFileSync(path.join(workspacePath, 'package.json'), JSON.stringify({
            scripts: {
                test: "exit 1"
            }
        }));

        const result = runValidation(workspacePath, 'worker-service/index.js');
        assert.strictEqual(result.success, false);
        assert.strictEqual(result.exitCode, 1);
    });

    test('package.json in service dir', () => {
        workspacePath = createIsolatedWorkspace(demoRepoPath);
        // Remove root package.json if it was added
        if (fs.existsSync(path.join(workspacePath, 'package.json'))) {
             fs.unlinkSync(path.join(workspacePath, 'package.json'));
        }
        
        // Add one inside worker-service
        fs.writeFileSync(path.join(workspacePath, 'worker-service', 'package.json'), JSON.stringify({
            scripts: {
                test: "echo 'Service Success'"
            }
        }));

        const result = runValidation(workspacePath, 'worker-service/index.js');
        assert.strictEqual(result.success, true);
        assert.ok(result.stdout.includes('Service Success'));
        assert.strictEqual(result.cwd, 'worker-service');
        assert.strictEqual(result.exitCode, 0);
    });

    test('package.json resolved correctly for deep target path', () => {
         workspacePath = createIsolatedWorkspace(demoRepoPath);
         
         fs.mkdirSync(path.join(workspacePath, 'deep', 'nested', 'module'), { recursive: true });
         
         fs.writeFileSync(path.join(workspacePath, 'deep', 'nested', 'package.json'), JSON.stringify({
            scripts: {
                test: "echo 'Nested Success'"
            }
         }));
         
         const result = runValidation(workspacePath, 'deep/nested/module/index.js');
         assert.strictEqual(result.success, true);
         assert.strictEqual(result.cwd, 'deep/nested');
         assert.ok(result.stdout.includes('Nested Success'));
         assert.strictEqual(result.exitCode, 0);
    });

    test('invalid target paths being rejected safely', () => {
        workspacePath = createIsolatedWorkspace(demoRepoPath);
        
        const invalidPath = '../escape/attempt.js';
        const patchInfo = {
            detectedChange: 'a → b',
            diff: 'dummy'
        };

        assert.throws(() => {
            applyPatch(workspacePath, invalidPath, patchInfo);
        }, /escapes workspace/);
    });
});