#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function getGitInfo() {
  try {
    const gitRef = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const gitShortRef = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    const gitTag = execSync('git describe --tags --exact-match 2>/dev/null || echo ""', { encoding: 'utf8' }).trim();
    const gitCommitMessage = execSync('git log -1 --pretty=%B', { encoding: 'utf8' }).trim();
    const gitCommitAuthor = execSync('git log -1 --pretty=%an', { encoding: 'utf8' }).trim();
    const gitCommitDate = execSync('git log -1 --pretty=%ci', { encoding: 'utf8' }).trim();
    const gitIsDirty = execSync('git diff --quiet || echo "dirty"', { encoding: 'utf8' }).trim();

    return {
      ref: gitRef,
      shortRef: gitShortRef,
      branch: gitBranch,
      tag: gitTag || null,
      commitMessage: gitCommitMessage,
      commitAuthor: gitCommitAuthor,
      commitDate: gitCommitDate,
      isDirty: gitIsDirty === 'dirty',
      buildTime: new Date().toISOString()
    };
  } catch (error) {
    console.warn('Warning: Could not get git information:', error.message);
    return {
      ref: 'unknown',
      shortRef: 'unknown',
      branch: 'unknown',
      tag: null,
      commitMessage: 'unknown',
      commitAuthor: 'unknown',
      commitDate: 'unknown',
      isDirty: false,
      buildTime: new Date().toISOString()
    };
  }
}

function generateBuildInfo() {
  const gitInfo = getGitInfo();

  const buildInfo = {
    git: gitInfo,
    version: process.env.npm_package_version || '1.0.0',
    buildNumber: process.env.BUILD_NUMBER || '1',
    environment: process.env.NODE_ENV || 'development'
  };

  // Write to a JSON file that can be imported by the app
  const buildInfoPath = path.join(__dirname, '..', 'build-info.json');
  fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2));

  // Also write environment variables for use in build scripts
  const envPath = path.join(__dirname, '..', '.env.build');
  const envContent = [
    `EXPO_PUBLIC_GIT_REF=${gitInfo.ref}`,
    `EXPO_PUBLIC_GIT_SHORT_REF=${gitInfo.shortRef}`,
    `EXPO_PUBLIC_GIT_BRANCH=${gitInfo.branch}`,
    `EXPO_PUBLIC_GIT_TAG=${gitInfo.tag || ''}`,
    `EXPO_PUBLIC_GIT_COMMIT_MESSAGE=${gitInfo.commitMessage.replace(/\n/g, ' ')}`,
    `EXPO_PUBLIC_GIT_COMMIT_AUTHOR=${gitInfo.commitAuthor}`,
    `EXPO_PUBLIC_GIT_COMMIT_DATE=${gitInfo.commitDate}`,
    `EXPO_PUBLIC_GIT_IS_DIRTY=${gitInfo.isDirty}`,
    `EXPO_PUBLIC_BUILD_TIME=${gitInfo.buildTime}`,
    `EXPO_PUBLIC_APP_VERSION=${buildInfo.version}`,
    `EXPO_PUBLIC_BUILD_NUMBER=${buildInfo.buildNumber}`
  ].join('\n');

  fs.writeFileSync(envPath, envContent);

  console.log('✅ Build info generated:');
  console.log(`   Git Ref: ${gitInfo.shortRef} (${gitInfo.branch})`);
  console.log(`   Commit: ${gitInfo.commitMessage.substring(0, 50)}...`);
  console.log(`   Author: ${gitInfo.commitAuthor}`);
  console.log(`   Build Time: ${gitInfo.buildTime}`);
  if (gitInfo.isDirty) {
    console.log('   ⚠️  Working directory has uncommitted changes');
  }

  return buildInfo;
}

if (require.main === module) {
  generateBuildInfo();
}

module.exports = { generateBuildInfo, getGitInfo };
