const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

function createIsolatedWorkspace(repoPath) {
    if (!fs.existsSync(repoPath)) {
        throw new Error(`Repository path does not exist: ${repoPath}`);
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'latentcode-repair-'));
    
    // Copy the repository to the temporary directory. 
    // We ignore node_modules to make copying faster, as we will run npm install or rely on existing deps if applicable.
    // For demo repo (demo-system), we can just copy it directly.
    try {
        // Simple recursive copy (fine for demo repos, consider rsync or similar for large real repos)
        fs.cpSync(repoPath, tempDir, { recursive: true, force: true, filter: (src) => !src.includes('node_modules') && !src.includes('.git') });
    } catch (e) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        throw new Error(`Failed to copy repository to isolated workspace: ${e.message}`);
    }

    return tempDir;
}

function cleanupIsolatedWorkspace(workspacePath) {
    if (workspacePath && fs.existsSync(workspacePath) && workspacePath.includes('latentcode-repair-')) {
        try {
            fs.rmSync(workspacePath, { recursive: true, force: true });
        } catch (e) {
            console.error(`Failed to clean up isolated workspace at ${workspacePath}: ${e.message}`);
        }
    }
}

function applyPatch(workspacePath, targetFilePath, patchInfo) {
    // Basic patch application for simple replacements
    const { detectedChange, diff } = patchInfo;
    
    // Safety check: ensure target file is within workspace
    const absoluteTargetPath = path.resolve(workspacePath, targetFilePath);
    if (!absoluteTargetPath.startsWith(workspacePath)) {
        throw new Error('Invalid target path: escapes workspace');
    }

    if (!fs.existsSync(absoluteTargetPath)) {
        throw new Error(`Target file not found in workspace: ${targetFilePath}`);
    }

    // Extract old and new properties
    let oldProp, newProp;
    const changeMatch = detectedChange.match(/([\w_]+) → ([\w_]+)/);
    if (changeMatch) {
        oldProp = changeMatch[1];
        newProp = changeMatch[2];
    } else {
        throw new Error('Failed to parse change properties from patch info');
    }

    let fileContent = fs.readFileSync(absoluteTargetPath, 'utf8');

    // Verify expected content is present
    if (!fileContent.includes(oldProp)) {
        throw new Error(`Original content '${oldProp}' not found in target file. File may have changed.`);
    }

    // Simple replacement (replace user_id with userId for demo)
    // The diff in the generateRepair shows exact line replacement. We'll simulate that for reliability.
    fileContent = fileContent.replace(new RegExp(oldProp, 'g'), newProp);

    // Verify schema_version is untouched (if relevant to our demo)
    if (detectedChange.includes('user_id') && !fileContent.includes('schema_version')) {
        throw new Error(`Safety invariant violation: schema_version was removed.`);
    }

    fs.writeFileSync(absoluteTargetPath, fileContent, 'utf8');
    return true;
}

function runValidation(workspacePath, targetFilePath) {
    let validationCwd = workspacePath;
    let testCommand = 'npm test';

    if (targetFilePath) {
        let currentDir = path.dirname(path.resolve(workspacePath, targetFilePath));
        let found = false;

        // Walk upward looking for package.json
        while (currentDir.length >= workspacePath.length && currentDir.startsWith(workspacePath)) {
            if (fs.existsSync(path.join(currentDir, 'package.json'))) {
                validationCwd = currentDir;
                found = true;
                break;
            }
            if (currentDir === workspacePath) break;
            currentDir = path.dirname(currentDir);
        }

        // If not found by walking up, check top-level module directory
        if (!found) {
            const relativeTarget = path.relative(workspacePath, path.resolve(workspacePath, targetFilePath));
            const parts = relativeTarget.split(path.sep);
            if (parts.length > 1) {
                const moduleDir = path.join(workspacePath, parts[0]);
                if (fs.existsSync(path.join(moduleDir, 'package.json'))) {
                    validationCwd = moduleDir;
                    found = true;
                }
            }
        }
        
        if (!found && !fs.existsSync(path.join(workspacePath, 'package.json'))) {
             return {
                success: false,
                error: 'Could not find a package.json to run tests',
                stderr: 'No usable package.json could be found along the target file path or at the workspace root.',
                exitCode: -1
             };
        }
    }

    // Try to determine test command from package.json if it exists
    const packageJsonPath = path.join(validationCwd, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            if (pkg.scripts && pkg.scripts.test) {
                // We'll use npm test as standard
            }
        } catch (e) {
            // Ignore parse errors, fallback to npm test
        }
    }

    try {
    // Run npm install first to ensure dependencies are present in temp dir if needed
    // For the demo system, it might just be vanilla js, but safe to try install if package.json exists
    if (fs.existsSync(packageJsonPath)) {
        execSync('npm install --production=false', { cwd: validationCwd, stdio: 'ignore', timeout: 30000 });
    }

    const output = execSync(testCommand, { 
        cwd: validationCwd, 
        timeout: 10000, // 10s timeout
        encoding: 'utf8' 
    });

    return {
        success: true,
        commandRan: testCommand,
        cwd: path.relative(workspacePath, validationCwd),
        stdout: output,
        stderr: '',
        exitCode: 0
    };
} catch (error) {
    return {
        success: false,
        commandRan: testCommand,
        cwd: path.relative(workspacePath, validationCwd),
        stdout: error.stdout ? error.stdout.toString() : '',
        stderr: error.stderr ? error.stderr.toString() : error.message,
        exitCode: error.status || 1
    };
}
}

module.exports = {
    createIsolatedWorkspace,
    cleanupIsolatedWorkspace,
    applyPatch,
    runValidation
};