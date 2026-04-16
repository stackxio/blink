import type { ToolDef } from "./panel/tools";

import { read_file, def as read_file_def } from "./tools/read_file";
import { write_file, def as write_file_def } from "./tools/write_file";
import { list_dir, def as list_dir_def } from "./tools/list_dir";
import { run_command, def as run_command_def } from "./tools/run_command";
import { search_files, def as search_files_def } from "./tools/search_files";
import { glob_files, def as glob_files_def } from "./tools/glob_files";
import { edit_file, def as edit_file_def } from "./tools/edit_file";
import { create_dir, def as create_dir_def } from "./tools/create_dir";
import { delete_file, def as delete_file_def } from "./tools/delete_file";
import { move_file, def as move_file_def } from "./tools/move_file";
import { git_status, def as git_status_def } from "./tools/git_status";
import { git_diff, def as git_diff_def } from "./tools/git_diff";
import { git_log, def as git_log_def } from "./tools/git_log";
import { file_tree, def as file_tree_def } from "./tools/file_tree";
import { git_commit, def as git_commit_def } from "./tools/git_commit";
import { find_in_workspace, def as find_in_workspace_def } from "./tools/find_in_workspace";
import { web_search, def as web_search_def, setApiKey } from "./tools/web_search";

function tool(
  def: Record<string, unknown>,
  fn: (input: Record<string, unknown>) => Promise<string>,
): ToolDef {
  return { ...(def as Omit<ToolDef, "execute">), execute: fn };
}

export function buildTools(config?: { braveSearchApiKey?: string }): ToolDef[] {
  setApiKey(config?.braveSearchApiKey ?? "");

  return [
    tool(read_file_def, read_file),
    tool(write_file_def, write_file),
    tool(list_dir_def, list_dir),
    tool(run_command_def, run_command),
    tool(search_files_def, search_files),
    tool(glob_files_def, glob_files),
    tool(edit_file_def, edit_file),
    tool(create_dir_def, create_dir),
    tool(delete_file_def, delete_file),
    tool(move_file_def, move_file),
    tool(git_status_def, git_status),
    tool(git_diff_def, git_diff),
    tool(git_log_def, git_log),
    tool(file_tree_def, file_tree),
    tool(git_commit_def, git_commit),
    tool(find_in_workspace_def, find_in_workspace),
    tool(web_search_def, web_search),
  ];
}
