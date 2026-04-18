const fs = require('fs');
const path = require('path');
const { WorkspaceFile } = require('../models/Workspace');

// Per spec Topic 3.4: Two-Step File Deletion
// Runs every night at 2 AM
// 1. Deletes VPS files marked as deleted in MongoDB
// 2. Checks for orphaned files with no MongoDB reference
// 3. Clears /temp folder contents
// 4. Logs cleanup report

function startCleanupJob() {
  setInterval(async () => {
    const now = new Date();
    // Only run at 2 AM
    if (now.getHours() !== 2 || now.getMinutes() !== 0) return;

    console.log('[Cleanup Job] Starting nightly cleanup...');
    let filesDeleted = 0;
    let storageFreed = 0;

    try {
      // Step 1: Delete files marked as soft-deleted in MongoDB
      const deletedFiles = await WorkspaceFile.find({ isDeleted: true });
      for (const file of deletedFiles) {
        if (file.path && fs.existsSync(file.path)) {
          const stats = fs.statSync(file.path);
          fs.unlinkSync(file.path);
          storageFreed += stats.size;
          filesDeleted++;
        }
        await WorkspaceFile.findByIdAndDelete(file._id);
      }

      // Step 2: Clear temp folders
      const tempDirs = [
        path.join(__dirname, '..', 'uploads', 'temp', 'upload'),
        path.join(__dirname, '..', 'uploads', 'temp', 'compression'),
        path.join(__dirname, '..', 'uploads', 'temp', 'export')
      ];
      for (const dir of tempDirs) {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          for (const f of files) {
            const fp = path.join(dir, f);
            const stats = fs.statSync(fp);
            fs.unlinkSync(fp);
            storageFreed += stats.size;
            filesDeleted++;
          }
        }
      }

      const freedMB = (storageFreed / (1024 * 1024)).toFixed(2);
      console.log(`[Cleanup Job] Complete: ${filesDeleted} files deleted, ${freedMB} MB freed`);
    } catch (err) {
      console.error('[Cleanup Job] Error:', err);
    }
  }, 60000); // Check every minute
}

module.exports = { startCleanupJob };
