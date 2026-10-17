


const releases = new Set();
export function onDocumentCacheRelease(release) { releases.add(release); }
export function releaseDocumentCaches(uid, last = false) { for (const release of releases) release(uid, last); }
