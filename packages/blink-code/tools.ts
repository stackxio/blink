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
import { read_url, def as read_url_def } from "./tools/read_url";
import { http_request, def as http_request_def } from "./tools/http_request";
import { run_tests, def as run_tests_def } from "./tools/run_tests";
import { get_env, def as get_env_def } from "./tools/get_env";
import { diff_files, def as diff_files_def } from "./tools/diff_files";
import { workspace_symbol_search, def as workspace_symbol_search_def } from "./tools/workspace_symbol_search";
import { list_npm_scripts, def as list_npm_scripts_def } from "./tools/list_npm_scripts";
import { get_file_outline, def as get_file_outline_def } from "./tools/get_file_outline";
import { count_tokens, def as count_tokens_def } from "./tools/count_tokens";

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
    tool(read_url_def, read_url),
    tool(http_request_def, http_request),
    tool(run_tests_def, run_tests),
    tool(get_env_def, get_env),
    tool(diff_files_def, diff_files),
    tool(workspace_symbol_search_def, workspace_symbol_search),
    tool(list_npm_scripts_def, list_npm_scripts),
    tool(get_file_outline_def, get_file_outline),
    tool(count_tokens_def, count_tokens),
  ];
}
