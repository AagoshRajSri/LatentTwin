const path = require('path');
const fs = require('fs');

class Config {
  constructor() {
    this.repoPath = process.env.REPO_PATH || path.resolve(__dirname, '../demo-system');
    
    // Resolve any non-absolute path from the project root
    if (!path.isAbsolute(this.repoPath)) {
      this.repoPath = path.resolve(process.cwd(), this.repoPath);
    }
  }

  getRepoPath() {
    return this.repoPath;
  }

  isValidRepo() {
    try {
      const stats = fs.statSync(this.repoPath);
      return stats.isDirectory();
    } catch (e) {
      return false;
    }
  }
}

module.exports = new Config();
