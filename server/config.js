const path = require('path');
const fs = require('fs');

class Config {
  constructor() {
    this.repoPath = process.env.REPO_PATH || path.resolve(__dirname, '../demo-system');
    
    // Resolve relative paths from project root if passed in via env
    if (this.repoPath.startsWith('./') || this.repoPath.startsWith('../')) {
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
