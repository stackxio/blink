export interface ConflictRegion {
  oursStart: number;
  divider: number;
  theirsEnd: number;
  oursFromLine: number;
  oursToLine: number;
  theirsFromLine: number;
  theirsToLine: number;
}

function getLines(text: string): string[] {
  return text.split(/\r?\n/);
}

export function findConflicts(text: string): ConflictRegion[] {
  const lines = getLines(text);
  const regions: ConflictRegion[] = [];
  let oursStart = -1;
  let divider = -1;

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i];
    if (line.startsWith("<<<<<<<")) {
      oursStart = lineNo;
      divider = -1;
    } else if (line.startsWith("=======") && oursStart !== -1) {
      divider = lineNo;
    } else if (line.startsWith(">>>>>>>") && oursStart !== -1 && divider !== -1) {
      regions.push({
        oursStart,
        divider,
        theirsEnd: lineNo,
        oursFromLine: oursStart + 1,
        oursToLine: divider - 1,
        theirsFromLine: divider + 1,
        theirsToLine: lineNo - 1,
      });
      oursStart = -1;
      divider = -1;
    }
  }

  return regions;
}
