export type GitChangeType = "added" | "modified";
export type GitChanges = Map<number, GitChangeType>;

/**
 * Parse a unified diff and return a map of line number -> change type
 * for the new version of the file.
 */
export function parseDiff(diff: string): GitChanges {
  const changes: GitChanges = new Map();
  if (!diff || diff.trim() === "(new file)") {
    return changes;
  }

  const lines = diff.split("\n");
  let newLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("@@")) {
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
      if (match) {
        newLine = parseInt(match[1], 10) - 1;
      }
      continue;
    }

    if (
      line.startsWith("---") ||
      line.startsWith("+++") ||
      line.startsWith("diff ") ||
      line.startsWith("index ")
    ) {
      continue;
    }

    if (line.startsWith("+")) {
      newLine++;
      let hasNearbyDeletion = false;
      for (let j = Math.max(0, i - 8); j < i; j++) {
        if (lines[j].startsWith("-") && !lines[j].startsWith("---")) {
          hasNearbyDeletion = true;
          break;
        }
      }
      changes.set(newLine, hasNearbyDeletion ? "modified" : "added");
    } else if (line.startsWith("-")) {
      // Deletion — don't advance the new document line counter.
    } else if (!line.startsWith("\\")) {
      newLine++;
    }
  }

  return changes;
}
